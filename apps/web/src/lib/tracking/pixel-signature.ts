import { createHmac, timingSafeEqual } from "crypto";

/**
 * HMAC-SHA256 signature for tracking-pixel URLs.
 *
 * Keeps attackers from spraying `/api/track/open?id=...&org=...` calls
 * that would otherwise inflate open counts and advance email sequences.
 *
 * Signing key reuses CREDENTIAL_ENCRYPTION_KEY (a 32-byte hex secret) since
 * pixel URLs are server-generated and low-sensitivity relative to that key.
 * Fallback is SCHEDULER_INTERNAL_SECRET for dev convenience.
 */

function getSecret(): string {
  const key =
    process.env.CREDENTIAL_ENCRYPTION_KEY ||
    process.env.SCHEDULER_INTERNAL_SECRET;
  if (!key) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY (or SCHEDULER_INTERNAL_SECRET) must be set for tracking pixel signatures"
    );
  }
  return key;
}

export function signPixelUrl(businessId: string, orgId: string): string {
  const h = createHmac("sha256", getSecret());
  h.update(`${businessId}:${orgId}`);
  // First 16 hex chars = 64 bits. Enough entropy for a tracking pixel —
  // no exposure of plaintext, no replay benefit since the pixel is idempotent per business.
  return h.digest("hex").slice(0, 16);
}

export function verifyPixelSignature(
  businessId: string,
  orgId: string,
  sig: string | null
): boolean {
  if (!sig || sig.length !== 16) return false;
  const expected = signPixelUrl(businessId, orgId);
  // Constant-time comparison
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
  } catch {
    return false;
  }
}
