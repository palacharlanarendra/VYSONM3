const { Queue } = require('bullmq');

const QUEUE_NAME = 'my_bull_queue';
const REDIS_CONFIG = {
  connection: {
    host: 'localhost',
    port: 6379
  }
};

const myQueue = new Queue(QUEUE_NAME, {
  ...REDIS_CONFIG,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: true, 
    removeOnFail: false     
  }
});

async function main() {
  await myQueue.waitUntilReady();
  console.log(`Connected to queue: ${QUEUE_NAME}`);

  const tasks = [
    { id: 'A', data: 'Regular Task A' },
    { id: 'B', data: 'Regular Task B' },
    { id: 'C', data: 'Regular Task C (Will Fail)' }
  ];

  for (const t of tasks) {
    await myQueue.add('task', t);
  }
  console.log('Added regular tasks (A, B, C)');

  const delayMs = 5000; 
  await myQueue.add('email', { 
    email: 'user@example.com', 
    subject: 'Scheduled Notification' 
  }, {
    delay: delayMs
  });
  console.log(`Scheduled email task for ${delayMs}ms from now`);

  const batchTasks = Array.from({ length: 5 }, (_, i) => ({
    name: 'batch_task',
    data: { id: `batch_${i}`, info: `Batch item ${i}` }
  }));
  
  await myQueue.addBulk(batchTasks);
  console.log(`Added batch of ${batchTasks.length} tasks`);

  await new Promise(r => setTimeout(r, 500));
  
  console.log('Producer finished. Exiting.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Producer failed:', err);
  process.exit(1);
});
