import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Derive a per-organization encryption key from the master key using HMAC-SHA256.
 * This ensures each org's data is encrypted with a unique key.
 */
function deriveKey(orgId: string): Buffer {
  const masterKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is not configured");
  }
  // HMAC-SHA256(masterKey, orgId) → 256-bit derived key
  return createHmac("sha256", Buffer.from(masterKey, "hex"))
    .update(orgId)
    .digest();
}

/**
 * Encrypt plaintext with AES-256-GCM using a per-org derived key.
 * Returns a string in the format: "iv:ciphertext:tag" (all base64).
 */
export function encrypt(plaintext: string, orgId: string): string {
  const key = deriveKey(orgId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${encrypted}:${tag.toString("base64")}`;
}

/**
 * Decrypt a string produced by encrypt().
 * Expects format: "iv:ciphertext:tag" (all base64).
 */
export function decrypt(encryptedString: string, orgId: string): string {
  const key = deriveKey(orgId);
  const parts = encryptedString.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted string format");
  }

  const iv = Buffer.from(parts[0], "base64");
  const ciphertext = parts[1];
  const tag = Buffer.from(parts[2], "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
