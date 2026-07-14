import { describe, expect, it } from "vitest";

import {
  parseCredentials as parseAuthCredentials,
  parseRefreshToken,
} from "../../templates/express-auth/src/utils/security";
import { parseCredentials as parseOAuthCredentials } from "../../templates/express-auth+/src/utils/security";
import {
  parseIdentifier,
  parseRefreshToken as parseBaseRefreshToken,
} from "../../templates/express-base/utils/security";
import { registerSchema } from "../../templates/fullstack/packages/contracts/src/index";

describe("template Zod validation", () => {
  it.each([parseAuthCredentials, parseOAuthCredentials])(
    "normalizes credential input without modifying passwords",
    (parseCredentials) => {
      expect(parseCredentials({
        email: "  USER@Example.COM ",
        password: "ValidPassword1",
      })).toEqual({ email: "user@example.com", password: "ValidPassword1" });
    },
  );

  it.each([parseAuthCredentials, parseOAuthCredentials])(
    "rejects weak, malformed, or over-posted credentials",
    (parseCredentials) => {
      expect(() => parseCredentials({ email: "bad", password: "short" })).toThrow();
      expect(() => parseCredentials({
        email: "user@example.com",
        password: "ValidPassword1",
        role: "ADMIN",
      })).toThrow();
    },
  );

  it("validates refresh tokens and route identifiers", () => {
    const body = { refreshToken: "  abcdefghijklmnop  " };
    expect(parseRefreshToken(body)).toBe("abcdefghijklmnop");
    expect(parseBaseRefreshToken(body)).toBe("abcdefghijklmnop");
    expect(parseIdentifier(" user-1 ", "User ID")).toBe("user-1");
    expect(() => parseIdentifier("../user", "User ID")).toThrow("User ID is invalid");
  });

  it("normalizes fullstack registration fields", () => {
    expect(registerSchema.parse({
      name: "  Jane   Example ",
      email: " JANE@EXAMPLE.COM ",
      password: "SecurePass1",
    })).toMatchObject({ name: "Jane Example", email: "jane@example.com" });
  });
});
