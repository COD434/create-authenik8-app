import { prisma } from "../prisma/client";
import { hashPassword, comparePassword } from "../utils/hash";

export const AuthService = {
  async register(email: string, password: string) {
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new Error("Email is already registered");
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword },
    });

    return user;
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
