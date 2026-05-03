"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const fs_1 = __importDefault(require("fs"));
const index_1 = __importDefault(require("./index"));
const sqlite3Verbose = sqlite3_1.default.verbose();
const db = new sqlite3Verbose.Database("./mydb.sqlite");
describe("Queue Thumbnail System Tests", () => {
    beforeAll(() => {
        if (!fs_1.default.existsSync("./uploads"))
            fs_1.default.mkdirSync("./uploads");
        if (!fs_1.default.existsSync("./thumbnails"))
            fs_1.default.mkdirSync("./thumbnails");
    });
    beforeEach((done) => {
        db.run("DELETE FROM users", done);
    });
    test("POST /sync waits ~3s", async () => {
        const start = Date.now();
        const res = await (0, supertest_1.default)(index_1.default).post("/sync");
        const diff = Date.now() - start;
        expect(res.body.status).toBe("success");
        expect(diff).toBeGreaterThanOrEqual(3000);
    });
    test("POST /async returns immediately", async () => {
        const start = Date.now();
        const res = await (0, supertest_1.default)(index_1.default).post("/async");
        const diff = Date.now() - start;
        expect(res.body.status).toBe("accepted");
        expect(diff).toBeLessThan(500);
    });
    test("POST /upload saves image and inserts db row", async () => {
        fs_1.default.writeFileSync("./uploads/test.png", "dummy");
        const res = await (0, supertest_1.default)(index_1.default)
            .post("/upload")
            .attach("image", "./uploads/test.png");
        expect(res.body.status).toBe("uploaded");
        expect(res.body.userId).toBeDefined();
        expect(fs_1.default.existsSync(res.body.image)).toBe(true);
    });
    test("POST /enqueue queues tasks", (done) => {
        db.run(`INSERT INTO users (image, thumbnail) VALUES (?, NULL)`, ["uploads/test.png"], () => {
            (0, supertest_1.default)(index_1.default)
                .post("/enqueue")
                .end((err, res) => {
                expect(res.body.status).toBe("queued_all");
                expect(res.body.count).toBe(1);
                done();
            });
        });
    });
});
