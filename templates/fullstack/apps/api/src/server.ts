import { initAuthenik8, redis } from "./auth/authenik8.js";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/prisma.js";

async function start() {
  await initAuthenik8();
  await prisma.$connect();
  const server = createApp().listen(env.PORT, () => {
    logger.info({ port: env.PORT }, `API running on http://localhost:${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    server.close(async () => {
      await Promise.all([prisma.$disconnect(), redis.quit()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch((error) => {
  logger.fatal({ err: error }, "API failed to start");
  process.exit(1);
});
