"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const sequelize_1 = require("sequelize");
const sequelize = new sequelize_1.Sequelize({
    dialect: "sqlite",
    storage: path_1.default.join(__dirname, "data.sqlite"),
    logging: false,
});
const User = sequelize.define("users", { email: sequelize_1.DataTypes.STRING }, { timestamps: false });
const Product = sequelize.define("products", { name: sequelize_1.DataTypes.STRING, price: sequelize_1.DataTypes.REAL, stock: sequelize_1.DataTypes.INTEGER }, { timestamps: false });
const Order = sequelize.define("orders", {
    user_id: sequelize_1.DataTypes.INTEGER,
    product_id: sequelize_1.DataTypes.INTEGER,
    qty: sequelize_1.DataTypes.INTEGER,
    amount: sequelize_1.DataTypes.REAL,
    status: sequelize_1.DataTypes.STRING,
    created_at: sequelize_1.DataTypes.STRING,
}, { timestamps: false });
const Payment = sequelize.define("payments", {
    order_id: sequelize_1.DataTypes.INTEGER,
    amount: sequelize_1.DataTypes.REAL,
    status: sequelize_1.DataTypes.STRING,
    txn_id: sequelize_1.DataTypes.STRING,
    created_at: sequelize_1.DataTypes.STRING,
}, { timestamps: false });
const InventoryReservation = sequelize.define("inventory_reservations", {
    order_id: sequelize_1.DataTypes.INTEGER,
    product_id: sequelize_1.DataTypes.INTEGER,
    qty: sequelize_1.DataTypes.INTEGER,
    status: sequelize_1.DataTypes.STRING,
    created_at: sequelize_1.DataTypes.STRING,
}, { timestamps: false });
const Job = sequelize.define("jobs", {
    type: sequelize_1.DataTypes.STRING,
    payload: sequelize_1.DataTypes.TEXT,
    status: sequelize_1.DataTypes.STRING,
    created_at: sequelize_1.DataTypes.STRING,
}, { timestamps: false });
sequelize.sync().then(async () => {
    const uc = await User.count();
    if (uc === 0)
        await User.create({ email: "buyer@example.com" });
    const pc = await Product.count();
    if (pc === 0)
        await Product.create({ name: "Widget", price: 19.99, stock: 100 });
});
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function charge(amount, method) {
    return new Promise((resolve) => setTimeout(() => resolve({ ok: true, txnId: "txn_" + Date.now() }), 100));
}
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.post("/buy", (req, res) => {
    const { userId, productId, quantity, paymentMethod } = req.body || {};
    if (!userId || !productId || !quantity)
        return res.status(400).json({ error: "bad" });
    (async () => {
        const u = await User.findByPk(userId);
        if (!u)
            return res.status(404).json({ error: "no_user" });
        const p = await Product.findByPk(productId);
        if (!p)
            return res.status(404).json({ error: "no_product" });
        if (p.stock < quantity)
            return res.status(409).json({ error: "no_stock" });
        const amt = Number((p.price * quantity).toFixed(2));
        const ts = new Date().toISOString();
        const order = await Order.create({
            user_id: userId,
            product_id: productId,
            qty: quantity,
            amount: amt,
            status: "new",
            created_at: ts,
        });
        await InventoryReservation.create({
            order_id: order.id,
            product_id: productId,
            qty: quantity,
            status: "reserved",
            created_at: ts,
        });
        const pay = await charge(amt, paymentMethod);
        await Payment.create({
            order_id: order.id,
            amount: amt,
            status: pay.ok ? "ok" : "fail",
            txn_id: pay.txnId,
            created_at: ts,
        });
        await p.decrement("stock", { by: quantity });
        const payload = JSON.stringify({
            orderId: order.id,
            userId,
            productId,
            quantity,
            amount: amt,
            productName: p.name,
        });
        for (const t of [
            "email",
            "warehouse",
            "analytics",
            "seller_notification",
            "invoice",
        ]) {
            await Job.create({ type: t, payload, status: "queued", created_at: ts });
        }
        await Order.update({ status: "confirmed" }, { where: { id: order.id } });
        return res.json({ ok: true, id: order.id });
    })();
});
async function tick() {
    const j = await Job.findOne({
        where: { status: "queued" },
        order: [["id", "ASC"]],
    });
    if (!j)
        return setTimeout(tick, 800);
    j.status = "done";
    await j.save();
    setImmediate(tick);
}
if (require.main === module) {
    const port = process.env.PORT || 4000;
    app.listen(port, () => {
        console.log("order " + port);
    });
    tick();
}
exports.default = app;
