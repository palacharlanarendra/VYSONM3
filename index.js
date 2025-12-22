const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const axios = require("axios");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./mydb.sqlite");
const multer = require("multer");
const cron = require("node-cron");
const sharp = require("sharp");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Leaderboard state
let leaderboard = [];
let sseClients = [];

// WebSocket connection
wss.on("connection", (ws) => {
  console.log("New client connected");
  ws.send(JSON.stringify({ type: "leaderboard", data: leaderboard }));
  
  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

function broadcastLeaderboard() {
  const data = JSON.stringify({ type: "leaderboard", data: leaderboard });
  
  // Broadcast to WebSocket clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });

  // Broadcast to SSE clients
  sseClients.forEach((res) => {
    res.write(`data: ${data}\n\n`);
  });
}

// [Q10] SSE Endpoint
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send initial data
  const data = JSON.stringify({ type: "leaderboard", data: leaderboard });
  res.write(`data: ${data}\n\n`);

  sseClients.push(res);

  req.on("close", () => {
    sseClients = sseClients.filter((client) => client !== res);
  });
});

// Long Polling state
const pendingResponses = {}; // userId -> res

app.use(express.json());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads");
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage: storage });

app.post("/sync", async (req, res) => {
  console.log("Sync start:", new Date().toISOString());

  // simulate slow blocking task
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("Sync end:", new Date().toISOString());

  return res.json({ status: "success" });
});

app.post("/async", (req, res) => {
  console.log("Async start:", new Date().toISOString());

  new Promise((resolve) =>
    setTimeout(() => resolve("Async task finished:"), 3000)
  ).then((msg) => {
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

    ps.publish("image_uploaded", { userId: this.lastID, imagePath });

    return res.json({
      status: "uploaded",
      userId: this.lastID,
      image: imagePath,
    });
  });
});

// [Q1] Polling Endpoint
app.get("/status/:userId", (req, res) => {
  const userId = req.params.userId;
  db.get("SELECT thumbnail FROM users WHERE id = ?", [userId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "User not found" });

    if (row.thumbnail) {
      return res.json({ status: "done", thumbnail: row.thumbnail });
    } else {
      return res.json({ status: "pending" });
    }
  });
});

// [Q2] Long Polling Endpoint
app.get("/poll/:userId", (req, res) => {
  const userId = req.params.userId;
  
  // Check if already done
  db.get("SELECT thumbnail FROM users WHERE id = ?", [userId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "User not found" });

    if (row.thumbnail) {
      return res.json({ status: "done", thumbnail: row.thumbnail });
    } else {
      // Not done, wait
      // [Q3] Timeout mechanism
      const timeout = setTimeout(() => {
        if (pendingResponses[userId]) {
          pendingResponses[userId].json({ status: "pending" });
          delete pendingResponses[userId];
        }
      }, 10000); // 10 seconds timeout

      pendingResponses[userId] = res;
      // Attach timeout to res so we can clear it if needed
      res.timeout = timeout;
    }
  });
});

// [Q5] Leaderboard Score Posting
app.post("/score", (req, res) => {
  const { username, score } = req.body;
  if (!username || score === undefined) {
    return res.status(400).json({ error: "Missing username or score" });
  }

  // Update leaderboard (simple in-memory sort)
  leaderboard.push({ username, score });
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, 10); // Top 10

  broadcastLeaderboard();

  return res.json({ status: "success", leaderboard });
});

// [Q8] Webhook receiver (mock 3rd party)
app.post("/mock-analytics", (req, res) => {
  console.log("Received webhook analytics:", req.body);
  res.json({ received: true });
});

async function sendAnalyticsWebhook(data) {
  try {
    const addr = server.address();
    const port = addr && typeof addr === 'object' ? addr.port : 3000;
    
    // In a real app, this URL would be from configuration
    await axios.post(`http://localhost:${port}/mock-analytics`, {
      event: "image_uploaded",
      data: data,
      timestamp: Date.now()
    });
    console.log("Analytics webhook sent");
  } catch (error) {
    console.error("Failed to send webhook:", error.message);
  }
}


// cron.schedule("* * * * *", () => {
//   console.log("Cron: Checking for users needing thumbnail...");

//   db.all(
//     `SELECT * FROM users WHERE image IS NOT NULL AND thumbnail IS NULL`,
//     async (err, rows) => {
//       if (err) return console.error("DB Error:", err);

//       for (const user of rows) {
//         try {
//           const originalImagePath = user.image;

//           // Extract filename + extension
//           const originalName = path.basename(originalImagePath);
//           const ext = path.extname(originalName);
//           const name = path.basename(originalName, ext);

//           // Create thumbnail path
//           const thumbName = `${name}_thumb${ext}`;
//           const thumbPath = `thumbnails/${thumbName}`;

