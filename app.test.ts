import request from "supertest";
import sqlite3 from "sqlite3";
import fs from "fs";
import app from "./index";

const sqlite3Verbose = sqlite3.verbose();
const db = new sqlite3Verbose.Database("./mydb.sqlite");

describe("Queue Thumbnail System Tests", () => {
  beforeAll(() => {
    if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");
    if (!fs.existsSync("./thumbnails")) fs.mkdirSync("./thumbnails");
  });

  beforeEach((done) => {
    db.run("DELETE FROM users", done);
  });

  test("POST /sync waits ~3s", async () => {
    const start = Date.now();
    const res = await request(app).post("/sync");
    const diff = Date.now() - start;
    expect(res.body.status).toBe("success");
    expect(diff).toBeGreaterThanOrEqual(3000);
  });

  test("POST /async returns immediately", async () => {
    const start = Date.now();
    const res = await request(app).post("/async");
    const diff = Date.now() - start;
    expect(res.body.status).toBe("accepted");
    expect(diff).toBeLessThan(500);
  });

  test("POST /upload saves image and inserts db row", async () => {
    const base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    fs.writeFileSync("./uploads/test.png", Buffer.from(base64Image, "base64"));
    const res = await request(app)
      .post("/upload")
      .attach("image", "./uploads/test.png");
    expect(res.body.status).toBe("uploaded");
    expect(res.body.userId).toBeDefined();
    expect(fs.existsSync(res.body.image)).toBe(true);
  });

  test("POST /upload fails if no image is attached", async () => {
    const res = await request(app).post("/upload");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No image uploaded");
  });

  test("POST /enqueue returns nothing_to_queue when db is empty", async () => {
    const res = await request(app).post("/enqueue");
    expect(res.body.status).toBe("nothing_to_queue");
  });

  test("POST /enqueue queues tasks", (done) => {
    db.run(
      `INSERT INTO users (image, thumbnail) VALUES (?, NULL)`,
      ["uploads/test.png"],
      async () => {
        const res = await request(app).post("/enqueue");
        expect(res.body.status).toBe("queued_all");
        expect(res.body.count).toBe(1);
        done();
      }
    );
  });

  test("Worker processes queued tasks and updates DB", (done) => {
    // 1. Insert a mock user
    db.run(
      `INSERT INTO users (image, thumbnail) VALUES (?, NULL)`,
      ["uploads/test.png"],
      async function () {
        const userId = this.lastID;
        // 2. Enqueue the task
        await request(app).post("/enqueue");

        // 3. Wait for worker to process (worker runs every 1s or on setImmediate)
        setTimeout(() => {
          db.get(
            "SELECT thumbnail FROM users WHERE id = ?",
            [userId],
            (err, row: any) => {
              expect(row.thumbnail).not.toBeNull();
              expect(row.thumbnail).toContain("thumbnails/test_thumb");
              done();
            }
          );
        }, 2000);
      }
    );
  });
});
