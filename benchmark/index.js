const { Queue } = require('bullmq');
const { Kafka, CompressionTypes } = require('kafkajs');
const amqp = require('amqplib');

const N = parseInt(process.argv[2]) || 10000;

async function testBullMQ(count) {
    const queue = new Queue('benchmark_queue', { connection: { host: 'localhost', port: 6379 } });
    const start = Date.now();
    
    // Batch size for BullMQ
    const batchSize = 1000;
    for (let i = 0; i < count; i += batchSize) {
         const batch = [];
         for(let j=0; j<batchSize && i+j < count; j++) {
             batch.push({ name: 'job', data: { idx: i+j } });
         }
         await queue.addBulk(batch);
    }
    
    const duration = (Date.now() - start) / 1000;
    console.log(`BullMQ: ${count} items in ${duration.toFixed(3)}s => ${(count/duration).toFixed(0)} msg/s`);
    await queue.close();
}

async function testRabbitMQ(count) {
    const conn = await amqp.connect('amqp://localhost');
    const ch = await conn.createConfirmChannel(); // Use confirm channel for fairness
    const q = 'benchmark_queue';
    await ch.assertQueue(q, { durable: true });
    
    const start = Date.now();
    const buff = Buffer.from(JSON.stringify({ idx: 1 }));
    
    // We can't await every single publish, it's too slow. 
    // We should publish many and wait for acks.
    // However, channel.publish returns false if buffer is full.
    
    const publishes = [];
    for(let i=0; i<count; i++) {
        publishes.push(new Promise((resolve, reject) => {
            ch.sendToQueue(q, buff, {}, (err, ok) => {
                if (err) reject(err);
                else resolve(ok);
            });
        }));
        
        // Simple flow control to avoid OOM on millions of promises
        if (i % 5000 === 0) {
             await new Promise(r => setImmediate(r)); 
        }
    }
    
    await Promise.all(publishes);
    
    const duration = (Date.now() - start) / 1000;
    console.log(`RabbitMQ: ${count} items in ${duration.toFixed(3)}s => ${(count/duration).toFixed(0)} msg/s`);
    
    await ch.close();
    await conn.close();
}

async function testKafka(count) {
    const kafka = new Kafka({ 
        clientId: 'bench', 
        brokers: ['localhost:9092'],
        retry: { retries: 2 }
    });
    const producer = kafka.producer();
    await producer.connect();
    
    const start = Date.now();
    const topic = 'benchmark_topic_' + Date.now();
    
    // Batches of 2000 for Kafka (it handles large batches well)
    const batchSize = 2000;
    for (let i = 0; i < count; i += batchSize) {
         const messages = [];
         for(let j=0; j<batchSize && i+j < count; j++) {
             messages.push({ value: JSON.stringify({ idx: i+j }) });
         }
         await producer.send({
             topic,
             messages,
             compression: CompressionTypes.None,
         });
    }

    const duration = (Date.now() - start) / 1000;
    console.log(`Kafka:    ${count} items in ${duration.toFixed(3)}s => ${(count/duration).toFixed(0)} msg/s`);
    
    await producer.disconnect();
}

(async () => {
    console.log(`--- Benchmarking ${N} items ---`);
    // Run sequentially to avoid resource contention affecting results
    try { await testBullMQ(N); } catch(e) { console.log('BullMQ failed:', e.message); }
    try { await testRabbitMQ(N); } catch(e) { console.log('RabbitMQ failed:', e.message); }
    try { await testKafka(N); } catch(e) { console.log('Kafka failed:', e.message); }
    process.exit(0);
})();
