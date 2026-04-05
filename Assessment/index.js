// Let’s now design the backend for a **banking system** that processes **real-time customer transactions**:

// - Debit / Credit
// - Balance updates must be **immediate**
// - Fraud must be detected **before money leaves**
// - System must handle **retries, failures, duplicates**
// - Auditability is mandatory

// You will progressively evolve the system across the assessment.

// [Q6] Design the **synchronous transaction API**

// Design an endpoint:

// ```
// POST /transactions
// ```

// Payload:

// ```json
// {
// 	"transaction_id":"txn_123",
// 	"account_id":"acc_456",
// 	"type":"DEBIT",
// 	"amount":2500
// }
// ```

// from the route to api handler we send the payload, thats the above json.

async function transactionHandler(req, _res) {
    const { transaction_id, account_id, type, amount, timestamp } = req.body;

    // so lets send a balance check on the account 

    const accountBalance = await db.get(`SELECT balance FROM accounts WHERE account_id = ?`, [account_id]);

    const transactionsById = await db.get(`SELECT * FROM transactions WHERE transaction_id = ?`, [transaction_id]);

    // idempotency check, so pending or failed will can be attempted by user again from 'retryTransaction'
    if (!transactionsById && transactionsById.status === "SUCCESS") {
        return res.status(400).json({ error: "Transaction already exists" });
    }


    if (accountBalance.balance < amount) {
        db.rollback();
        return res.status(400).json({ error: "Insufficient balance" });
    }

    if (type === "DEBIT" && accountBalance.balance >= amount) {
        const newBalance = accountBalance.balance - amount;
        await db.run('UPDATE accounts SET balance=? WHERE account_id=?', [newBalance, account_id]);
        await db.run('INSERT INTO transactions (transaction_id, account_id, type, amount, new_balance) VALUES (?, ?, ?, ?, ?)', [transaction_id, account_id, type, amount, newBalance]);
        publishEvent({ transaction_id, account_id, type, amount, newBalance });
        return res.status(200).json({ message: "Transaction successful" });
    }

    if (type === "CREDIT") {
        const newBalance = accountBalance.balance + amount;
        await db.run('UPDATE accounts SET balance=? WHERE account_id=?', [newBalance, account_id]);
        await db.run('INSERT INTO transactions (transaction_id, account_id, type, amount, new_balance) VALUES (?, ?, ?, ?, ?)', [transaction_id, account_id, type, amount, newBalance]);
        return res.status(200).json({ message: "Transaction successful" });
    }

    if (type === "DEBIT" && amount >= 50000) {
        return res.status(400).json({ error: "Transaction amount is too large" });
    }
}
// this should be triggered by the user when transction is failed
async function retryTransaction(req, _res) {
    transactionHandler(req, _res);
}
// this can be called when transaction is sucessful
async function publishEvent(event) {
    // publish event to kafka
    await producer.send({
        topic: "transcations",
        message: {
            event_id: user_id,
            payload: JSON.stringify(event),
            timestamp: Date.now(),
        }
    })
}

// that would be some thing like this 

function TransactionRate(event) {
    const transactions = db.get(`SELECT * FROM transactions WHERE account_id = ? AND timestamp-Date.now() < 60000`, [event.account_id]);
    return transactions.length > 5;
}

if (type === "DEBIT" && amount >= 50000 && TransactionRate(event)) {
    return res.status(400).json({ error: "Transaction amount is too large" });
}