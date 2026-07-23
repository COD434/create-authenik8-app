import  dotenv  from "dotenv";
import { createAuthenik8 } from "authenik8-core";
import { createApp } from "../app";
<<<<<<< HEAD
import { createRedisClient } from "./config/redis";
=======
>>>>>>> main
import { agentIdentityConfig, authJwkConfig, requiredPort, requiredSecret } from "../utils/security";

dotenv.config();

async function start() {
  const auth = await createAuthenik8({
    jwt: authJwkConfig(),
    refreshSecret: requiredSecret("REFRESH_SECRET"),
    agent: agentIdentityConfig(),
<<<<<<< HEAD
    redis: await createRedisClient(),
=======
>>>>>>> main
  });

  const app = createApp(auth);

  const port = requiredPort();
  app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
  });
}
process.on("uncaughtException", (err) => {
  console.error(" Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error(" Unhandled Rejection:", err);
  process.exit(1);
});
start();
