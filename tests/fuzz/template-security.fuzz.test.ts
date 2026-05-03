import { describe, expect, it, vi } from "vitest";

import {
  parseCredentials as parseAuthCredentials,
  parseRefreshToken as parseAuthRefreshToken,
  requiredSecret as requiredAuthSecret,
  sanitizeSessionResponse as sanitizeAuthSessionResponse,
} from "../../templates/express-auth/src/utils/security";
import {
  parseCredentials as parseAuthPlusCredentials,
  requiredSecret as requiredAuthPlusSecret,
  sanitizeSessionResponse as sanitizeAuthPlusSessionResponse,
} from "../../templates/express-auth+/src/utils/security";
import {
  parseRefreshToken as parseBaseRefreshToken,
  requiredSecret as requiredBaseSecret,
  sanitizeSessionResponse as sanitizeBaseSessionResponse,
} from "../../templates/express-base/utils/security";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const sensitiveKeys = new Set(["token", "accessToken", "refreshToken"]);

const mulberry32 = (seed: number) => {
  let value = seed;

  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
};

const randomInt = (random: () => number, max: number) => Math.floor(random() * max);

const randomString = (random: () => number, maxLength = 48) => {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@._- \t\n:/";
  const length = randomInt(random, maxLength);

  return Array.from({ length }, () => alphabet[randomInt(random, alphabet.length)]).join("");
};

const randomJson = (random: () => number, depth = 0): JsonValue => {
  if (depth > 3) {
    const primitives: JsonValue[] = [null, random() > 0.5, randomInt(random, 10_000), randomString(random)];
    return primitives[randomInt(random, primitives.length)];
  }

  const choice = randomInt(random, 6);

  if (choice === 0) return null;
  if (choice === 1) return random() > 0.5;
  if (choice === 2) return randomInt(random, 1_000_000);
  if (choice === 3) return randomString(random);
  if (choice === 4) {
    return Array.from({ length: randomInt(random, 5) }, () => randomJson(random, depth + 1));
  }

  const keyPool = [
    "id",
    "role",
    "sessionId",
    "device",
    "ip",
    "createdAt",
    "token",
    "accessToken",
    "refreshToken",
    randomString(random, 12) || "value",
  ];
  const result: Record<string, JsonValue> = {};

  for (let index = 0; index < randomInt(random, 7); index += 1) {
    result[keyPool[randomInt(random, keyPool.length)]] = randomJson(random, depth + 1);
  }

  return result;
};

const randomBody = (random: () => number) => {
  const choice = randomInt(random, 8);

  if (choice === 0) return undefined;
  if (choice === 1) return null;
  if (choice === 2) return randomString(random);
  if (choice === 3) return randomInt(random, 1000);
  if (choice === 4) return [];

  return {
    email: random() > 0.2 ? randomString(random, 72) : randomJson(random),
    password: random() > 0.2 ? randomString(random, 1100) : randomJson(random),
    refreshToken: random() > 0.2 ? randomString(random, 96) : randomJson(random),
    extra: randomJson(random),
  };
};

const isValidEmail = (value: unknown) =>{
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  const atIndex = normalized.indexOf("@");
  const dotIndex = normalized.lastIndexOf(".");

  return (
    atIndex >= 1 &&
    atIndex === normalized.lastIndexOf("@") &&
    dotIndex >= atIndex + 2 &&
    dotIndex < normalized.length - 1
  );
};

const isValidPassword = (value: unknown) =>
  typeof value === "string" && value.length >= 8 && value.length <= 1024;

const isValidRefreshToken = (value: unknown) =>
  typeof value === "string" && value.trim().length >= 16;

const assertNoSensitiveKeys = (value: unknown) => {
  if (Array.isArray(value)) {
    value.forEach(assertNoSensitiveKeys);
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    expect(sensitiveKeys.has(key)).toBe(false);
    assertNoSensitiveKeys(nestedValue);
  }
};

describe("template security fuzzing", () => {
  it("redacts sensitive session fields from arbitrary nested payloads", async () => {
    const sanitizers = [
      sanitizeAuthSessionResponse,
      sanitizeAuthPlusSessionResponse,
      sanitizeBaseSessionResponse,
    ];

    for (const [sanitizerIndex, sanitize] of sanitizers.entries()) {
      const random = mulberry32(10_000 + sanitizerIndex);

      for (let iteration = 0; iteration < 250; iteration += 1) {
        const payload = randomJson(random);
        const sanitized = sanitize(payload);

        assertNoSensitiveKeys(sanitized);
      }
    }
  });

  it("accepts only valid credential-shaped bodies", async () => {
    const parsers = [parseAuthCredentials, parseAuthPlusCredentials];

    for (const [parserIndex, parseCredentials] of parsers.entries()) {
      const random = mulberry32(20_000 + parserIndex);

      for (let iteration = 0; iteration < 250; iteration += 1) {
        const body = randomBody(random);
        const expectedValid =
          !!body &&
          typeof body === "object" &&
          !Array.isArray(body) &&
          isValidEmail((body as { email?: unknown }).email) &&
          isValidPassword((body as { password?: unknown }).password);

        if (expectedValid) {
          const parsed = parseCredentials(body);

          expect(parsed.email).toBe((body as { email: string }).email.trim().toLowerCase());
          expect(parsed.password).toBe((body as { password: string }).password);
        } else {
          expect(() => parseCredentials(body)).toThrow();
        }
      }
    }
  });

  it("accepts only valid refresh-token-shaped bodies", async () => {
    const parsers = [parseAuthRefreshToken, parseBaseRefreshToken];

    for (const [parserIndex, parseRefreshToken] of parsers.entries()) {
      const random = mulberry32(30_000 + parserIndex);

      for (let iteration = 0; iteration < 250; iteration += 1) {
        const body = randomBody(random);
        const expectedValid =
          !!body &&
          typeof body === "object" &&
          !Array.isArray(body) &&
          isValidRefreshToken((body as { refreshToken?: unknown }).refreshToken);

        if (expectedValid) {
          expect(parseRefreshToken(body)).toBe((body as { refreshToken: string }).refreshToken);
        } else {
          expect(() => parseRefreshToken(body)).toThrow();
        }
      }
    }
  });

  it("fails closed for missing or weak secrets", async () => {
    const secretReaders = [requiredAuthSecret, requiredAuthPlusSecret, requiredBaseSecret];

    for (const [readerIndex, requiredSecret] of secretReaders.entries()) {
      const envName = `FUZZ_SECRET_${readerIndex}`;

      vi.stubEnv(envName, "");
      expect(() => requiredSecret(envName)).toThrow();

      vi.stubEnv(envName, "short-secret");
      expect(() => requiredSecret(envName)).toThrow();

      vi.stubEnv(envName, `long-secret-${readerIndex}-with-more-than-32-characters`);
      expect(requiredSecret(envName)).toBe(
        `long-secret-${readerIndex}-with-more-than-32-characters`,
      );
    }
  });
});
