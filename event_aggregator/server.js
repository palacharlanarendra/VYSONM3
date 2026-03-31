const express = require('express');
const { Kafka } = require('kafkajs');
const { Sequelize, DataTypes, Op } = require('sequelize');

const app = express();
app.use(express.json());

// Set up SQLite to maintain the aggregate state persistently
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './order_aggregates.sqlite',
    logging: false
});

// Define the OrderAggregate table schema
const OrderAggregate = sequelize.define('order_aggregate', {
    order_id: { type: DataTypes.STRING, primaryKey: true },
    payment_status: { type: DataTypes.STRING, defaultValue: 'PENDING' },
    inventory_status: { type: DataTypes.STRING, defaultValue: 'PENDING' }
}, {
    timestamps: true
});

// Idempotency Tracking schema (Inbox Pattern)
const ProcessedEvent = sequelize.define('processed_event', {
    event_id: { type: DataTypes.STRING, primaryKey: true }
}, {
    timestamps: true
});

const kafka = new Kafka({
    clientId: 'event-aggregator',
    brokers: ['localhost:9092']
});

const consumer = kafka.consumer({ groupId: 'event-aggregator-group' });
const producer = kafka.producer();

async function handleEvent(topic, event) {
    const { order_id, type, event_id } = event;
    if (!order_id) return;

    // Use a transaction to handle race conditions if both events arrive exactly simultaneously
    const transaction = await sequelize.transaction();

    try {
        // --- IDEMPOTENCY CHECK (Inbox Pattern) ---
        if (event_id) {
            const [processedEvent, created] = await ProcessedEvent.findOrCreate({
                where: { event_id },
                defaults: { event_id },
                transaction
            });

            if (!created) {
                console.log(`IDEMPOTENCY - Skipped duplicate event: ${event_id} for Order: ${order_id}`);
                await transaction.rollback();
                return;
            }
        }

        let [aggregate] = await OrderAggregate.findOrCreate({
            where: { order_id },
            defaults: { order_id },
            transaction
        });

        // Update local state based on the topic/event-type
        if (topic === 'PaymentEvents' && type === 'PaymentAuthorized') {
            aggregate.payment_status = 'AUTHORIZED';
            console.log(`[AGGREGATOR] Logged Payment = AUTHORIZED for Order: ${order_id}`);
        } else if (topic === 'InventoryEvents' && type === 'InventoryReserved') {
            aggregate.inventory_status = 'RESERVED';
            console.log(`[AGGREGATOR] Logged Inventory = RESERVED for Order: ${order_id}`);
        }

        await aggregate.save({ transaction });

        // Check if our required workflow condition is strictly met
        if (aggregate.payment_status === 'AUTHORIZED' && aggregate.inventory_status === 'RESERVED') {
            console.log(`\n>>> [AGGREGATOR] Both downstream dependencies met for Order: ${order_id}!`);
            console.log(`>>> Triggering Downstream Action (OrderReadyForShipment_Topic)...\n`);

            await producer.send({
                topic: 'OrderReadyForShipment_Topic',
                messages: [{ value: JSON.stringify({ order_id, status: 'READY_TO_SHIP', timestamp: Date.now() }) }]
            });

            // Optionally, you can update status to 'COMPLETE' to prevent duplicate triggering
            aggregate.payment_status = 'COMPLETE';
            aggregate.inventory_status = 'COMPLETE';
            await aggregate.save({ transaction });
        }

        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        console.error('Error handling aggregate workflow event:', err);
    }
}

async function monitorStaleOrders() {
    // For demo purposes, we define X as 1 minute (60000 ms).
    // In a real application, this could be configured to 15 or 30 minutes.
    const xMinutesAgo = new Date(Date.now() - 60000);

    try {
        const staleOrders = await OrderAggregate.findAll({
            where: {
                createdAt: { [Op.lt]: xMinutesAgo },
                [Op.or]: [
                    { payment_status: 'PENDING' },
                    { inventory_status: 'PENDING' }
                ]
            }
        });

        for (const order of staleOrders) {
            console.log(`\n[TIMEOUT] Order ${order.order_id} has been incomplete for over 1 minute. Triggering manual review.`);

            // Publish event for manual review or cancellation
            await producer.send({
                topic: 'OrderReview_Topic',
                messages: [{
                    value: JSON.stringify({
                        order_id: order.order_id,
                        reason: 'TIMEOUT',
                        payment_status: order.payment_status,
                        inventory_status: order.inventory_status,
                        timestamp: Date.now()
                    })
                }]
            });

            // Mark as CANCELLED so we don't keep picking it up locally
            order.payment_status = 'CANCELLED';
            order.inventory_status = 'CANCELLED';
            await order.save();
        }
    } catch (err) {
        console.error('Error monitoring stale orders:', err);
    }
}

async function startAggregatorWorker() {
    await sequelize.sync();
    await producer.connect();
    await consumer.connect();

    // Subscribe to both upstream domains
    await consumer.subscribe({ topic: 'PaymentEvents', fromBeginning: false });
    await consumer.subscribe({ topic: 'InventoryEvents', fromBeginning: false });

    // Start background poller for stale orders every 10 seconds
    setInterval(monitorStaleOrders, 10000);

    console.log('Event Aggregator running. Listening to Payment and Inventory channels.');

    await consumer.run({
        eachMessage: async ({ topic, message }) => {
            try {
                const event = JSON.parse(message.value.toString());
                await handleEvent(topic, event);
            } catch (err) {
                console.error('Failed to parse incoming event', err);
            }
        }
    });
}

startAggregatorWorker().catch(console.error);

app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'event-aggregator' }));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Event Aggregator HTTP API listening on port ${PORT}`);
});
