export type SigningJwk = Record<string, unknown> & {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  kid: string;
  d?: string;
};

export type SigningKeyRingInspection =
  | {
      valid: true;
      keys: SigningJwk[];
      active: SigningJwk;
    }
  | {
      valid: false;
      error: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function inspectSigningKeyRing(
  source: string | undefined,
  activeKid: string | undefined,
): SigningKeyRingInspection {
  if (!source?.trim()) {
    return {
      valid: false,
      error: "AUTHENIK8_SIGNING_JWKS is missing",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return {
      valid: false,
      error: "AUTHENIK8_SIGNING_JWKS is not valid JSON",
    };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      valid: false,
      error: "AUTHENIK8_SIGNING_JWKS must contain at least one key",
    };
  }

  const keys = parsed.filter(isRecord);
  if (
    keys.length !== parsed.length
    || keys.some(
      (key) =>
        key.kty !== "EC"
        || key.crv !== "P-256"
        || typeof key.kid !== "string"
        || !key.kid
        || typeof key.x !== "string"
        || !key.x
        || typeof key.y !== "string"
        || !key.y
        || (key.alg !== undefined && key.alg !== "ES256")
        || (
          key.d !== undefined
          && (typeof key.d !== "string" || !key.d)
        ),
    )
  ) {
    return {
      valid: false,
      error:
        "the signing key ring must contain only ES256 P-256 JWKs with kid, x, and y",
    };
  }

  const signingKeys = keys as SigningJwk[];
  const keyIds = signingKeys.map((key) => key.kid);
  if (new Set(keyIds).size !== keyIds.length) {
    return {
      valid: false,
      error: "signing key IDs must be unique",
    };
  }
  if (!activeKid?.trim()) {
    return {
      valid: false,
      error: "AUTHENIK8_ACTIVE_KID is missing",
    };
  }

  const active = signingKeys.find((key) => key.kid === activeKid);
  if (!active) {
    return {
      valid: false,
      error:
        "AUTHENIK8_ACTIVE_KID does not select a key in the signing key ring",
    };
  }
  if (!active.d) {
    return {
      valid: false,
      error: "AUTHENIK8_ACTIVE_KID must select a private signing key",
    };
  }

  return {
    valid: true,
    keys: signingKeys,
    active,
  };
}
