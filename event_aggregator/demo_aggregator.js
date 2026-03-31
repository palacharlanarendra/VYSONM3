const { Kafka } = require('kafkajs');

const kafka = new Kafka({
    clientId: 'workflow-demo',
    brokers: ['localhost:9092']
});

const producer = kafka.producer();
const admin = kafka.admin();

async function simulate() {
    await admin.connect();
    await admin.createTopics({
        topics: [
            { topic: 'InventoryEvents', numPartitions: 1 },
            { topic: 'PaymentEvents', numPartitions: 1 },
            { topic: 'OrderReadyForShipment_Topic', numPartitions: 1 },
            { topic: 'OrderReview_Topic', numPartitions: 1 }
        ],
        waitForLeaders: true,
    });
    console.log('Ensured all Kafka topics exist.');
    await admin.disconnect();

    await producer.connect();
    console.log('Connected to Kafka for simulation.');

    const orderId = 'ORD-' + Math.floor(Math.random() * 10000);

    console.log(`\n--- Simulating Event Chaining for ${orderId} ---\n`);

    const inventoryEventId = 'EVT-INV-' + Date.now();
    const paymentEventId = 'EVT-PAY-' + Date.now();

    // 1. Simulate Inventory arriving first
    console.log(`1. Simulating [InventoryReserved] event...`);
    await producer.send({
        topic: 'InventoryEvents',
        messages: [{ value: JSON.stringify({ event_id: inventoryEventId, order_id: orderId, type: 'InventoryReserved' }) }]
    });

    // What if a duplicate arrived due to a consumer retry or network blip? Let's simulate that!
    setTimeout(async () => {
        console.log(`\n[Simulating Network Retry] Sending DUPLICATE Inventory event...`);
        await producer.send({
            topic: 'InventoryEvents',
            messages: [{ value: JSON.stringify({ event_id: inventoryEventId, order_id: orderId, type: 'InventoryReserved' }) }]
        });
    }, 1000);

    // We introduce a delay to watch the aggregator state update
    setTimeout(async () => {
        console.log(`\n2. Simulating [PaymentAuthorized] event later...`);
        await producer.send({
            topic: 'PaymentEvents',
            messages: [{ value: JSON.stringify({ event_id: paymentEventId, order_id: orderId, type: 'PaymentAuthorized', amount: 50.00 }) }]
        });
        console.log(`Sent Payment event. Watch the aggregator log for downstream trigger!\n`);
    }, 4000);

}

simulate().catch(console.error);

process.on('SIGINT', async () => {
    await producer.disconnect();
    process.exit(0);
});
