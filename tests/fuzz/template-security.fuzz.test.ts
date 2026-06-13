import fc from "fast-check";
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

const sensitiveKeys = new Set(["token", "accessToken", "refreshToken"]);
const jsonValueArbitrary = fc.jsonValue({ maxDepth: 4 });
const stringArbitrary = fc.string({ maxLength: 1100 });
const tokenPartArbitrary = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"), {
    minLength: 1,
    maxLength: 24,
  })
  .map((characters) => characters.join(""));
const validEmailArbitrary = fc
  .tuple(tokenPartArbitrary, tokenPartArbitrary, tokenPartArbitrary)
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);
const validPasswordArbitrary = fc.string({ minLength: 8, maxLength: 1024 });
const validRefreshTokenArbitrary = fc.string({ minLength: 16, maxLength: 96 });

const arbitraryBody = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  stringArbitrary,
  fc.integer(),
  fc.array(jsonValueArbitrary, { maxLength: 5 }),
  fc.record({
    email: fc.oneof(stringArbitrary, jsonValueArbitrary),
    password: fc.oneof(stringArbitrary, jsonValueArbitrary),
    refreshToken: fc.oneof(stringArbitrary, jsonValueArbitrary),
    extra: jsonValueArbitrary,
  }),
  fc.record({
    email: validEmailArbitrary,
    password: validPasswordArbitrary,
    refreshToken: validRefreshTokenArbitrary,
    extra: jsonValueArbitrary,
  }),
);

const isValidEmail = (value: unknown) => {
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
  it("redacts sensitive session fields from arbitrary nested payloads", () => {
    const sanitizers = [
      sanitizeAuthSessionResponse,
      sanitizeAuthPlusSessionResponse,
      sanitizeBaseSessionResponse,
    ];

    for (const sanitize of sanitizers) {
      fc.assert(
        fc.property(jsonValueArbitrary, (payload) => {
          assertNoSensitiveKeys(sanitize(payload));
        }),
        { numRuns: 250 },
      );
    }
  });

  it("accepts only valid credential-shaped bodies", () => {
    const parsers = [parseAuthCredentials, parseAuthPlusCredentials];

    for (const parseCredentials of parsers) {
      fc.assert(
        fc.property(arbitraryBody, (body) => {
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
        }),
        { numRuns: 250 },
      );
    }
  });

  it("accepts only valid refresh-token-shaped bodies", () => {
    const parsers = [parseAuthRefreshToken, parseBaseRefreshToken];

    for (const parseRefreshToken of parsers) {
      fc.assert(
        fc.property(arbitraryBody, (body) => {
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
        }),
        { numRuns: 250 },
      );
    }
  });

  it("fails closed for missing or weak secrets", () => {
    const secretReaders = [requiredAuthSecret, requiredAuthPlusSecret, requiredBaseSecret];
    const secretArbitrary = fc.oneof(
      fc.string({ maxLength: 31 }),
      fc.string({ minLength: 32, maxLength: 96 }),
    );

    for (const [readerIndex, requiredSecret] of secretReaders.entries()) {
      const envName = `FUZZ_SECRET_${readerIndex}`;

      fc.assert(
        fc.property(secretArbitrary, (secret) => {
          vi.stubEnv(envName, secret);

          if (secret.trim().length >= 32) {
            expect(requiredSecret(envName)).toBe(secret);
          } else {
            expect(() => requiredSecret(envName)).toThrow();
          }
        }),
        { numRuns: 250 },
      );
    }

    vi.unstubAllEnvs();
  });
});
