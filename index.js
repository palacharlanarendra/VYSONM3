const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./mydb.sqlite");
const multer = require("multer");
const cron = require("node-cron");
const sharp = require("sharp");
const path = require("path");

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

    return res.json({
      status: "uploaded",
      userId: this.lastID,
      image: imagePath,
    });
  });
});

cron.schedule("* * * * *", () => {
  console.log("Cron: Checking for users needing thumbnail...");

  db.all(
    `SELECT * FROM users WHERE image IS NOT NULL AND thumbnail IS NULL`,
    async (err, rows) => {
      if (err) return console.error("DB Error:", err);

      for (const user of rows) {
        try {
          const originalImagePath = user.image;

          // Extract filename + extension
          const originalName = path.basename(originalImagePath);
          const ext = path.extname(originalName);
          const name = path.basename(originalName, ext);

          // Create thumbnail path
          const thumbName = `${name}_thumb${ext}`;
          const thumbPath = `thumbnails/${thumbName}`;

          // Generate thumbnail
          await sharp(originalImagePath).resize(300, 300).toFile(thumbPath);

          // Update database
          db.run(
            `UPDATE users SET thumbnail = ? WHERE id = ?`,
            [thumbPath, user.id],
            (err) => {
              if (err) console.error("Error updating DB:", err);
              else console.log(`Thumbnail created for user ${user.id}`);
            }
          );
        } catch (error) {
          console.error("Error generating thumbnail:", error);
        }
      }
    }
  );
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
