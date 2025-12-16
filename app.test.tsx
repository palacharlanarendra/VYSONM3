const request = require("supertest");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const app = require("./index.js");

const db = new sqlite3.Database("./mydb.sqlite");

describe("Queue Thumbnail System Tests", () => {
  jest.setTimeout(20000);
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
    fs.writeFileSync("./uploads/test.png", "dummy");
    const res = await request(app)
      .post("/upload")
      .attach("image", "./uploads/test.png");
    expect(res.body.status).toBe("uploaded");
    expect(res.body.userId).toBeDefined();
    expect(fs.existsSync(res.body.image)).toBe(true);
  });

  async function waitFor(check: () => any, timeout = 10000, interval = 100) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const r = await check();
      if (r) return;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error("timeout");
  }

  test("Workers create thumbnail after upload", async () => {
    fs.writeFileSync("./uploads/test2.png", "dummy");
    const res = await request(app)
      .post("/upload")
      .attach("image", "./uploads/test2.png");
    const userId = res.body.userId;
    const image = res.body.image;
    const ext = path.extname(image);
    const base = path.basename(image, ext);
    const thumbPath = `thumbnails/${base}_thumb${ext}`;

    await waitFor(() => fs.existsSync(thumbPath));

    await waitFor(
      () =>
        new Promise((resolve) => {
          db.get(
            "SELECT thumbnail FROM users WHERE id = ?",
            [userId],
            (err: Error, row: any) => {
              resolve(row && row.thumbnail);
            }
          );
        })
    );

    expect(fs.existsSync(thumbPath)).toBe(true);
  });

  test("Subscribers run for image_uploaded (log and notify)", async () => {
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (...args: any[]) => {
      logs.push(args.join(" "));
      originalLog(...args);
    };

    try {
      fs.writeFileSync("./uploads/test3.png", "dummy");
      const res = await request(app)
        .post("/upload")
        .attach("image", "./uploads/test3.png");
      const userId = res.body.userId;

      await waitFor(() => logs.some((l) => l.includes(`Logged upload for user ${userId}`)));
      await waitFor(() => logs.some((l) => l.includes(`Admin notified for user ${userId}`)));
    } finally {
      console.log = originalLog;
    }
  });

  test("POST /enqueue queues tasks", (done) => {
    db.run(
      `INSERT INTO users (image, thumbnail) VALUES (?, NULL)`,
      ["uploads/test.png"],
      () => {
        request(app)
          .post("/enqueue")
          .end((err: Error, res: any) => {
            expect(res.body.status).toBe("queued_all");
            expect(res.body.count).toBe(1);
            done();
          });
      }
    );
  });
});
