import { describe, expect, it } from "vitest";
import {
  identifierSchema,
  pageSchema,
  projectCreateSchema,
  registerSchema,
} from "@authenik8/contracts";

describe("request validation", () => {
  it("normalizes valid registration input", () => {
    expect(registerSchema.parse({
      name: "  Jane   Example  ",
      email: "  JANE@EXAMPLE.COM ",
      password: "SecurePass1",
    })).toEqual({
      name: "Jane Example",
      email: "jane@example.com",
      password: "SecurePass1",
    });
  });

  it("rejects weak registration input and unknown fields", () => {
    expect(registerSchema.safeParse({
      name: "J",
      email: "not-an-email",
      password: "password",
      role: "ADMIN",
    }).success).toBe(false);
  });

  it("normalizes project text and bounds route/query values", () => {
    expect(projectCreateSchema.parse({ name: "  Project   Alpha ", description: " notes\r\n" }))
      .toMatchObject({ name: "Project Alpha", description: "notes" });
    expect(identifierSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(pageSchema.parse("2")).toBe(2);
  });
});
