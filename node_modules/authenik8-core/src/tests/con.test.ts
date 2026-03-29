import { createAuthenik8 } from "../createAuthenik8";
import request from "supertest";
import express from "express";
import Redis from "ioredis";

describe("Refresh Token Concurrency (Integration)", () => {
  let app: express.Express;
  let auth: Awaited<ReturnType<typeof createAuthenik8>>; // or just `any` but this is better
  let refreshToken: string;
  let redisClient: Redis;

  beforeAll(async () => {
    // Create and verify a connected Redis client (use a separate DB for tests)
    redisClient = new Redis({ host: "localhost", port: 6379, db: 1 });
    await redisClient.ping(); // ensure connection is established

    // Pass the connected client as `redis` (not `redisClient`)
    auth = await createAuthenik8({
      jwtSecret: "test-secret",
      refreshSecret: "refresh-secret",
      jwtExpiry: "15m",
      redis: redisClient, // ✅ correct property name
    });

    app = express();
    app.use(express.json());

    // Login route – must be async and await the refresh token generation
    app.post("/login", async (req, res) => {
      const token = auth.signToken({ userId: "user_1", email: "test@test.com" });
      refreshToken = await auth.generateRefreshToken({ userId: "user_1", email: "test@test.com" });
      res.json({ token, refreshToken });
    });

    // Refresh route – unchanged but uses the proper error handling
    app.post("/refresh", async (req, res) => {
      try {
        const result = await auth.refreshToken(req.body.refreshToken);
        res.json(result);
      } catch (err: any) {
	      console.error("Refresh error",err)

	      if(err.name === "InvalidTokenError"){
	      return res.status(401).json({error:err.message})
	      }
        return res.status( 500).json({ error: err.message });
      }
    });
  });

  afterAll(async () => {
    // Clean up the test database and close the client
    await redisClient.flushdb();
    await redisClient.quit();
  });

  it("should allow only one of two concurrent refresh requests", async () => {
    // Login to obtain a valid refresh token
    await request(app).post("/login").send({});

    // Fire two concurrent refresh requests
    const [res1, res2] = await Promise.all([
      request(app).post("/refresh").send({ refreshToken }),
      request(app).post("/refresh").send({ refreshToken }),
    ]);

    // Exactly one should succeed (200) and one should fail with 401
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 401]);

    // The successful response must contain new tokens
    const successRes = res1.status === 200 ? res1 : res2;
    expect(successRes.body).toHaveProperty("accessToken");
    expect(successRes.body).toHaveProperty("refreshToken");
  });
});
