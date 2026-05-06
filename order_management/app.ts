import express, { Request, Response } from "express";
import path from "path";
import { Sequelize, DataTypes } from "sequelize";

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: path.join(__dirname, "data.sqlite"),
  logging: false,
});

const User = sequelize.define(
  "users",
  { email: DataTypes.STRING },
  { timestamps: false }
);
const Product = sequelize.define(
  "products",
  { name: DataTypes.STRING, price: DataTypes.REAL, stock: DataTypes.INTEGER },
  { timestamps: false }
);
const Order = sequelize.define(
  "orders",
  {
    user_id: DataTypes.INTEGER,
    product_id: DataTypes.INTEGER,
    qty: DataTypes.INTEGER,
    amount: DataTypes.REAL,
    status: DataTypes.STRING,
    created_at: DataTypes.STRING,
  },
  { timestamps: false }
);
const Payment = sequelize.define(
  "payments",
  {
    order_id: DataTypes.INTEGER,
    amount: DataTypes.REAL,
    status: DataTypes.STRING,
    txn_id: DataTypes.STRING,
    created_at: DataTypes.STRING,
  },
  { timestamps: false }
);
const InventoryReservation = sequelize.define(
  "inventory_reservations",
  {
    order_id: DataTypes.INTEGER,
    product_id: DataTypes.INTEGER,
    qty: DataTypes.INTEGER,
    status: DataTypes.STRING,
    created_at: DataTypes.STRING,
  },
  { timestamps: false }
);
const Job = sequelize.define(
  "jobs",
  {
    type: DataTypes.STRING,
    payload: DataTypes.TEXT,
    status: DataTypes.STRING,
    created_at: DataTypes.STRING,
  },
  { timestamps: false }
);

sequelize.sync().then(async () => {
  const uc = await User.count();
  if (uc === 0) await User.create({ email: "buyer@example.com" });
  const pc = await Product.count();
  if (pc === 0)
    await Product.create({ name: "Widget", price: 19.99, stock: 100 });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function charge(amount: number, method: string) {
  return new Promise<{ ok: boolean, txnId: string }>((resolve) =>
    setTimeout(() => resolve({ ok: true, txnId: "txn_" + Date.now() }), 100)
  );
}

const app = express();
app.use(express.json());

app.post("/buy", (req: Request, res: Response): any => {
  const { userId, productId, quantity, paymentMethod } = req.body || {};
  if (!userId || !productId || !quantity)
    return res.status(400).json({ error: "bad" });

  (async () => {
    const u = await User.findByPk(userId);
    if (!u) return res.status(404).json({ error: "no_user" });
    const p = await Product.findByPk(productId) as any;
    if (!p) return res.status(404).json({ error: "no_product" });
    if (p.stock < quantity) return res.status(409).json({ error: "no_stock" });
    
    const amt = Number((p.price * quantity).toFixed(2));
    const ts = new Date().toISOString();
    
    const order = await Order.create({
      user_id: userId,
      product_id: productId,
      qty: quantity,
      amount: amt,
      status: "new",
      created_at: ts,
    }) as any;
    
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
  }) as any;
  
  if (!j) return setTimeout(tick, 800);
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

export default app;
