import { prisma } from "../prisma/client";
import { hashPassword, comparePassword } from "../utils/hash";

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && error.code === "P2002",
  );
}

export const AuthService = {
  async register(email: string, password: string) {
    const hashedPassword = await hashPassword(password);
    try {
      await prisma.user.create({
        data: { email, password: hashedPassword },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }
  },

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) throw new Error("Invalid credentials");

    const isValid = await comparePassword(password, user.password);

    if (!isValid) throw new Error("Invalid credentials");

    return user;
  },
};
