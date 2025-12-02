const request = require("supertest");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const app = require("./index.js");

const db = new sqlite3.Database("./mydb.sqlite");

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
    fs.writeFileSync("./uploads/test.png", "dummy");
    const res = await request(app)
      .post("/upload")
      .attach("image", "./uploads/test.png");
    expect(res.body.status).toBe("uploaded");
    expect(res.body.userId).toBeDefined();
    expect(fs.existsSync(res.body.image)).toBe(true);
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
