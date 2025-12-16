const sqlite3 = require("sqlite3").verbose();
const sharp = require("sharp");
const path = require("path");
const { createClient } = require("redis");

const db = new sqlite3.Database("./mydb.sqlite");

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
      else console.log(`Thumbnail generated for user ${userId}`);
    }
  );
}

async function main() {
  const subscriber = createClient();
  await subscriber.connect();
  await subscriber.subscribe("image_uploaded", async (message) => {
    try {
      const data = JSON.parse(message);
      await generate_thumbnail(data);
    } catch (e) {
      console.error("Subscriber thumbnail error:", e);
    }
  });
}

main();
