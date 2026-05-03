import dotenv from "dotenv";
import { createAuthenik8 } from "authenik8-core";
import { createApp } from "./app";
import { requiredSecret } from "./utils/security";

dotenv.config();

async function start() {
  const auth = await createAuthenik8({
    jwtSecret: requiredSecret("JWT_SECRET"),
    refreshSecret: requiredSecret("REFRESH_SECRET"),
  });

  const app = createApp(auth);

  app.listen(3000, () => {
    console.log(" Server running on http://localhost:3000");
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
setInterval(() => {
  const used = process.memoryUsage().heapUsed / 1024 / 1024;

  if (used > 300) {
    console.error(`Memory exceeded: ${used.toFixed(2)} MB`);
    process.exit(1);
  }
}, 10000);
start();
