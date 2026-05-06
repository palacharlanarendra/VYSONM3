"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const multer_1 = __importDefault(require("multer"));
const sharp_1 = __importDefault(require("sharp"));
const path_1 = __importDefault(require("path"));
const sqlite3Verbose = sqlite3_1.default.verbose();
const db = new sqlite3Verbose.Database("./mydb.sqlite");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.get("/health", (req, res) => {
    return res.json({ status: "ok", timestamp: new Date().toISOString() });
});
const storage = multer_1.default.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "./uploads");
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + "-" + file.originalname;
        cb(null, uniqueName);
    },
});
const upload = (0, multer_1.default)({ storage: storage });
app.post("/sync", async (req, res) => {
    console.log("Sync start:", new Date().toISOString());
    // simulate slow blocking task
    await new Promise((resolve) => setTimeout(resolve, 3000));
    console.log("Sync end:", new Date().toISOString());
    return res.json({ status: "success" });
});
app.post("/async", (req, res) => {
    console.log("Async start:", new Date().toISOString());
    new Promise((resolve) => setTimeout(() => resolve("Async task finished:"), 3000)).then((msg) => {
        console.log(msg, new Date().toISOString());
    });
    return res.json({ status: "accepted" });
});
app.post("/upload", upload.single("image"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
    }
    const imagePath = req.file.path;
    const query = `INSERT INTO users (image, thumbnail) VALUES (?, NULL)`;
    db.run(query, [imagePath], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        return res.json({
            status: "uploaded",
            userId: this.lastID,
            image: imagePath,
        });
    });
});
// eslint-disable-next-line prefer-const
let queue = [];
app.post("/enqueue", (req, res) => {
    db.all("SELECT * FROM users WHERE image IS NOT NULL AND thumbnail IS NULL", (err, rows) => {
        if (err)
            return res.status(500).json({ error: err.message });
        if (rows.length === 0) {
            return res.json({ status: "nothing_to_queue" });
        }
        rows.forEach((user) => {
            queue.push({
                userId: user.id,
                imagePath: user.image,
                addedAt: Date.now(),
            });
            console.log(`Task queued for user ${user.id}`);
        });
        return res.json({
            status: "queued_all",
            count: rows.length,
        });
    });
});
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function worker() {
    if (queue.length === 0) {
        return setTimeout(worker, 1000);
    }
    const task = queue.shift();
    console.log(`Worker picked task for user ${task.userId}`);
    try {
        const ext = path_1.default.extname(task.imagePath);
        const base = path_1.default.basename(task.imagePath, ext);
        const thumbPath = `thumbnails/${base}_thumb${ext}`;
        await (0, sharp_1.default)(task.imagePath).resize(300, 300).toFile(thumbPath);
        db.run(`UPDATE users SET thumbnail = ? WHERE id = ?`, [thumbPath, task.userId], (err) => {
            if (err)
                console.error("DB update error:", err);
            else
                console.log(`Thumbnail generated for user ${task.userId}`);
        });
    }
    catch (error) {
        console.error("Error processing task:", error);
    }
    setImmediate(worker);
}
if (require.main === module) {
    app.listen(3000, () => {
        console.log("Server running on port 3000");
    });
}
// Start the worker
worker();
exports.default = app;
