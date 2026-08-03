import { Writable } from "node:stream";
import express from "express";
import { pinoHttp } from "pino-http";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({
  env: { LOG_LEVEL: "info" },
}));

import { createLogger, httpLogSerializers } from "../src/config/logger.js";

describe("HTTP log redaction", () => {
  it("does not record bearer, CSRF, or cookie credentials", async () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const app = express();

    app.use(pinoHttp({ logger: createLogger(destination), serializers: httpLogSerializers }));
    app.get("/session", (_req, res) => {
      res.cookie("authenik8_refresh", "sealed-refresh-secret", { httpOnly: true });
      res.sendStatus(204);
    });

    await request(app)
      .get("/session")
      .set("authorization", "Bearer access-secret")
      .set("cookie", "authenik8_refresh=incoming-cookie-secret")
      .set("x-csrf-token", "csrf-secret")
      .set("referer", "http://localhost:5173/auth/callback?code=exchange-secret")
      .expect(204);

    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("access-secret");
    expect(output).not.toContain("incoming-cookie-secret");
    expect(output).not.toContain("csrf-secret");
    expect(output).not.toContain("sealed-refresh-secret");
    expect(output).not.toContain("exchange-secret");
  });

  it("keeps callback credentials out of request URLs", async () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const app = express();

    app.use(pinoHttp({ logger: createLogger(destination), serializers: httpLogSerializers }));
    app.get("/api/auth/oauth/google/callback", (_req, res) => res.sendStatus(204));

    await request(app)
      .get("/api/auth/oauth/google/callback?code=provider-secret&state=oauth-state")
      .expect(204);

    expect(output).toContain("/api/auth/oauth/google/callback");
    expect(output).not.toContain("provider-secret");
    expect(output).not.toContain("oauth-state");
  });
});
