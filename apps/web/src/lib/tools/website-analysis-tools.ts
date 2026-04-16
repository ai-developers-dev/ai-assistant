import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

interface WebsiteQuality {
  score: number;
  mobile: boolean;
  ssl: boolean;
  platform?: string;
  speed?: string;
  hasContactForm: boolean;
  lastUpdated?: string;
  needsUpgrade: "critical" | "recommended" | "good";
}

// Detect platform from HTML content
function detectPlatform(html: string): string | undefined {
  const lower = html.toLowerCase();
  if (lower.includes("wp-content") || lower.includes("wordpress")) return "wordpress";
  if (lower.includes("squarespace")) return "squarespace";
  if (lower.includes("wix.com") || lower.includes("wixsite")) return "wix";
  if (lower.includes("shopify")) return "shopify";
  if (lower.includes("godaddy")) return "godaddy";
  if (lower.includes("weebly")) return "weebly";
  if (lower.includes("webflow")) return "webflow";
  if (lower.includes("next") || lower.includes("__next")) return "nextjs";
  if (lower.includes("gatsby")) return "gatsby";
  return "custom";
}

// Check for contact form
function hasForm(html: string): boolean {
  const lower = html.toLowerCase();
  return lower.includes("<form") || lower.includes("contact-form") ||
    lower.includes("wpcf7") || lower.includes("formspree") ||
    lower.includes("typeform") || lower.includes("calendly") ||
    lower.includes("book-now") || lower.includes("schedule");
}

// Extract copyright year to estimate last update
function extractLastUpdated(html: string): string | undefined {
  const yearMatch = html.match(/©\s*(20\d{2})|copyright\s*(20\d{2})/i);
  if (yearMatch) return yearMatch[1] || yearMatch[2];
  // Check for recent blog posts
  const blogDate = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*(20\d{2})/i);
  if (blogDate) return blogDate[2];
  return undefined;
}

export async function analyzeWebsiteQuality(
  website: string,
  firecrawlApiKey: string,
  log: string[]
): Promise<WebsiteQuality | null> {
  log.push("── WEBSITE QUALITY CHECK ──");

  try {
    // Normalize URL
    let url = website;
    if (!url.startsWith("http")) url = `https://${url}`;

    // Check SSL
    const ssl = url.startsWith("https://");
    log.push(`  SSL: ${ssl ? "✓ HTTPS" : "✗ HTTP only"}`);

    // Check mobile viewport + content via Firecrawl
    let html = "";
    let mobile = false;
    let hasContactForm = false;
    let platform: string | undefined;
    let lastUpdated: string | undefined;

    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firecrawlApiKey}`,
        },
        body: JSON.stringify({
          url,
          formats: ["html", "markdown"],
          waitFor: 3000,
          timeout: 10000,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        html = data?.data?.html || "";
        const markdown = data?.data?.markdown || "";

        // Mobile check
        mobile = html.includes("viewport") && html.includes("width=device-width");
        log.push(`  Mobile responsive: ${mobile ? "✓" : "✗ No viewport meta"}`);

        // Platform
        platform = detectPlatform(html);
        log.push(`  Platform: ${platform}`);

        // Contact form
        hasContactForm = hasForm(html) || markdown.toLowerCase().includes("contact us");
        log.push(`  Contact form: ${hasContactForm ? "✓" : "✗"}`);

        // Last updated
        lastUpdated = extractLastUpdated(html + markdown);
        log.push(`  Last updated: ${lastUpdated || "unknown"}`);
      } else {
        log.push(`  ✗ Firecrawl returned HTTP ${res.status}`);
      }
    } catch (err: any) {
      log.push(`  ✗ Scrape error: ${err.message?.slice(0, 100)}`);
    }

    // Try Google PageSpeed Insights (free, no API key needed)
    let speed: "fast" | "medium" | "slow" = "medium";
    try {
      const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeedTest?url=${encodeURIComponent(url)}&strategy=mobile&category=performance`;
      const psiRes = await fetch(psiUrl, { signal: AbortSignal.timeout(15000) });
      if (psiRes.ok) {
        const psiData = await psiRes.json();
        const perfScore = psiData?.lighthouseResult?.categories?.performance?.score;
        if (perfScore !== undefined) {
          if (perfScore >= 0.7) speed = "fast";
          else if (perfScore >= 0.4) speed = "medium";
          else speed = "slow";
          log.push(`  PageSpeed score: ${Math.round(perfScore * 100)}/100 (${speed})`);
        }
      }
    } catch {
      log.push("  PageSpeed: timed out (non-fatal)");
    }

    // Calculate overall score
    let score = 50; // baseline
    if (ssl) score += 10;
    if (mobile) score += 15;
    if (hasContactForm) score += 10;
    if (speed === "fast") score += 15;
    else if (speed === "slow") score -= 10;
    if (lastUpdated) {
      const year = parseInt(lastUpdated);
      if (year >= 2025) score += 10;
      else if (year >= 2023) score += 5;
      else if (year <= 2020) score -= 15;
    }
    if (platform === "custom" || platform === "nextjs" || platform === "webflow") score += 5;
    if (platform === "wix" || platform === "godaddy") score -= 5;

    score = Math.max(0, Math.min(100, score));

    // Determine upgrade need
    let needsUpgrade: "critical" | "recommended" | "good" = "good";
    if (score < 40) needsUpgrade = "critical";
    else if (score < 65) needsUpgrade = "recommended";

    log.push(`  WEBSITE SCORE: ${score}/100 → ${needsUpgrade.toUpperCase()}`);

    return { score, mobile, ssl, platform, speed, hasContactForm, lastUpdated, needsUpgrade };
  } catch (err: any) {
    log.push(`  ✗ Website analysis failed: ${err.message?.slice(0, 100)}`);
    return null;
  }
}

export async function saveWebsiteQuality(
  convex: ConvexHttpClient,
  businessId: string,
  quality: WebsiteQuality
) {
  await convex.mutation(api.businesses.updateWebsiteQuality, {
    id: businessId as Id<"businesses">,
    websiteQuality: quality,
  });
}
