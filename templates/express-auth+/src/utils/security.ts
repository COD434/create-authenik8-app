import { z } from "zod";

const sensitiveKeys = new Set(["token", "accessToken", "refreshToken"]);

const passwordSchema = z.string()
  .min(8, "Password must be between 8 and 1024 characters")
  .max(1024, "Password must be between 8 and 1024 characters")
  .refine((password) => !/[\u0000-\u001f\u007f]/.test(password), "Password contains unsupported control characters");

export const credentialsSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email("A valid email is required").max(254),
  password: passwordSchema,
});

const secretSchema = z.string().trim().min(32);
const environmentValueSchema = z.string().trim().min(1);
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

export function requiredEnv(name: string): string {
  const result = environmentValueSchema.safeParse(process.env[name]);
  if (!result.success) throw new InputValidationError(`${name} must be set`);
  return result.data;
}

export function parseCredentials(body: unknown): z.infer<typeof credentialsSchema> {
  const result = credentialsSchema.safeParse(body);
  if (!result.success) {
    throw new InputValidationError(validationMessage(result.error, "Email and password are required"));
  }
  return result.data;
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
