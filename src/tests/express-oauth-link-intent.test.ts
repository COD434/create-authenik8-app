import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";

import {
  consumeOAuthLinkIntent,
  createOAuthLinkIntent,
  OAuthLinkIntentError,
  oauthLinkIntentTtlSeconds,
} from "../../templates/express-auth+/src/auth/oauth-link-intent.js";
import {
  expressOAuthFiles,
  expressOAuthSupportFiles,
  renderExpressOAuthFiles,
} from "../lib/expressOAuth.js";

class MemoryLinkIntentRedis {
  readonly values = new Map<string, string>();
  readonly setCalls: Array<{ key: string; ttl: number }> = [];
  getdelCalls = 0;

  async set(
    key: string,
    value: string,
    expiryMode: string,
    ttl: number,
    condition: string,
  ): Promise<"OK" | null> {
    expect(expiryMode).toBe("EX");
    expect(condition).toBe("NX");
    this.setCalls.push({ key, ttl });
    if (this.values.has(key)) return null;
    this.values.set(key, value);
    return "OK";
  }

  async getdel(key: string): Promise<string | null> {
    this.getdelCalls += 1;
    const value = this.values.get(key) ?? null;
    this.values.delete(key);
    return value;
  }
}

describe("Express OAuth link intents", () => {
  it("creates a provider-bound ticket and consumes it once", async () => {
    const redis = new MemoryLinkIntentRedis();
    const ticket = await createOAuthLinkIntent(redis as never, "google", "user-1");

    expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(redis.setCalls).toEqual([{
      key: `authenik8:app:oauth-link:google:${ticket}`,
      ttl: oauthLinkIntentTtlSeconds,
    }]);
    await expect(consumeOAuthLinkIntent(redis as never, "github", ticket))
      .rejects.toBeInstanceOf(OAuthLinkIntentError);
    await expect(consumeOAuthLinkIntent(redis as never, "google", ticket))
      .resolves.toBe("user-1");
    await expect(consumeOAuthLinkIntent(redis as never, "google", ticket))
      .rejects.toBeInstanceOf(OAuthLinkIntentError);
  });

  it("rejects malformed tickets before querying Redis", async () => {
    const redis = new MemoryLinkIntentRedis();

    await expect(consumeOAuthLinkIntent(redis as never, "google", "not-a-ticket"))
      .rejects.toBeInstanceOf(OAuthLinkIntentError);
    expect(redis.getdelCalls).toBe(0);
  });

  it("keeps the packaged template synchronized with the generator source", async () => {
    const templatePath = path.resolve(
      import.meta.dirname,
      "../../templates/express-auth+/src/auth/oauth-link-intent.ts",
    );
    const templateSource = await fs.readFile(templatePath, "utf8");
    const rendered = renderExpressOAuthFiles(["google"]);

    expect(rendered[expressOAuthSupportFiles.linkIntent]).toBe(templateSource);
    expect(Object.values(expressOAuthFiles)).not.toContain(expressOAuthSupportFiles.linkIntent);
  });
});
