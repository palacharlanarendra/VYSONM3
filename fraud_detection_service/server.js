const express = require('express');
const { Kafka } = require('kafkajs');

const app = express();
app.use(express.json());

const kafka = new Kafka({
    clientId: 'fraud-detection-service',
    brokers: ['localhost:9092']
});

const consumer = kafka.consumer({ groupId: 'fraud-detection-group' });

async function startFraudService() {
    await consumer.connect();
    console.log('Fraud Detection Service connected to Kafka Broker');

    await consumer.subscribe({ topic: 'OrderPlaced_Topic', fromBeginning: false });

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            try {
                const eventData = message.value.toString();
                const event = JSON.parse(eventData);

                console.log(`[FRAUD SERVICE] Received Order Event`);

                const version = event.event_version || 1;

                if (version < 2) {
                    // Fallback for older schemas lacking fraud fields
                    console.log(`WARNING: Received v${version} schema.`);
                    console.log(`   Order ${event.order_id} does NOT contain new fraud detection fields.`);
                    return;
                }

                console.log(`Schema Version v${version} accepted.`);
                console.log(`   Running advanced fraud analysis for Order: ${event.order_id}`);
                console.log(`   - Device Fingerprint : ${event.device_fingerprint}`);
                console.log(`   - IP Address         : ${event.ip_address}`);
                console.log(`   - Payment Method BIN : ${event.payment_method_bin}`);

                // Basic fraud detection rules
                if (event.payment_method_bin === '000000' || event.ip_address === '9.9.9.9') {
                    console.log(`FRAUD ALERT: Order ${event.order_id} flagged as fraudulent!`);
                } else {
                    console.log(`Check Passed: Order ${event.order_id} looks legitimate.`);
                }

            } catch (err) {
                console.error('Error processing message:', err);
            }
        },
    });
}

startFraudService().catch(console.error);

app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'fraud-detection' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Fraud Detection Service HTTP API listening on port ${PORT}`);
});
