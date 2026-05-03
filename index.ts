import express, { Request, Response } from "express";
import sqlite3 from "sqlite3";
import multer from "multer";
import sharp from "sharp";
import path from "path";

const sqlite3Verbose = sqlite3.verbose();
const db = new sqlite3Verbose.Database("./mydb.sqlite");

const app = express();
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

app.post("/sync", async (req: Request, res: Response) => {
  console.log("Sync start:", new Date().toISOString());

  // simulate slow blocking task
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("Sync end:", new Date().toISOString());

  return res.json({ status: "success" });
});

app.post("/async", (req: Request, res: Response) => {
  console.log("Async start:", new Date().toISOString());

  new Promise((resolve) =>
    setTimeout(() => resolve("Async task finished:"), 3000)
  ).then((msg) => {
    console.log(msg, new Date().toISOString());
  });

  return res.json({ status: "accepted" });
});

app.post("/upload", upload.single("image"), (req: Request, res: Response) => {
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
let queue: any[] = [];

app.post("/enqueue", (req: Request, res: Response) => {
  db.all(
    "SELECT * FROM users WHERE image IS NOT NULL AND thumbnail IS NULL",
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      if (rows.length === 0) {
        return res.json({ status: "nothing_to_queue" });
      }

      rows.forEach((user: any) => {
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
    }
  );
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function worker() {
  if (queue.length === 0) {
    return setTimeout(worker, 1000);
  }

  const task = queue.shift();
  console.log(`Worker picked task for user ${task.userId}`);

  try {
    const ext = path.extname(task.imagePath);
    const base = path.basename(task.imagePath, ext);
    const thumbPath = `thumbnails/${base}_thumb${ext}`;

    await sharp(task.imagePath).resize(300, 300).toFile(thumbPath);

    db.run(
      `UPDATE users SET thumbnail = ? WHERE id = ?`,
      [thumbPath, task.userId],
      (err) => {
        if (err) console.error("DB update error:", err);
        else console.log(`Thumbnail generated for user ${task.userId}`);
      }
    );
  } catch (error) {
    console.error("Error processing task:", error);
  }

  setImmediate(worker);
}

if (require.main === module) {
  app.listen(3000, () => {
    console.log("Server running on port 3000");
  });
}

export default app;
