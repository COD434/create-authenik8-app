import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  sendVerificationEmail: vi.fn(),
  hash: vi.fn(async () => "hashed-password"),
}));

vi.mock("../src/config/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUnique,
      create: mocks.create,
    },
  },
}));
vi.mock("../src/config/mailer.js", () => ({
  sendPasswordResetEmail: vi.fn(),
  sendVerificationEmail: mocks.sendVerificationEmail,
}));
vi.mock("../src/auth/authenik8.js", () => ({
  getAuthenik8: vi.fn(),
  redis: { del: vi.fn(), setex: vi.fn() },
}));
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: mocks.hash },
}));

import { register } from "../src/auth/auth.service.js";

describe("registration service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: "user-1" });
    mocks.sendVerificationEmail.mockResolvedValue(undefined);
  });

  it("creates a validated account and sends its verification message", async () => {
    const result = await register({
      name: "Jane Example",
      email: "jane@example.com",
      password: "SecurePass1",
    });

    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Jane Example",
        email: "jane@example.com",
        passwordHash: "hashed-password",
        verificationTokens: { create: expect.objectContaining({ tokenHash: expect.any(String) }) },
      }),
    });
    expect(mocks.sendVerificationEmail).toHaveBeenCalledWith("jane@example.com", expect.any(String));
    expect(result).toMatchObject({ message: "Check your inbox to continue" });
  });

  it("returns the same response for an existing address", async () => {
    mocks.findUnique.mockResolvedValue({ id: "existing-user" });

    await expect(register({
      name: "Jane Example",
      email: "jane@example.com",
      password: "SecurePass1",
    })).resolves.toEqual({ message: "Check your inbox to continue" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
