/**
 * Reject URLs that the AI agent should not be allowed to fetch:
 * - Non-HTTP(S) schemes (file://, javascript:, data:, etc.)
 * - localhost / loopback (127.0.0.0/8, ::1)
 * - RFC1918 private ranges (10/8, 172.16/12, 192.168/16)
 * - Link-local (169.254/16) — includes cloud metadata services
 * - Unspecified (0.0.0.0)
 *
 * Call before passing any agent/user-provided URL to outbound scraping tools
 * (Firecrawl, web search, contact-form submission, website quality analysis).
 *
 * This is a first line of defense. The actual scraping service (Firecrawl)
 * likely also blocks internal ranges, but we don't want to rely on that.
 */

export function isSafeUrl(input: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  // Only http(s). Blocks file://, javascript:, data:, ftp:, gopher:, etc.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Disallowed scheme: ${url.protocol}` };
  }

  const host = url.hostname.toLowerCase();

  // Reject bare IP literals that match internal ranges.
  // (Doesn't catch DNS rebinding — that would require resolving the hostname,
  // which is more complex. This is the pragmatic baseline.)
  if (isInternalIpLiteral(host)) {
    return { ok: false, reason: `Disallowed host: ${host}` };
  }

  // Reject common local hostnames.
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal" ||
    host === "metadata.goog"
  ) {
    return { ok: false, reason: `Disallowed host: ${host}` };
  }

  return { ok: true, url };
}

function isInternalIpLiteral(host: string): boolean {
  // URL.hostname returns IPv6 literals wrapped in brackets (e.g. "[::1]").
  // Normalize by stripping them before comparing.
  const h = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

  // IPv6 loopback / unspecified
  if (h === "::1" || h === "0:0:0:0:0:0:0:1" || h === "::") return true;
  // IPv4-mapped IPv6 loopback
  if (h.startsWith("::ffff:127.")) return true;

  // IPv4 literal
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;

  const octets = m.slice(1).map(Number);
  if (octets.some((o) => o < 0 || o > 255)) return false;
  const [a, b] = octets;

  // 0.0.0.0/8 unspecified
  if (a === 0) return true;
  // 10.0.0.0/8 private
  if (a === 10) return true;
  // 127.0.0.0/8 loopback
  if (a === 127) return true;
  // 169.254.0.0/16 link-local (includes cloud metadata like 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 private
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 private
  if (a === 192 && b === 168) return true;

  return false;
}
