const request = require("supertest");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const WebSocketClient = require("ws");
const server = require("./index.js");

const db = new sqlite3.Database("./mydb.sqlite");

const VALID_PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d040000000049454e44ae426082", "hex");

describe("Queue Thumbnail System Tests", () => {
  jest.setTimeout(30000);
  let appServer;
  let port;

  beforeAll((done) => {
    if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");
    if (!fs.existsSync("./thumbnails")) fs.mkdirSync("./thumbnails");
    
    appServer = server.listen(0, () => {
      port = appServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    if (server.stopWorkers) server.stopWorkers();
    // Wait a bit for workers to stop and pending tasks to finish
    setTimeout(() => {
      appServer.close(done);
    }, 3500);
  });

  beforeEach((done) => {
    db.run("DELETE FROM users", done);
  });

  test("POST /sync waits ~3s", async () => {
    const start = Date.now();
    const res = await request(server).post("/sync");
    const diff = Date.now() - start;
    expect(res.body.status).toBe("success");
    expect(diff).toBeGreaterThanOrEqual(3000);
  });

  test("POST /async returns immediately", async () => {
    const start = Date.now();
    const res = await request(server).post("/async");
    const diff = Date.now() - start;
    expect(res.body.status).toBe("accepted");
    expect(diff).toBeLessThan(500);
  });

  test("POST /upload saves image and inserts db row", async () => {
    fs.writeFileSync("./uploads/test.png", VALID_PNG);
    const res = await request(server)
      .post("/upload")
      .attach("image", "./uploads/test.png");
    expect(res.body.status).toBe("uploaded");
    expect(res.body.userId).toBeDefined();
    expect(fs.existsSync(res.body.image)).toBe(true);
  });

  async function waitFor(check, timeout = 10000, interval = 100) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const r = await check();
      if (r) return;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error("timeout");
  }

  test("Workers create thumbnail after upload", async () => {
    fs.writeFileSync("./uploads/test2.png", VALID_PNG);
    const res = await request(server)
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
            (err, row) => {
              resolve(row && row.thumbnail);
            }
          );
        })
    );

    expect(fs.existsSync(thumbPath)).toBe(true);
  });

  test("Subscribers run for image_uploaded (log and notify)", async () => {
    const originalLog = console.log;
    const logs = [];
    console.log = (...args) => {
      logs.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(" "));
      originalLog(...args);
    };

    try {
      fs.writeFileSync("./uploads/test3.png", VALID_PNG);
      const res = await request(server)
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
        request(server)
          .post("/enqueue")
          .end((err, res) => {
            expect(res.body.status).toBe("queued_all");
            expect(res.body.count).toBe(1);
            done();
          });
      }
    );
  });

  // New Tests for Polling, Long Polling, WebSocket, Webhook

  test("Polling /status/:userId returns pending then done", async () => {
    fs.writeFileSync("./uploads/poll_test.png", VALID_PNG);
    const res = await request(server)
      .post("/upload")
      .attach("image", "./uploads/poll_test.png");
    const userId = res.body.userId;

    // Immediately check status
    const statusRes1 = await request(server).get(`/status/${userId}`);
    // It might be pending or done depending on speed, but let's assume pending initially or check structure
    expect(["pending", "done"]).toContain(statusRes1.body.status);

    // Wait for completion
    await waitFor(async () => {
       const r = await request(server).get(`/status/${userId}`);
       return r.body.status === "done";
    });

    const statusRes2 = await request(server).get(`/status/${userId}`);
    expect(statusRes2.body.status).toBe("done");
    expect(statusRes2.body.thumbnail).toBeDefined();
  });

  test("Long Polling /poll/:userId waits for completion", async () => {
    fs.writeFileSync("./uploads/longpoll_test.png", VALID_PNG);
    const res = await request(server)
      .post("/upload")
      .attach("image", "./uploads/longpoll_test.png");
    const userId = res.body.userId;

    // Call /poll immediately. It should wait and return done.
    // We rely on the worker being fast enough (within timeout)
    const pollRes = await request(server).get(`/poll/${userId}`);
    expect(pollRes.body.status).toBe("done");
    expect(pollRes.body.thumbnail).toBeDefined();
  });

  test("WebSocket receives leaderboard updates", (done) => {
    const ws = new WebSocketClient(`ws://localhost:${port}`);
    
    ws.on("open", () => {
      // Post a score
      request(server)
        .post("/score")
        .send({ username: "player1", score: 100 })
        .end((err, res) => {
          if (err) return done(err);
        });
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data);
      if (msg.type === "leaderboard" && msg.data.length > 0) {
        // Check if player1 is there
        const player = msg.data.find((p) => p.username === "player1");
        if (player && player.score === 100) {
          ws.close();
          done();
        }
      }
    });
  });

  test("Webhook is sent (log check)", async () => {
    const originalLog = console.log;
    const logs = [];
    console.log = (...args) => {
      logs.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(" "));
      originalLog(...args);
    };

    try {
      fs.writeFileSync("./uploads/webhook_test.png", VALID_PNG);
      const res = await request(server)
        .post("/upload")
        .attach("image", "./uploads/webhook_test.png");
      const userId = res.body.userId;

      // Check for the specific user's webhook reception
      await waitFor(() => logs.some((l) => l.includes(`Received webhook analytics`) && l.includes(`${userId}`)));
    } finally {
      console.log = originalLog;
    }
  });

  test("SSE receives leaderboard updates", (done) => {
    const http = require("http");
    
    const req = http.get(`http://localhost:${port}/events`, (res) => {
      expect(res.headers["content-type"]).toBe("text/event-stream");
      
      res.on("data", (chunk) => {
        const text = chunk.toString();
        if (text.includes("leaderboard") && text.includes("player_sse")) {
           req.destroy();
           done();
        }
      });

      // Trigger update
      request(server)
        .post("/score")
        .send({ username: "player_sse", score: 200 })
        .end((err, res) => {
          if (err) done(err);
        });
    });
    
    req.on("error", done);
  });

});
