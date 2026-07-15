import express from "express";
import passwordRoutes from "./auth/routes/password.route";
import oauthRoutes from "./auth/routes/oauth.routes";
import protectedRoutes from "./auth/routes/protected.routes";
import { getAuth, initAuth } from "./auth/auth";
import { requiredPort } from "./utils/security";

async function start(){
		await initAuth();
  const auth = getAuth();
  const app = express();

  app.use(express.json({ limit: "16kb", strict: true }));
  app.use(auth.helmet);
  app.use(auth.rateLimit);
  app.get("/.well-known/jwks.json", (_req, res) => res.json(auth.getJwks()));

  app.use("/auth", passwordRoutes);
  app.use("/auth", oauthRoutes);
  app.use("/", protectedRoutes);

  const port = requiredPort();
  app.listen(port, () => {
    console.log(`Auth system running on http://localhost:${port}`);
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
