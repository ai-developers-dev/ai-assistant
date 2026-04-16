import { describe, it, expect, beforeAll } from "vitest";
import { signPixelUrl, verifyPixelSignature } from "./pixel-signature";

describe("pixel-signature", () => {
  beforeAll(() => {
    // Set a stable secret for deterministic tests. The module reads the env
    // lazily in getSecret(), so this takes effect before the first call.
    process.env.CREDENTIAL_ENCRYPTION_KEY = "test-secret-do-not-use-in-prod";
  });

  it("signPixelUrl is deterministic for the same inputs", () => {
    const sig1 = signPixelUrl("biz_abc", "org_xyz");
    const sig2 = signPixelUrl("biz_abc", "org_xyz");
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(16);
    expect(sig1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("signPixelUrl differs when business or org differs", () => {
    const base = signPixelUrl("biz_abc", "org_xyz");
    expect(signPixelUrl("biz_abD", "org_xyz")).not.toBe(base);
    expect(signPixelUrl("biz_abc", "org_xyZ")).not.toBe(base);
  });

  it("verifyPixelSignature accepts valid signatures", () => {
    const sig = signPixelUrl("biz_abc", "org_xyz");
    expect(verifyPixelSignature("biz_abc", "org_xyz", sig)).toBe(true);
  });

  it("verifyPixelSignature rejects tampered signatures", () => {
    const sig = signPixelUrl("biz_abc", "org_xyz");
    // Swap business id — signature shouldn't match
    expect(verifyPixelSignature("biz_other", "org_xyz", sig)).toBe(false);
    // Swap org id
    expect(verifyPixelSignature("biz_abc", "org_other", sig)).toBe(false);
  });

  it("verifyPixelSignature rejects null / wrong-length / malformed sigs", () => {
    expect(verifyPixelSignature("biz_abc", "org_xyz", null)).toBe(false);
    expect(verifyPixelSignature("biz_abc", "org_xyz", "")).toBe(false);
    expect(verifyPixelSignature("biz_abc", "org_xyz", "tooshort")).toBe(false);
    // 16 chars but not valid hex — timingSafeEqual should reject
    expect(verifyPixelSignature("biz_abc", "org_xyz", "zzzzzzzzzzzzzzzz")).toBe(false);
  });
});