//           // Generate thumbnail
//           await sharp(originalImagePath).resize(300, 300).toFile(thumbPath);

//           // Update database
//           db.run(
//             `UPDATE users SET thumbnail = ? WHERE id = ?`,
//             [thumbPath, user.id],
//             (err) => {
//               if (err) console.error("Error updating DB:", err);
//               else console.log(`Thumbnail created for user ${user.id}`);
//             }
//           );
//         } catch (error) {
//           console.error("Error generating thumbnail:", error);
//         }
//       }
//     }
//   );
// });

let queue = [];

let createClient;
try {
  ({ createClient } = require("redis"));
} catch (e) {}

class PubSub {
  constructor() {
    this.subscribers = {};
    this.useRedis = false;
    this.publisher = null;
    this.subscriber = null;
    if (createClient) {
      try {
        this.publisher = createClient();
        this.subscriber = createClient();
        this.publisher
          .connect()
          .then(() => {
            this.useRedis = true;
          })
          .catch(() => {});
        this.subscriber
          .connect()
          .then(() => {
            this.subscriber.subscribe("image_uploaded", (message) => {
              try {
                const data = JSON.parse(message);
                queue.push({ event: "image_uploaded", data, addedAt: Date.now() });
              } catch (e) {}
            });
          })
          .catch(() => {});
      } catch (e) {}
    }
  }

  subscribe(event, fn) {
    this.subscribers[event] = this.subscribers[event] || [];
    this.subscribers[event].push(fn);
  }

  publish(event, data) {
    if (this.useRedis && this.publisher) {
      this.publisher
        .publish(event, JSON.stringify(data))
        .catch(() => {
          queue.push({ event, data, addedAt: Date.now() });
        });
    } else {
      queue.push({ event, data, addedAt: Date.now() });
    }
  }
}

const ps = new PubSub();

  app.post("/enqueue", (req, res) => {
    db.all(
      "SELECT * FROM users WHERE image IS NOT NULL AND thumbnail IS NULL",
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

      if (rows.length === 0) {
        return res.json({ status: "nothing_to_queue" });
      }

        rows.forEach((user) => {
          ps.publish("image_uploaded", { userId: user.id, imagePath: user.image });
          console.log(`Event queued image_uploaded for user ${user.id}`);
        });

      return res.json({
        status: "queued_all",
        count: rows.length,
      });
    }
  );
});

let workersRunning = true;

async function workerLoop(name) {
  if (!workersRunning) return;

  if (queue.length === 0) {
    return setTimeout(() => workerLoop(name), 1000);
  }

  const task = queue.shift();
  if (!task || !task.event) {
    return setImmediate(() => workerLoop(name));
  }

  const data = task.data || {};
  const pickedImage = path.basename(data.imagePath || "");
  console.log(`${name} picked image ${pickedImage} for user ${data.userId}`);

  try {
    const fns = ps.subscribers[task.event] || [];
    for (const fn of fns) {
      await fn(data);
    }
  } catch (error) {
    console.error(`${name} error processing task:`, error);
  }

  setImmediate(() => workerLoop(name));
}

function stopWorkers() {
  workersRunning = false;
}

function worker1() {
  workerLoop("worker1");
}

function worker2() {
  workerLoop("worker2");
}

worker1();
worker2();

if (require.main === module) {
  server.listen(3000, () => {
    console.log("Server running on port 3000");
  });
}

module.exports = server;
module.exports.stopWorkers = stopWorkers;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generate_thumbnail({ userId, imagePath }) {
  const ext = path.extname(imagePath);
  const base = path.basename(imagePath, ext);
  const thumbPath = `thumbnails/${base}_thumb${ext}`;

  await sharp(imagePath).resize(300, 300).toFile(thumbPath);

  db.run(
    `UPDATE users SET thumbnail = ? WHERE id = ?`,
    [thumbPath, userId],
    (err) => {
      if (err) console.error("DB update error:", err);
      else {
        console.log(`Thumbnail generated for user ${userId}`);
        
        // Resolve long polling if any
        if (pendingResponses[userId]) {
          const res = pendingResponses[userId];
          clearTimeout(res.timeout);
          res.json({ status: "done", thumbnail: thumbPath });
          delete pendingResponses[userId];
        }
      }
    }
  );
}

async function log_upload({ userId, imagePath }) {
  await sleep(1000);
  console.log(`Logged upload for user ${userId}`);
}

async function notify_admin({ userId, imagePath }) {
  await sleep(2000);
  console.log(`Admin notified for user ${userId}`);
}

ps.subscribe("image_uploaded", generate_thumbnail);
ps.subscribe("image_uploaded", log_upload);
ps.subscribe("image_uploaded", notify_admin);
ps.subscribe("image_uploaded", sendAnalyticsWebhook);
