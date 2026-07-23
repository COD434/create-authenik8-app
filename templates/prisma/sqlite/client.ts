import "dotenv/config";
<<<<<<< HEAD
import { PrismaLibSql } from "@prisma/adapter-libsql";
=======
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
>>>>>>> main
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

<<<<<<< HEAD
const adapter = new PrismaLibSql({
=======
const adapter = new PrismaBetterSqlite3({
>>>>>>> main
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
