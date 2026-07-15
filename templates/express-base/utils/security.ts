import { z } from "zod";
import type { AgentIdentityConfig, Authenik8JwkConfig } from "authenik8-core";

const sensitiveKeys = new Set(["token", "accessToken", "refreshToken"]);

const secretSchema = z.string().trim().min(32);
const environmentValueSchema = z.string().trim().min(1);
const portSchema = z.coerce.number().int().min(1).max(65535);
const signingJwkSchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string().min(1),
  y: z.string().min(1),
  d: z.string().min(1).optional(),
  kid: z.string().min(1),
  alg: z.literal("ES256").optional(),
  use: z.literal("sig").optional(),
});
export const refreshTokenBodySchema = z.strictObject({
  refreshToken: z.string().trim().min(16, "Refresh token is required").max(4096),
});
const identifierSchema = z.string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
const agentIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const agentScopeSchema = z.string().max(128).regex(/^[a-z][a-z0-9._/-]*(?::[a-z][a-z0-9._/-]*)+$/);
const agentRegistrySchema = z.record(
  agentIdSchema,
  z.array(agentScopeSchema).min(1).max(64),
);

export class InputValidationError extends Error {}

function validationMessage(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

export function requiredSecret(name: string): string {
  const result = secretSchema.safeParse(process.env[name]);
  if (!result.success) {
    throw new InputValidationError(`${name} must be set to at least 32 characters`);
  }
  return result.data;
}

export function requiredEnv(name: string): string {
  const result = environmentValueSchema.safeParse(process.env[name]);
  if (!result.success) throw new InputValidationError(`${name} must be set`);
  return result.data;
}

export function requiredPort(): number {
  const result = portSchema.safeParse(process.env.PORT ?? 3000);
  if (!result.success) throw new InputValidationError("PORT must be between 1 and 65535");
  return result.data;
}

export function authJwkConfig(): Authenik8JwkConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(requiredEnv("AUTHENIK8_SIGNING_JWKS"));
  } catch {
    throw new InputValidationError("AUTHENIK8_SIGNING_JWKS must be a valid JSON array");
  }
  const result = z.array(signingJwkSchema).min(1).safeParse(parsed);
  if (!result.success) {
    throw new InputValidationError("AUTHENIK8_SIGNING_JWKS must contain ES256 P-256 JWKs");
  }
  const activeKid = requiredEnv("AUTHENIK8_ACTIVE_KID");
  const activeKey = result.data.find((key) => key.kid === activeKid);
  if (!activeKey?.d) throw new InputValidationError("AUTHENIK8_ACTIVE_KID must select a private signing JWK");
  return {
    keys: result.data,
    activeKid,
    issuer: requiredEnv("AUTHENIK8_ISSUER"),
    audience: requiredEnv("AUTHENIK8_AUDIENCE"),
  };
}

export function agentIdentityConfig(): AgentIdentityConfig | undefined {
  const source = process.env.AUTHENIK8_AGENTS?.trim();
  if (!source) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new InputValidationError("AUTHENIK8_AGENTS must be a JSON object of agent scope arrays");
  }
  const result = agentRegistrySchema.safeParse(parsed);
  if (!result.success) {
    throw new InputValidationError("AUTHENIK8_AGENTS must map valid agent IDs to resource:action scopes");
  }
  if (!Object.keys(result.data).length) return undefined;

  const registry = result.data;
  return {
    resolveAgent: async (agentId) => {
      const scopes = Object.prototype.hasOwnProperty.call(registry, agentId)
        ? registry[agentId]
        : undefined;
      return scopes ? { agentId, scopes, active: true } : null;
    },
  };
}

export function getBearerToken(authorizationHeader: string | undefined): string | undefined {
  const result = z.string().regex(/^Bearer\s+\S+$/).safeParse(authorizationHeader);
  return result.success ? result.data.replace(/^Bearer\s+/, "") : undefined;
}

export function parseRefreshToken(body: unknown): string {
  const result = refreshTokenBodySchema.safeParse(body);
  if (!result.success) {
    throw new InputValidationError(validationMessage(result.error, "Refresh token is required"));
  }
  return result.data.refreshToken;
}

export function parseIdentifier(value: unknown, label: string): string {
  const result = identifierSchema.safeParse(value);
  if (!result.success) throw new InputValidationError(`${label} is invalid`);
  return result.data;
}

export function sanitizeSessionResponse(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeSessionResponse);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !sensitiveKeys.has(key))
      .map(([key, nestedValue]) => [key, sanitizeSessionResponse(nestedValue)]),
  );
}
