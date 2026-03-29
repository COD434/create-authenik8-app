"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// tests/full.integration.test.ts
const testApp_1 = require("./testApp");
describe("Authenik8 Full Integration", () => {
    let request;
    let auth;
    let accessToken;
    let refreshToken;
    beforeAll(async () => {
        const setup = await (0, testApp_1.createTestApp)();
        request = setup.request;
        auth = setup.auth;
    });
    afterAll(async () => {
        if (auth.redis) {
            await auth.redis.flushdb();
            await auth.redis.quit();
        }
    });
    //  LOGIN
    test("should login and receive tokens", async () => {
        const res = await request.post("/login");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("accessToken");
        expect(res.body).toHaveProperty("refreshToken");
        accessToken = res.body.accessToken;
        refreshToken = res.body.refreshToken;
    });
    //  PROTECTED ROUTE
    test("should access protected route with valid token", async () => {
        const res = await request
            .get("/protected")
            .set("Authorization", `Bearer ${accessToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("data", "secure data");
    });
    //  NO TOKEN
    test("should reject request without token", async () => {
        const res = await request.get("/protected");
        expect(res.status).toBe(401);
    });
    // REFRESH TOKEN
    test("should refresh access token", async () => {
        const res = await request
            .post("/refresh")
            .send({ refreshToken });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("accessToken");
        expect(res.body).toHaveProperty("refreshToken");
        // update tokens
        accessToken = res.body.accessToken;
        refreshToken = res.body.refreshToken;
        if (res.body.refreshToken) {
            refreshToken = res.body.refreshToken;
        }
    });
    //  ROTATION (IMPORTANT)
    test("should NOT allow reuse of old refresh token", async () => {
        const originalToken = refreshToken;
        // first use → rotates token
        const firstRes = await request
            .post("/refresh")
            .send({ refreshToken: originalToken });
        expect(firstRes.status).toBe(200);
        const newToken = firstRes.body.refreshToken;
        // second use with OLD token → should fail
        const res = await request
            .post("/refresh")
            .send({ refreshToken: originalToken });
        expect(res.status).toBe(401);
        // sanity check: new token should work
        const validRes = await request
            .post("/refresh")
            .send({ refreshToken: newToken });
        expect(validRes.status).toBe(200);
    });
});
//# sourceMappingURL=full.intergration.test.js.map