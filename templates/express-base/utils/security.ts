import { z } from "zod";

const sensitiveKeys = new Set(["token", "accessToken", "refreshToken"]);

const secretSchema = z.string().trim().min(32);
export const refreshTokenBodySchema = z.strictObject({
  refreshToken: z.string().trim().min(16, "Refresh token is required").max(4096),
});
const identifierSchema = z.string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

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
