const { createClient } = require("redis");

async function processTask(task) {
  console.log(`Processing ${task.id}...`);
  
  if (task.id === "C") {
    throw new Error("Simulated error for C");
  }
  
  console.log(`Processed ${task.id}`);
}

async function main() {
  const client = createClient();
  
  client.on('error', (err) => console.error('Redis Client Error', err));
  
  await client.connect();
  console.log("Worker started and listening for tasks...");

  while (true) {
    try {
      const result = await client.blPop("main_queue", 0);
      
      if (!result) continue;

      const task = JSON.parse(result.element);

      try {
        await processTask(task);
      } catch (err) {
        console.error(`Error processing ${task.id}: ${err.message}`);
        
        await client.rPush("main_queue", JSON.stringify(task));
        console.log(`Re-enqueued ${task.id} to the back of the queue`);

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error("Critical Worker Error:", err);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

main().catch(console.error);
