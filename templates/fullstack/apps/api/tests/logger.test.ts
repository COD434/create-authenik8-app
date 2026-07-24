import { Writable } from "node:stream";
import express from "express";
import { pinoHttp } from "pino-http";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({
  env: { LOG_LEVEL: "info" },
}));

import { createLogger } from "../src/config/logger.js";

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

    app.use(pinoHttp({ logger: createLogger(destination) }));
    app.get("/session", (_req, res) => {
      res.cookie("authenik8_refresh", "sealed-refresh-secret", { httpOnly: true });
      res.sendStatus(204);
    });

    await request(app)
      .get("/session")
      .set("authorization", "Bearer access-secret")
      .set("cookie", "authenik8_refresh=incoming-cookie-secret")
      .set("x-csrf-token", "csrf-secret")
      .expect(204);

    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("access-secret");
    expect(output).not.toContain("incoming-cookie-secret");
    expect(output).not.toContain("csrf-secret");
    expect(output).not.toContain("sealed-refresh-secret");
  });
});
