import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  auth: {
    issueTokens: vi.fn(),
<<<<<<< HEAD
    refreshToken: vi.fn(),
=======
>>>>>>> main
  },
  passwordHash: {
    comparePassword: vi.fn(),
    hashPassword: vi.fn(),
  },
  prisma: {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../templates/express-auth/src/prisma/client.js", () => ({
  prisma: dependencies.prisma,
}));
vi.mock("../templates/express-auth+/src/prisma/client.js", () => ({
  prisma: dependencies.prisma,
}));
vi.mock("../templates/express-auth/src/utils/hash.js", () => dependencies.passwordHash);
vi.mock("../templates/express-auth+/src/utils/hash.js", () => dependencies.passwordHash);
vi.mock("../templates/express-auth+/src/auth/auth.js", () => ({
  getAuth: () => dependencies.auth,
}));

function response() {
  const res = {
    json: vi.fn(),
    status: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

const credentials = {
  email: "user@example.com",
  password: "SecurePassword1",
};

beforeEach(() => {
  dependencies.auth.issueTokens.mockResolvedValue({
    accessToken: "real-access-token",
    refreshToken: "real-refresh-token",
  });
<<<<<<< HEAD
  dependencies.auth.refreshToken.mockResolvedValue({
    accessToken: "refreshed-access-token",
    refreshToken: "rotated-refresh-token",
  });
=======
>>>>>>> main
  dependencies.passwordHash.comparePassword.mockResolvedValue(true);
  dependencies.passwordHash.hashPassword.mockResolvedValue("hashed-password");
  dependencies.prisma.user.findUnique.mockResolvedValue({
    id: "user-1",
    email: credentials.email,
    password: "hashed-password",
    role: "ADMIN",
  });
});

describe("generated password login flows", () => {
  it("awaits the core token-pair API in the email/password template", async () => {
    const { createAuthController } = await import(
      "../templates/express-auth/src/controllers/auth.controller.js"
    );
    const res = response();

    await createAuthController(dependencies.auth).login(
      { body: credentials } as any,
      res as any,
    );

    expect(dependencies.auth.issueTokens).toHaveBeenCalledWith({
      userId: "user-1",
      email: credentials.email,
      role: "admin",
    });
    expect(res.json).toHaveBeenCalledWith({
      accessToken: "real-access-token",
      refreshToken: "real-refresh-token",
    });
  });

  it("awaits the same core API in the OAuth preset password login", async () => {
    const { passwordController } = await import(
      "../templates/express-auth+/src/auth/controllers/password.controller.js"
    );
    const res = response();

    await passwordController.login({ body: credentials } as any, res as any);

    expect(dependencies.auth.issueTokens).toHaveBeenCalledWith({
      userId: "user-1",
      email: credentials.email,
      role: "admin",
    });
    expect(res.json).toHaveBeenCalledWith({
      accessToken: "real-access-token",
      refreshToken: "real-refresh-token",
    });
  });

  it("does not allow an OAuth-only account to use password login", async () => {
    dependencies.prisma.user.findUnique.mockResolvedValue({
      id: "oauth-user",
      email: credentials.email,
      password: null,
    });
    const { passwordController } = await import(
      "../templates/express-auth+/src/auth/controllers/password.controller.js"
    );
    const res = response();

    await passwordController.login({ body: credentials } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid credentials" });
    expect(dependencies.auth.issueTokens).not.toHaveBeenCalled();
  });
<<<<<<< HEAD

  it("rotates refresh tokens in the OAuth preset", async () => {
    const { passwordController } = await import(
      "../templates/express-auth+/src/auth/controllers/password.controller.js"
    );
    const res = response();
    const refreshToken = "valid-refresh-token";

    await passwordController.refresh({ body: { refreshToken } } as any, res as any);

    expect(dependencies.auth.refreshToken).toHaveBeenCalledWith(refreshToken);
    expect(res.json).toHaveBeenCalledWith({
      accessToken: "refreshed-access-token",
      refreshToken: "rotated-refresh-token",
    });
  });
=======
>>>>>>> main
});
