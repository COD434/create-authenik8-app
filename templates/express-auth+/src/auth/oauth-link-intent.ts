import { randomBytes } from "node:crypto";
import type { Redis } from "ioredis";

export const oauthLinkIntentTtlSeconds = 120;

const ticketPattern = /^[A-Za-z0-9_-]{43}$/;
const providerPattern = /^[a-z][a-z0-9-]{0,31}$/;
const keyPrefix = "authenik8:app:oauth-link";

type LinkIntentRedis = Pick<Redis, "getdel" | "set">;

export class OAuthLinkIntentError extends Error {
  constructor() {
    super("OAuth link request is invalid or expired");
    this.name = "OAuthLinkIntentError";
  }
}

function intentKey(provider: string, ticket: string): string {
  if (!providerPattern.test(provider) || !ticketPattern.test(ticket)) {
    throw new OAuthLinkIntentError();
  }
  return `${keyPrefix}:${provider}:${ticket}`;
}

function validUserId(userId: string): boolean {
  return userId.length > 0 &&
    userId.length <= 256 &&
    !/[\u0000-\u001f\u007f]/.test(userId);
}

export async function createOAuthLinkIntent(
  redis: LinkIntentRedis,
  provider: string,
  userId: string,
): Promise<string> {
  if (!providerPattern.test(provider) || !validUserId(userId)) {
    throw new OAuthLinkIntentError();
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ticket = randomBytes(32).toString("base64url");
    const stored = await redis.set(
      intentKey(provider, ticket),
      userId,
      "EX",
      oauthLinkIntentTtlSeconds,
      "NX",
    );
    if (stored === "OK") return ticket;
  }

  throw new Error("Unable to allocate an OAuth link ticket");
}

export async function consumeOAuthLinkIntent(
  redis: LinkIntentRedis,
  provider: string,
  ticket: unknown,
): Promise<string> {
  if (typeof ticket !== "string") throw new OAuthLinkIntentError();
  const userId = await redis.getdel(intentKey(provider, ticket));
  if (!userId || !validUserId(userId)) throw new OAuthLinkIntentError();
  return userId;
}
