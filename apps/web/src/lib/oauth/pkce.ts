import { randomBytes, createHash } from "crypto";

/**
 * Generate a cryptographically random code verifier for PKCE.
 * Uses a 96-byte random value encoded as base64url (128 chars).
 */
export function generateCodeVerifier(): string {
  return randomBytes(96)
    .toString("base64url")
    .slice(0, 128);
}

/**
 * Generate the code challenge from a code verifier using S256.
 * code_challenge = BASE64URL(SHA256(code_verifier))
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

/**
 * Generate a random state parameter for CSRF protection.
 */
export function generateState(): string {
  return randomBytes(32).toString("base64url");
}
