const sensitiveKeys = new Set(["token", "accessToken", "refreshToken"]);

export function requiredSecret(name: string): string {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length < 32) {
    throw new Error(`${name} must be set to at least 32 characters`);
  }

  return value;
}

export function parseCredentials(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("Email and password are required");
  }

  const { email, password } = body as { email?: unknown; password?: unknown };

  if (typeof email !== "string" || typeof password !== "string") {
    throw new Error("Email and password are required");
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("A valid email is required");
  }

  if (password.length < 8 || password.length > 1024) {
    throw new Error("Password must be between 8 and 1024 characters");
  }

  return { email: normalizedEmail, password };
}

export function parseRefreshToken(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("Refresh token is required");
  }

  const { refreshToken } = body as { refreshToken?: unknown };

  if (typeof refreshToken !== "string" || refreshToken.trim().length < 16) {
    throw new Error("Refresh token is required");
  }

  return refreshToken;
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
