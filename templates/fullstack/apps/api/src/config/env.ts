import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.env");
dotenv.config({ path: process.env.AUTHENIK8_ENV_FILE ?? rootEnv });

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");
const signingJwks = z.string().min(1).superRefine((value, context) => {
  try {
    const keys = JSON.parse(value) as Array<Record<string, unknown>>;
    if (!Array.isArray(keys) || !keys.length || keys.some((key) =>
      key.kty !== "EC" || key.crv !== "P-256" || key.alg !== "ES256" ||
      typeof key.kid !== "string" || typeof key.x !== "string" || typeof key.y !== "string"
    )) {
      throw new Error("invalid key");
    }
  } catch {
    context.addIssue({ code: "custom", message: "must be a JSON array of ES256 P-256 JWKs" });
  }
});
const agentRegistry = z.string().default("{}").superRefine((value, context) => {
  try {
    const agents = JSON.parse(value) as Record<string, unknown>;
    const valid = agents && typeof agents === "object" && !Array.isArray(agents) &&
      Object.entries(agents).every(([agentId, scopes]) =>
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(agentId) &&
        Array.isArray(scopes) && scopes.length > 0 && scopes.length <= 64 &&
        scopes.every((scope) =>
          typeof scope === "string" && scope.length <= 128 &&
          /^[a-z][a-z0-9._/-]*(?::[a-z][a-z0-9._/-]*)+$/.test(scope)
        )
      );
    if (!valid) throw new Error("invalid agent registry");
  } catch {
    context.addIssue({ code: "custom", message: "must map agent IDs to resource:action scope arrays" });
  }
});

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
<<<<<<< HEAD
  REDIS_URL: z.string().min(1).default("memory://"),
=======
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
>>>>>>> main
  AUTHENIK8_SIGNING_JWKS: signingJwks,
  AUTHENIK8_ACTIVE_KID: z.string().min(1),
  AUTHENIK8_ISSUER: z.string().url(),
  AUTHENIK8_AUDIENCE: z.string().min(1),
  AUTHENIK8_AGENTS: agentRegistry,
  REFRESH_SECRET: z.string().min(32),
  COOKIE_SECURE: booleanString.default(false),
  TRUST_PROXY: booleanString.default(false),
  LOG_LEVEL: z.string().default("info"),
  EMAIL_FROM: z.string().default("Authenik8 <auth@example.com>"),
  RESEND_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional().or(z.literal("")),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_REDIRECT_URI: z.string().url().optional().or(z.literal("")),
<<<<<<< HEAD
}).superRefine((environment, context) => {
  if (environment.NODE_ENV === "production" && environment.REDIS_URL === "memory://") {
    context.addIssue({
      code: "custom",
      path: ["REDIS_URL"],
      message: "must use redis:// or rediss:// in production",
    });
  }
=======
>>>>>>> main
});

const result = schema.safeParse(process.env);
if (!result.success) {
  console.error("Invalid environment configuration", result.error.flatten().fieldErrors);
  throw new Error("Environment validation failed");
}

export const env = result.data;
