const { createClient } = require("redis");

async function processTask(task, queueName) {
  console.log(`[${queueName}] Processing ${task.id}...`);
  
  if (task.id === "C") {
    throw new Error(`Error encountered in ${queueName}`);
  }
  
  console.log(`[${queueName}] Successfully processed ${task.id}`);
}

async function startWorker(sourceQueue, targetQueue, delayMs) {
  const subscriber = createClient();
  const producer = createClient();

  subscriber.on('error', err => console.error(`[${sourceQueue}] Redis Subscriber Error:`, err));
  producer.on('error', err => console.error(`[${sourceQueue}] Redis Producer Error:`, err));

  await subscriber.connect();
  await producer.connect();

  console.log(`Worker initialized: ${sourceQueue} -> ${targetQueue || "Final Failure"}`);

  while (true) {
    try {
      const result = await subscriber.blPop(sourceQueue, 0);
      if (!result) continue;

      const task = JSON.parse(result.element);

      try {
        await processTask(task, sourceQueue);
      } catch (err) {
        console.error(`[${sourceQueue}] Failed ${task.id}: ${err.message}`);
        
        if (targetQueue) {
          console.log(`[${sourceQueue}] Applying backoff of ${delayMs}ms before moving to ${targetQueue}...`);
          
          await new Promise(r => setTimeout(r, delayMs));
          
          if (targetQueue === "dead_letter_queue") {
             console.log(`[ALERT] Task ${task.id} has exhausted all retries. Moving to DLQ.`);
          }

          await producer.rPush(targetQueue, JSON.stringify(task));
          console.log(`[${sourceQueue}] Moved ${task.id} to ${targetQueue}`);
        } else {
           console.log(`[${sourceQueue}] Task ${task.id} failed. No retry strategy defined.`);
        }
      }
    } catch (err) {
      console.error(`[${sourceQueue}] Infrastructure Error:`, err);
      if (err.message.includes('Closed')) break; 
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function main() {
  const client = createClient();
  await client.connect();
  const queuesToClear = ["main_queue", "retry_queue_1", "retry_queue_2", "retry_queue_3", "dead_letter_queue"];
  for (const q of queuesToClear) {
    await client.del(q);
  }
  await client.disconnect();
  console.log("Cleaned up previous queue states.");

  const pipeline = [
    startWorker("main_queue", "retry_queue_1", 1000),
    startWorker("retry_queue_1", "retry_queue_2", 2000),
    startWorker("retry_queue_2", "retry_queue_3", 4000),
    startWorker("retry_queue_3", "dead_letter_queue", 0)
  ];

  await Promise.all(pipeline);
}

main().catch(console.error);
