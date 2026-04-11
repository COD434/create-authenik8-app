import express from "express";
import passwordRoutes from "./auth/password.route";
import oauthRoutes from "./auth/oauth.routes";
import protectedRoutes from "./auth/protected.routes";
import { initAuth } from "./auth/auth";
const app = express();
app.use(express.json());

app.use("/auth", passwordRoutes);
app.use("/auth", oauthRoutes);
app.use("/", protectedRoutes);

async function start(){
	await initAuth();

  app.listen(3000, () => {
    console.log("Auth system running on http://localhost:3000");
  });
}

start();
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
    console.error(` Memory exceeded: ${used.toFixed(2)} MB`);
    process.exit(1);
  }
}, 10000);
