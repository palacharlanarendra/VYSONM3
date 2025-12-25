const { Worker } = require('bullmq');

const QUEUE_NAME = 'my_bull_queue';
const REDIS_CONFIG = {
  connection: {
    host: 'localhost',
    port: 6379
  }
};

const worker = new Worker(QUEUE_NAME, async job => {
  switch (job.name) {
    case 'email':
      console.log(`[Email Service] Sending to ${job.data.email}: ${job.data.subject}`);
      break;

    case 'batch_task':
      console.log(`[Batch Processor] Handling item ${job.data.id}`);
      break;

    case 'task':
    default:
      if (job.data.id === 'C') {
        throw new Error('Simulated processing error for Task C');
      }
      console.log(`[Standard Task] Processed ${job.data.id}`);
      break;
  }
}, REDIS_CONFIG);

worker.on('failed', (job, err) => {
  console.warn(`Job ${job.id} failed (Attempt ${job.attemptsMade}): ${err.message}`);
});

worker.on('error', err => {
  console.error('Worker internal error:', err);
});

console.log(`BullMQ Worker started on queue: ${QUEUE_NAME}`);
