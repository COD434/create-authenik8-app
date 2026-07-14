import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.env");
dotenv.config({ path: process.env.AUTHENIK8_ENV_FILE ?? rootEnv });

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(32),
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
});

const result = schema.safeParse(process.env);
if (!result.success) {
  console.error("Invalid environment configuration", result.error.flatten().fieldErrors);
  throw new Error("Environment validation failed");
}

export const env = result.data;
