import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";

const sealedValueSchema = z.string()
  .max(16_384)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

function encryptionKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("authenik8:sealed-value:v1").digest();
}

export function sealValue(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function openSealedValue(value: unknown, secret: string): string | undefined {
  const parsed = sealedValueSchema.safeParse(value);
  if (!parsed.success) return undefined;

  try {
    const [ivValue, tagValue, ciphertextValue] = parsed.data.split(".");
    const iv = Buffer.from(ivValue!, "base64url");
    const tag = Buffer.from(tagValue!, "base64url");
    const ciphertext = Buffer.from(ciphertextValue!, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return undefined;

    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}
