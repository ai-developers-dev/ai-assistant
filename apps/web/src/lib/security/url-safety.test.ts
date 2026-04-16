import { describe, it, expect } from "vitest";
import { isSafeUrl } from "./url-safety";

describe("isSafeUrl", () => {
  it("accepts plain https URLs", () => {
    expect(isSafeUrl("https://example.com/path").ok).toBe(true);
    expect(isSafeUrl("https://api.example.com:8443/x").ok).toBe(true);
  });

  it("accepts plain http URLs (still allowed, but should be https in practice)", () => {
    expect(isSafeUrl("http://example.com").ok).toBe(true);
  });

  it("rejects non-http(s) schemes", () => {
    for (const url of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://example.com",
      "gopher://example.com",
    ]) {
      const r = isSafeUrl(url);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/scheme/i);
    }
  });

  it("rejects loopback hostnames", () => {
    for (const host of ["localhost", "foo.localhost", "service.local"]) {
      const r = isSafeUrl(`http://${host}/path`);
      expect(r.ok).toBe(false);
    }
  });

  it("rejects cloud metadata endpoints (the actual reason this exists)", () => {
    expect(isSafeUrl("http://169.254.169.254/latest/meta-data/").ok).toBe(false);
    expect(isSafeUrl("http://metadata.google.internal/").ok).toBe(false);
    expect(isSafeUrl("http://metadata.goog/").ok).toBe(false);
  });

  it("rejects RFC1918 private ranges", () => {
    for (const ip of [
      "10.0.0.1",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "192.168.255.255",
    ]) {
      const r = isSafeUrl(`http://${ip}/`);
      expect(r.ok).toBe(false);
    }
  });

  it("rejects 127.0.0.0/8 loopback and 0.0.0.0/8 unspecified", () => {
    expect(isSafeUrl("http://127.0.0.1/").ok).toBe(false);
    expect(isSafeUrl("http://127.255.255.255/").ok).toBe(false);
    expect(isSafeUrl("http://0.0.0.0/").ok).toBe(false);
  });

  it("rejects IPv6 loopback", () => {
    expect(isSafeUrl("http://[::1]/").ok).toBe(false);
  });

  it("permits public IPs that happen to look private-adjacent", () => {
    // 172.15.x.x is public (RFC1918 starts at 172.16)
    expect(isSafeUrl("http://172.15.0.1/").ok).toBe(true);
    // 172.32.x.x is public (RFC1918 ends at 172.31)
    expect(isSafeUrl("http://172.32.0.1/").ok).toBe(true);
  });

  it("rejects malformed URLs", () => {
    expect(isSafeUrl("not a url").ok).toBe(false);
    expect(isSafeUrl("").ok).toBe(false);
  });
});
