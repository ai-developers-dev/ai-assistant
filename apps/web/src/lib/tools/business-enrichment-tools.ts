import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { apolloSearchOwner } from "./apollo-tools";
import { analyzeWebsiteQuality, saveWebsiteQuality } from "./website-analysis-tools";
import { isSafeUrl } from "@/lib/security/url-safety";

// ── Config ─────────────────────────────────────────────────────────

interface BusinessEnrichmentConfig {
  firecrawlApiKey: string;
  outscraperApiKey?: string;
  hunterApiKey?: string;
  apolloApiKey?: string;
  organizationId: Id<"organizations">;
  convex: ConvexHttpClient;
}

interface Review {
  reviewerName: string;
  text: string;
  rating: number;
  relativeTime: string;
}

// ── Firecrawl scrape helper (with logging + retries + JS wait) ───

async function firecrawlScrape(
  url: string,
  apiKey: string,
  log: string[]
): Promise<string> {
  const safe = isSafeUrl(url);
  if (!safe.ok) {
    log.push(`Refused URL ${url}: ${safe.reason}`);
    return "";
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          waitFor: 3000,
          timeout: 15000,
          onlyMainContent: true,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        log.push(`  → ${url}: HTTP ${res.status} (${errText.slice(0, 100)})`);
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return "";
      }

      const data = await res.json();
      const md: string = data.data?.markdown || "";
      log.push(`  → ${url}: ${md.length} chars${md.length > 50 ? " ✓" : " (too short)"}`);
      return md;
    } catch (err: any) {
      log.push(`  → ${url}: Error — ${err.message?.slice(0, 100)}`);
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      return "";
    }
  }
  return "";
}

// ── Firecrawl search helper (with logging + retries) ─────────────

async function firecrawlSearch(
  query: string,
  apiKey: string,
  log: string[],
  limit = 5
): Promise<Array<{ url: string; title: string; description: string; markdown?: string }>> {
  log.push(`  🔍 Search: "${query}" (limit ${limit})`);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          limit,
          scrapeOptions: { formats: ["markdown"] },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        log.push(`  → Search failed: HTTP ${res.status} (${errText.slice(0, 100)})`);
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return [];
      }

      const data = await res.json();
      const results = data.data || [];
      log.push(`  → Search returned ${results.length} results`);
      return results;
    } catch (err: any) {
      log.push(`  → Search error: ${err.message?.slice(0, 100)}`);
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      return [];
    }
  }
  return [];
}

// ── Find Place ID via Outscraper ─────────────────────────────────

async function findPlaceId(businessName: string, city: string, state: string, apiKey: string, log: string[]): Promise<string | null> {
  try {
    log.push(`  Searching Outscraper for Place ID...`);
    const params = new URLSearchParams({
      query: `${businessName} ${city}, ${state}`,
      limit: "1",
      async: "false",
      language: "en",
      region: "us",
    });
    const res = await fetch(`https://api.app.outscraper.com/maps/search-v3?${params}`, {
      headers: { "X-API-KEY": apiKey },
    });
    if (!res.ok) { log.push(`  → Place ID search: HTTP ${res.status}`); return null; }
    const data = await res.json();
    const result = data?.data?.[0]?.[0];
    const placeId = result?.place_id;
    if (placeId) {
      log.push(`  → Found Place ID: ${placeId} (${result?.name || ""})`);
    } else {
      log.push(`  → Place ID not found in Outscraper results`);
    }
    return placeId || null;
  } catch (err: any) {
    log.push(`  → Place ID search error: ${err.message?.slice(0, 100)}`);
    return null;
  }
}

// ── Outscraper Google reviews helper ─────────────────────────────

async function getOutscraperReviews(
  placeId: string,
  apiKey: string,
  log: string[]
): Promise<Review[]> {
  try {
    const params = new URLSearchParams({
      query: placeId,
      reviewsLimit: "10",
      async: "false",
      sort: "newest",
      language: "en",
    });
    const res = await fetch(
      `https://api.app.outscraper.com/maps/reviews-v3?${params}`,
      { headers: { "X-API-KEY": apiKey } }
    );
    if (!res.ok) {
      log.push(`  → Outscraper reviews: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    // Outscraper reviews-v3 can return reviews in different structures:
    // 1. data[0] = array of review objects (direct)
    // 2. data[0] = business object with reviews_data array
    // 3. data[0][0] = nested business object
    let rawReviews: any[] = [];
    const d0 = data?.data?.[0];
    if (Array.isArray(d0) && d0.length > 0) {
      // Check if first element has review_text (it's a review array)
      if (d0[0]?.review_text !== undefined) {
        rawReviews = d0;
      } else if (d0[0]?.reviews_data) {
        // Nested business object with reviews_data
        rawReviews = d0[0].reviews_data || [];
      }
    } else if (d0?.reviews_data) {
      // Direct business object with reviews_data
      rawReviews = d0.reviews_data || [];
    } else if (d0?.review_text !== undefined) {
      // Single review object
      rawReviews = [d0];
    }
    const reviews: Review[] = rawReviews.slice(0, 10).map((r: any) => ({
      reviewerName: r.author_title || r.author_name || "A customer",
      text: (r.review_text || "").slice(0, 500),
      rating: r.review_rating || 5,
      relativeTime: r.review_datetime_utc || "recently",
    }));
    log.push(`  → Outscraper reviews: ${reviews.length} reviews fetched (raw: ${rawReviews.length}) ✓`);
    return reviews;
  } catch (err: any) {
    log.push(`  → Outscraper reviews: Error — ${err.message?.slice(0, 100)}`);
    return [];
  }
}

// ── Extract owner name from text (improved) ──────────────────────

const OWNER_NAME_BLOCKLIST = new Set([
  // Pronouns
  "our", "us", "your", "the", "my", "his", "her", "their", "we", "i", "you", "it",
  // Common phrases
  "our team", "your business", "our business", "our company",
  "contact us", "about us", "meet us", "our staff", "the team", "the owner",
  "read more", "learn more", "click here", "find out", "get started",
  "privacy policy", "terms of", "all rights", "cookie policy",
  // Adjectives/adverbs (prevent review text extraction)
  "small", "local", "best", "top", "great", "new", "free", "home", "all",
  "has", "been", "have", "had", "was", "were", "are", "is",
  "very", "really", "always", "never", "just", "also", "even", "still",
  "highly", "extremely", "absolutely", "definitely", "certainly", "truly",
  "amazing", "awesome", "excellent", "wonderful", "fantastic", "terrible",
  "good", "bad", "nice", "fair", "poor", "fine", "okay",
  "professional", "friendly", "responsive", "reliable", "honest",
  "unfailingly", "incredibly", "exceptionally", "remarkably",
  // Common verbs
  "called", "came", "went", "got", "made", "did", "said", "told",
  "fixed", "replaced", "installed", "repaired", "cleaned", "painted",
  "recommended", "hired", "used", "found", "needed", "wanted",
  // Business terms
  "services", "service", "company", "business", "contractor", "plumbing",
  "heating", "cooling", "electric", "roofing", "landscaping", "painting",
]);

// Validate that a string looks like a real person's name
function isValidPersonName(name: string): boolean {
  const words = name.trim().split(/\s+/);
  // Must be 2-3 words (first + last, or first + middle + last)
  if (words.length < 2 || words.length > 3) return false;
  // Each word must start with uppercase letter
  if (!words.every(w => /^[A-Z][a-z]+$/.test(w))) return false;
  // No word should be a common non-name word
  const badWords = new Set(["The", "And", "Our", "Your", "This", "That", "Has", "Been", "Very", "Not"]);
  if (words.some(w => badWords.has(w))) return false;
  // Each word should be 2-15 chars
  if (words.some(w => w.length < 2 || w.length > 15)) return false;
  return true;
}

function extractOwnerInfo(text: string): { name?: string; title?: string } {
  // Name component: supports hyphens, apostrophes, multi-word names
  const nameChar = `[A-Z][a-zA-Z'-]+`;
  const twoWordName = `${nameChar}\\s+${nameChar}`;
  const threeWordName = `${nameChar}\\s+${nameChar}\\s+${nameChar}`;

  const patterns: RegExp[] = [
    // Title before name: "Owner: John Smith", "CEO John Smith-Jones"
    new RegExp(
      `(?:owner|founder|president|ceo|proprietor|principal|managing director|director|co-founder)[:\\s]+?(${threeWordName}|${twoWordName})`,
      "i"
    ),
    // Name before title: "John Smith, Owner"
    new RegExp(
      `(${threeWordName}|${twoWordName}),?\\s+(?:owner|founder|president|ceo|proprietor|operator|managing director|director|co-founder)`,
      "i"
    ),
    // "Owned and operated by ..."
    new RegExp(
      `(?:owned and operated by|started by|established by|run by|created by|built by)\\s+(${threeWordName}|${twoWordName})`,
      "i"
    ),
    // "Founded in YYYY by Name"
    new RegExp(
      `(?:founded|established|started)\\s+in\\s+\\d{4}\\s+by\\s+(${threeWordName}|${twoWordName})`,
      "i"
    ),
    // "[Name] started|founded|established|owns|operates ..."
    new RegExp(
      `(${threeWordName}|${twoWordName})\\s+(?:started|founded|established|owns|operates|launched|created)\\s`,
      "i"
    ),
    // "Hi, I'm [Name]" or "My name is [Name]" or "I am [Name]"
    new RegExp(
      `(?:Hi,?\\s+I'?m|My name is|I am)\\s+(${threeWordName}|${twoWordName})`,
      "i"
    ),
    // "Meet [Name]" or "Contact [Name]" or "About [Name]"
    new RegExp(
      `(?:meet|contact|about)\\s+(${threeWordName}|${twoWordName})(?:\\s|$|,|\\.)`,
      "i"
    ),
    // "Meet our team" section headings followed by a name on a new line
    new RegExp(
      `(?:meet our team|our team|the team|leadership)[\\s\\S]{0,100}?\\n\\s*(${threeWordName}|${twoWordName})(?:\\s|$|,|\\.)`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const name = match[1].trim();
      const nameLower = name.toLowerCase();
      const words = nameLower.split(/\s+/);

      // Reject false positives — must pass ALL checks
      if (
        words.some((w) => OWNER_NAME_BLOCKLIST.has(w)) ||
        OWNER_NAME_BLOCKLIST.has(nameLower) ||
        /\b(llc|inc|corp|ltd|team|company|business|service|group)\b/i.test(name) ||
        !isValidPersonName(name) // Must look like a real name (2-3 capitalized words)
      ) {
        continue;
      }

      return { name };
    }
  }

  return {};
}

// ── Find emails in text (improved) ───────────────────────────────

const EMAIL_BLOCKLIST = [
  "example.",
  "noreply",
  "no-reply",
  "@sentry",
  "@wordpress",
  "@woocommerce",
  "@gravatar",
  "@squarespace",
  "@wix.com",
  "@godaddy",
  "@hostgator",
  "info@example",
  "test@",
  "admin@example",
  "support@firecrawl",
  "@users.noreply",
  "@localhost",
  "@email.com",
  "name@domain",
  "user@",
  "yourname@",
  "youremail@",
  "email@email",
  "@123.com",
  "sample@",
  "demo@",
  "placeholder",
];

function findEmails(text: string, preferDomain?: string): string[] {
  // Match standard emails + mailto: links
  const standardMatches = [
    ...text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g),
  ];
  const mailtoMatches = [
    ...text.matchAll(/mailto:([^)"'\s]+)/g),
  ];

  const allEmails = new Set<string>();
  for (const m of standardMatches) allEmails.add(m[0].toLowerCase());
  for (const m of mailtoMatches) allEmails.add(m[1].toLowerCase().replace(/\?.*$/, ""));

  const domainMatched: string[] = [];
  const others: string[] = [];

  for (const email of allEmails) {
    if (EMAIL_BLOCKLIST.some((b) => email.includes(b))) continue;
    // Skip emails that look auto-generated
    if (/^[0-9a-f]{10,}@/.test(email)) continue;

    if (preferDomain && email.endsWith(`@${preferDomain}`)) {
      domainMatched.push(email);
    } else {
      others.push(email);
    }
  }

  // Domain-matching emails first, then others
  return [...domainMatched, ...others];
}

// ── Extract Facebook URL ─────────────────────────────────────────

const FB_REJECT_PATHS = [
  "/share", "/events/", "/groups/", "/permalink/",
  "/photo/", "/reel/", "/video/", "/watch/", "/marketplace/",
  "/login", "/help/", "/policies/",
];
const FB_PAGE_PATTERN =
  /facebook\.com\/(?:pages\/[^/?#]+|[a-zA-Z0-9][a-zA-Z0-9._-]{2,})(?:[/?#]|$)/;

function extractFacebookUrl(
  results: Array<{ url: string; title: string; description: string }>
): string | undefined {
  for (const r of results) {
    const url = r.url;
    if (!url.includes("facebook.com")) continue;
    if (FB_REJECT_PATHS.some((path) => url.includes(path))) continue;
    if (!FB_PAGE_PATTERN.test(url)) continue;
    return url;
  }
  return undefined;
}

// ── Extract LinkedIn URLs ────────────────────────────────────────

function extractLinkedInUrl(
  results: Array<{ url: string; title: string; description: string }>
): { companyUrl?: string; ownerUrl?: string } {
  const companyPageResult = results.find((r) =>
    r.url.includes("linkedin.com/company")
  );
  const ownerResult = results.find((r) =>
    r.url.includes("linkedin.com/in/")
  );

  return {
    companyUrl: companyPageResult?.url,
    ownerUrl: ownerResult?.url,
  };
}

// ── Factory: createBusinessEnrichmentTool ─────────────────────────

export function createBusinessEnrichmentTool(config: BusinessEnrichmentConfig) {
  return tool({
    description:
      "Enrich a business: scrape its website for owner name and email, fetch Google reviews via Outscraper, search Facebook and LinkedIn for profiles. Saves all found data to the database with a detailed enrichment log.",
    parameters: z.object({
      businessId: z.string().describe("The Convex business record ID to enrich"),
      businessName: z.string().describe("Name of the business"),
      city: z.string().describe("City the business is in"),
      state: z.string().describe("State code"),
      website: z.string().optional().describe("Business website URL if known"),
      category: z.string().optional().describe("Business category"),
      googlePlaceId: z.string().optional().describe("Google Place ID for review fetching"),
    }),
    execute: async ({
      businessId,
      businessName,
      city,
      state,
      website,
      category,
      googlePlaceId,
    }) => {
      const log: string[] = [
        `=== Enrichment for ${businessName} (${city}, ${state}) ===`,
        `Website: ${website || "NONE"}`,
        `Category: ${category || "unknown"}`,
        `Google Place ID: ${googlePlaceId || "NONE"}`,
        "",
      ];

      const found: {
        ownerName?: string;
        email?: string;
        metaPageUrl?: string;
        linkedinUrl?: string;
        linkedinOwnerUrl?: string;
        reviews: Review[];
      } = { reviews: [] };

      try {
        // ════════════════════════════════════════════════════════════════
        // STEP 0 — APOLLO.IO (fastest, most accurate)
        // ════════════════════════════════════════════════════════════════
        log.push("── STEP 0: Apollo.io ──");
        if (config.apolloApiKey) {
          const apollo = await apolloSearchOwner(businessName, city, state, config.apolloApiKey, log);
          if (apollo) {
            if (apollo.name) found.ownerName = apollo.name;
            if (apollo.email) found.email = apollo.email;
            if (apollo.linkedinUrl) found.linkedinOwnerUrl = apollo.linkedinUrl;
            // Store phone if schema supports it (save for later)
          }
        } else {
          log.push("  (skipped — no Apollo.io API key configured)");
        }
        log.push("");

        // ══════════════════════��═════════════════════════════════════════
        // STEP 1 — HUNTER.IO (cheap email + owner finder — $0.01/call)
        // ════════════════════════════════════════════════════════════════
        // STEP 1 — WEBSITE SCRAPING (ONLY if still missing owner or email)
        // Optimized: scrape only 2-3 key pages instead of 10
        // ════════════════════════════════════════════════════════════════
        log.push("── STEP 1: Website scraping ──");

        const needOwner = !found.ownerName;
        const needEmail = !found.email;

        if (website && (needOwner || needEmail)) {
          const base = website.replace(/\/?$/, "");
          const websiteDomain = (() => {
            try { return new URL(website).hostname.replace(/^www\./, ""); } catch { return ""; }
          })();

          // Only scrape pages most likely to have what we need
          const pagesToScrape = needEmail
            ? [`${base}/contact`, `${base}/contact-us`, `${base}/about`]  // email pages
            : [`${base}/about`, `${base}/about-us`, `${base}/our-team`];  // owner pages

          log.push(`  Scraping ${pagesToScrape.length} pages (need: ${needOwner ? "owner " : ""}${needEmail ? "email" : ""})`);
          const allEmails: string[] = [];

          for (const url of pagesToScrape) {
            const content = await firecrawlScrape(url, config.firecrawlApiKey, log);
            if (content.length > 50) {
              if (!found.ownerName) {
                const ownerInfo = extractOwnerInfo(content);
                if (ownerInfo.name) {
                  found.ownerName = ownerInfo.name;
                  log.push(`  ✓ Owner found: ${ownerInfo.name}`);
                }
              }
              if (!found.email) {
                const pageEmails = findEmails(content, websiteDomain);
                allEmails.push(...pageEmails);
              }
            }
            // Stop early if we found everything
            if (found.ownerName && (found.email || allEmails.length > 0)) break;
          }

          if (!found.email && allEmails.length > 0) {
            const uniqueEmails = [...new Set(allEmails)];
            found.email = uniqueEmails[0];
            log.push(`  ✓ Email selected: ${found.email}`);
          }
          if (!found.ownerName) log.push("  ✗ No owner found on website");
          if (!found.email && allEmails.length === 0) log.push("  ✗ No email found on website");
        } else if (!website) {
          log.push("  (skipped — no website)");
        } else {
          log.push(`  (skipped — already have owner: ${found.ownerName}, email: ${found.email})`);
        }

        log.push("");

        // ════════════════════════════════════════════════════════════════
        // STEP 2.5 — GOOGLE SEARCH FALLBACK (ONLY if still missing)
        // ════════════════════════════════════════════════════════════════
        if (!found.ownerName || !found.email) {
          log.push("── STEP 2.5: Google search fallback ──");

          if (!found.ownerName) {
            const ownerResults = await firecrawlSearch(
              `"${businessName}" ${city} ${state} owner founder`,
              config.firecrawlApiKey, log, 3
            );
            for (const r of ownerResults) {
              const text = `${r.title} ${r.description} ${r.markdown || ""}`;
              const ownerInfo = extractOwnerInfo(text);
              if (ownerInfo.name) {
                found.ownerName = ownerInfo.name;
                log.push(`  ✓ Owner via search: ${ownerInfo.name}`);
                break;
              }
            }
            if (!found.ownerName) log.push("  ✗ No owner via search");
          }

          if (!found.email) {
            const emailResults = await firecrawlSearch(
              `"${businessName}" ${city} email contact`,
              config.firecrawlApiKey, log, 3
            );
            for (const r of emailResults) {
              const text = `${r.description} ${r.markdown || ""}`;
              const emails = findEmails(text);
              if (emails.length > 0) {
                found.email = emails[0];
                log.push(`  ✓ Email via search: ${found.email}`);
                break;
              }
            }
            if (!found.email) log.push("  ✗ No email via search");
          }

          log.push("");
        }

        // ════════════════════════════════════════════════════════════════
        // STEP 2.5 — HUNTER.IO (last resort for email if still not found)
        // ════════════════════════════════════════════════════════════════
        if (!found.email && config.hunterApiKey && website) {
          log.push("── STEP 2.5: Hunter.io (last resort) ──");
          try {
            const hunterDomain = (() => {
              try { return new URL(website).hostname.replace(/^www\./, ""); } catch { return ""; }
            })();
            if (hunterDomain) {
              log.push(`  Searching Hunter.io for ${hunterDomain}...`);
              const hunterRes = await fetch(
                `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(hunterDomain)}&api_key=${config.hunterApiKey}`
              );
              if (hunterRes.ok) {
                const hunterData = await hunterRes.json();
                const hunterEmails = hunterData.data?.emails || [];
                log.push(`  → Hunter.io returned ${hunterEmails.length} emails`);

                const ownerPositions = ["owner", "ceo", "founder", "president", "co-founder", "proprietor"];
                const ownerEmail = hunterEmails.find((e: any) =>
                  e.position && ownerPositions.some(p => e.position.toLowerCase().includes(p))
                );
                if (ownerEmail && !found.ownerName && ownerEmail.first_name && ownerEmail.last_name) {
                  found.ownerName = `${ownerEmail.first_name} ${ownerEmail.last_name}`;
                  log.push(`  ✓ Owner from Hunter.io: ${found.ownerName} (${ownerEmail.position})`);
                }

                const bestEmail = ownerEmail || hunterEmails.sort((a: any, b: any) => (b.confidence || 0) - (a.confidence || 0))[0];
                if (bestEmail?.value) {
                  found.email = bestEmail.value;
                  log.push(`  ✓ Email from Hunter.io: ${found.email} (confidence: ${bestEmail.confidence || "?"}%)`);
                }
              } else {
                log.push(`  → Hunter.io: HTTP ${hunterRes.status}`);
              }
            }
          } catch (err: any) {
            log.push(`  → Hunter.io error: ${err.message?.slice(0, 100)}`);
          }
          log.push("");
        }

        // ════════════════════════════════════════════════════════════════
        // STEP 3 — GOOGLE REVIEWS (via Outscraper)
        // ════════════════════════════════════════════════════════════════
        log.push("── STEP 3: Google reviews ──");

        if (config.outscraperApiKey) {
          let resolvedPlaceId = googlePlaceId || null;
          if (!resolvedPlaceId) {
            resolvedPlaceId = await findPlaceId(businessName, city, state, config.outscraperApiKey, log);
          }
          if (resolvedPlaceId) {
            found.reviews = await getOutscraperReviews(
              resolvedPlaceId,
              config.outscraperApiKey,
              log
            );
          } else {
            log.push("  (skipped — could not determine Google Place ID)");
          }
        } else {
          log.push("  (skipped — no Outscraper API key configured)");
        }

        log.push("");

        // ════════════════════════════════════════════════════════════════
        // STEP 4 — FACEBOOK SEARCH
        // ════════════════════════════════════════════════════════════════
        log.push("── STEP 4: Facebook ──");

        const fbResults = await firecrawlSearch(
          `"${businessName}" ${city} facebook`,
          config.firecrawlApiKey,
          log,
          5
        );
        found.metaPageUrl = extractFacebookUrl(fbResults);

        if (found.metaPageUrl) {
          log.push(`  ✓ Facebook page: ${found.metaPageUrl}`);
        } else {
          log.push("  ✗ No Facebook business page found");
        }

        // If we have owner name, also search for their personal Facebook
        if (found.ownerName) {
          const ownerFbResults = await firecrawlSearch(
            `${found.ownerName} ${city} facebook`,
            config.firecrawlApiKey,
            log,
            3
          );
          const personalFb = ownerFbResults.find(
            (r) =>
              r.url.includes("facebook.com") &&
              !FB_REJECT_PATHS.some((p) => r.url.includes(p)) &&
              r.url !== found.metaPageUrl
          );
          if (!found.metaPageUrl && personalFb) {
            found.metaPageUrl = personalFb.url;
            log.push(`  ✓ Facebook (owner personal): ${personalFb.url}`);
          }
        }

        log.push("");

        // ════════════════════════════════════════════════════════════════
        // STEP 5 — LINKEDIN SEARCH (skip if Apollo already found it)
        // ════════════════════════════════════════════════════════════════
        log.push("── STEP 5: LinkedIn ──");

        if (found.linkedinOwnerUrl && found.linkedinUrl) {
          log.push(`  (skipped — Apollo already found both LinkedIn URLs)`);
          log.push(`  Company: ${found.linkedinUrl}`);
          log.push(`  Owner: ${found.linkedinOwnerUrl}`);
        } else {
          // Only search for what's missing
          if (!found.linkedinUrl) {
            const liResults = await firecrawlSearch(
              `"${businessName}" linkedin.com/company`,
              config.firecrawlApiKey,
              log,
              5
            );
            const liUrls = extractLinkedInUrl(liResults);
            if (liUrls.companyUrl) found.linkedinUrl = liUrls.companyUrl;
            if (!found.linkedinOwnerUrl && liUrls.ownerUrl) found.linkedinOwnerUrl = liUrls.ownerUrl;
          }

          if (found.linkedinUrl) {
            log.push(`  ✓ Company LinkedIn: ${found.linkedinUrl}`);
          } else {
            log.push("  ✗ No LinkedIn company page found");
          }

          // Search for owner LinkedIn only if not found yet
          if (found.ownerName && !found.linkedinOwnerUrl) {
            const ownerLiResults = await firecrawlSearch(
              `${found.ownerName} "${businessName}" linkedin.com/in`,
              config.firecrawlApiKey,
              log,
              3
            );
            const ownerLi = extractLinkedInUrl(ownerLiResults);
            if (ownerLi.ownerUrl) found.linkedinOwnerUrl = ownerLi.ownerUrl;
          }

          if (found.linkedinOwnerUrl) {
            log.push(`  ✓ Owner LinkedIn: ${found.linkedinOwnerUrl}`);
          } else if (!found.linkedinOwnerUrl) {
            log.push("  ✗ No LinkedIn owner profile found");
          }
        }

        log.push("");

        // ════════════════════════════════════════════════════════════════
        // STEP 5.5 — SCRAPE FB/LINKEDIN PROFILES FOR OUTREACH DATA
        // ════════════════════════════════════════════════════════════════
        let facebookData: { about?: string; recentPosts?: { text: string; date?: string }[] } | undefined;
        let linkedinData: { headline?: string; about?: string; recentPosts?: { text: string; date?: string }[] } | undefined;

        if (found.metaPageUrl && config.firecrawlApiKey) {
          log.push("── STEP 5.5a: Scrape Facebook page ──");
          try {
            const fbContent = await firecrawlScrape(found.metaPageUrl, config.firecrawlApiKey, log);
            if (fbContent) {
              const aboutMatch = fbContent.match(/(?:About|Bio|Description)[:\n]+([\s\S]{10,500}?)(?:\n\n|\n[A-Z]|$)/i);
              const postMatches = [...fbContent.matchAll(/(?:Posted|Published|·)\s*(\w+ \d+|\d+ (?:hours?|days?|weeks?) ago)[\s\S]{0,50}?\n([\s\S]{20,300}?)(?:\n\n|\nLike|\nComment|$)/gi)];
              facebookData = {
                about: aboutMatch ? aboutMatch[1].trim().slice(0, 500) : undefined,
                recentPosts: postMatches.slice(0, 3).map(m => ({
                  text: m[2].trim().slice(0, 300),
                  date: m[1]?.trim(),
                })),
              };
              if (facebookData.about || (facebookData.recentPosts && facebookData.recentPosts.length > 0)) {
                log.push(`  ✓ FB data: about=${!!facebookData.about}, posts=${facebookData.recentPosts?.length || 0}`);
              } else {
                facebookData = undefined;
                log.push("  ✗ No useful FB data extracted");
              }
            }
          } catch (err: any) {
            log.push(`  ✗ FB scrape error: ${err.message?.slice(0, 100)}`);
          }
        }

        if (found.linkedinUrl && config.firecrawlApiKey) {
          log.push("── STEP 5.5b: Scrape LinkedIn page ──");
          try {
            const liContent = await firecrawlScrape(found.linkedinUrl, config.firecrawlApiKey, log);
            if (liContent) {
              const headlineMatch = liContent.match(/(?:Headline|Tagline)[:\n]+([\s\S]{5,200}?)(?:\n|$)/i);
              const aboutMatch = liContent.match(/(?:About|Overview|Description)[:\n]+([\s\S]{10,500}?)(?:\n\n|\n[A-Z]|$)/i);
              linkedinData = {
                headline: headlineMatch ? headlineMatch[1].trim().slice(0, 200) : undefined,
                about: aboutMatch ? aboutMatch[1].trim().slice(0, 500) : undefined,
              };
              if (linkedinData.headline || linkedinData.about) {
                log.push(`  ✓ LinkedIn data: headline=${!!linkedinData.headline}, about=${!!linkedinData.about}`);
              } else {
                linkedinData = undefined;
                log.push("  ✗ No useful LinkedIn data extracted");
              }
            }
          } catch (err: any) {
            log.push(`  ✗ LinkedIn scrape error: ${err.message?.slice(0, 100)}`);
          }
        }

        log.push("");

        // ════════════════════════════════════════════════════════════════
        // STEP 5.6 — WEBSITE QUALITY ASSESSMENT
        // ════════════════════════════════════════════════════════════════
        let websiteQuality: any = undefined;
        if (website && config.firecrawlApiKey) {
          log.push("── STEP 5.6: Website Quality Assessment ──");
          try {
            websiteQuality = await analyzeWebsiteQuality(website, config.firecrawlApiKey, log);
            if (websiteQuality) {
              await saveWebsiteQuality(config.convex, businessId, websiteQuality);
            }
          } catch (err: any) {
            log.push(`  ✗ Website quality error: ${err.message?.slice(0, 100)}`);
          }
        }

        // If no email found and website has a contact form, save the form URL
        if (!found.email && website && websiteQuality?.hasContactForm) {
          const contactUrl = website.replace(/\/$/, "") + "/contact";
          log.push(`  → No email found, but contact form detected. Saving form URL: ${contactUrl}`);
          try {
            await config.convex.mutation(api.businesses.updateEnrichment, {
              id: businessId as Id<"businesses">,
              ...(Object.fromEntries(Object.entries({ contactFormUrl: contactUrl }).filter(([, v]) => v !== undefined)) as any),
            });
          } catch { /* non-fatal */ }
        }

        log.push("");

        // ════════════════════════════════════════════════════════════════
        // STEP 5.7 — REVIEW INSIGHTS EXTRACTION
        // ════════════════════════════════════════════════════════════════
        let reviewInsights: any = undefined;
        if (found.reviews.length > 0) {
          log.push("── STEP 5.7: Review Insights ──");
          try {
            const strengths: string[] = [];
            const weaknesses: string[] = [];
            let bestQuote = "";
            let bestQuoteAuthor = "";
            let positiveCount = 0;

            for (const review of found.reviews) {
              const text = review.text.toLowerCase();
              const rating = review.rating;

              // Count sentiment
              if (rating >= 4) positiveCount++;

              // Track best quote (longest 5-star review)
              if (rating === 5 && review.text.length > bestQuote.length && review.text.length > 20) {
                bestQuote = review.text.slice(0, 200);
                bestQuoteAuthor = review.reviewerName;
              }

              // Extract strength themes
              if (rating >= 4) {
                if (text.includes("fast") || text.includes("quick") || text.includes("prompt")) strengths.push("fast response time");
                if (text.includes("professional")) strengths.push("professional service");
                if (text.includes("friendly") || text.includes("nice") || text.includes("kind")) strengths.push("friendly staff");
                if (text.includes("price") || text.includes("affordable") || text.includes("fair")) strengths.push("fair pricing");
                if (text.includes("quality") || text.includes("excellent") || text.includes("great work")) strengths.push("high quality work");
                if (text.includes("recommend")) strengths.push("highly recommended");
                if (text.includes("clean") || text.includes("tidy")) strengths.push("clean and tidy");
                if (text.includes("on time") || text.includes("punctual")) strengths.push("punctual");
              }

              // Extract weakness themes (expanded to 15 categories)
              if (rating <= 3) {
                if (text.includes("wait") || text.includes("slow") || text.includes("late") || text.includes("took forever")) weaknesses.push("slow response");
                if (text.includes("phone") || text.includes("call") || text.includes("reach") || text.includes("no answer") || text.includes("voicemail")) weaknesses.push("hard to reach");
                if (text.includes("website") || text.includes("online") || text.includes("book") || text.includes("schedule") || text.includes("appointment")) weaknesses.push("hard to book online");
                if (text.includes("update") || text.includes("communicat") || text.includes("informed") || text.includes("status")) weaknesses.push("poor communication");
                if (text.includes("expensive") || text.includes("overcharg") || text.includes("pricey") || text.includes("hidden fee")) weaknesses.push("pricing concerns");
                if (text.includes("rude") || text.includes("unprofessional") || text.includes("attitude")) weaknesses.push("unprofessional");
                if (text.includes("mess") || text.includes("dirty") || text.includes("clean up") || text.includes("damage")) weaknesses.push("messy work");
                if (text.includes("no show") || text.includes("didn't show") || text.includes("stood up") || text.includes("cancel")) weaknesses.push("no show / unreliable");
                if (text.includes("invoice") || text.includes("bill") || text.includes("payment") || text.includes("charged")) weaknesses.push("billing issues");
                if (text.includes("warranty") || text.includes("guarantee") || text.includes("came back") || text.includes("broke again")) weaknesses.push("warranty concerns");
                if (text.includes("weeks") || text.includes("months") || text.includes("backlog") || text.includes("too busy")) weaknesses.push("long wait times");
                if (text.includes("didn't know") || text.includes("wrong") || text.includes("mistake") || text.includes("incompetent")) weaknesses.push("lack of expertise");
              }
            }

            // Deduplicate
            const uniqueStrengths = [...new Set(strengths)].slice(0, 5);
            const uniqueWeaknesses = [...new Set(weaknesses)].slice(0, 8);
            const sentimentScore = Math.round((positiveCount / found.reviews.length) * 100);

            // Detect customer type from reviews
            let customerType: string | undefined;
            const allText = found.reviews.map(r => r.text.toLowerCase()).join(" ");
            if (allText.includes("commercial") || allText.includes("office") || allText.includes("business")) {
              customerType = "mixed residential/commercial";
            } else if (allText.includes("home") || allText.includes("house") || allText.includes("kitchen") || allText.includes("bathroom")) {
              customerType = "mostly residential";
            }

            // Build pain point → solution → email hook mappings
            const PAIN_POINT_MAP: Record<string, { solution: string; emailHook: string }> = {
              "slow response": { solution: "AI phone answering + missed call text-back", emailHook: "A few customers mentioned response time. What if every inquiry got an instant text back within 30 seconds?" },
              "hard to reach": { solution: "AI receptionist that answers 24/7", emailHook: "I noticed some reviews mention difficulty reaching you by phone. What if every call was answered instantly, even at 2am?" },
              "hard to book online": { solution: "Online booking system on your website", emailHook: "Some customers said scheduling was tough. A simple booking page could fix that overnight." },
              "poor communication": { solution: "Automated job status updates via text", emailHook: "Customers love knowing when you're on the way. Automated text updates = more 5-star reviews." },
              "pricing concerns": { solution: "Transparent pricing page on your website", emailHook: "A clear pricing page eliminates 'hidden fees' concerns and builds trust before the first call." },
              "unprofessional": { solution: "Professional online presence builds trust", emailHook: "A polished website and social presence sets expectations before the first handshake." },
              "messy work": { solution: "Before/after photo gallery on your website", emailHook: "Your best work speaks for itself — a gallery page turns browsers into buyers." },
              "no show / unreliable": { solution: "Automated appointment reminders", emailHook: "Appointment reminders cut no-shows by 80%. Your customers will love the professionalism." },
              "billing issues": { solution: "Online invoicing + payment portal", emailHook: "Online payments = faster collection + fewer disputes. Customers love the convenience." },
              "warranty concerns": { solution: "Clear warranty policy on your website", emailHook: "A clear warranty page builds confidence. Customers buy more when they know you stand behind your work." },
              "long wait times": { solution: "Online waitlist + automated scheduling", emailHook: "Being busy is great — but a waitlist system keeps customers from going to your competitor." },
              "lack of expertise": { solution: "Credentials + certifications showcase page", emailHook: "Showcasing your certifications and experience on your website builds instant trust." },
            };

            const painPoints = uniqueWeaknesses
              .filter(w => PAIN_POINT_MAP[w])
              .map(w => ({
                theme: w,
                evidence: `${weaknesses.filter(x => x === w).length} review(s) mention this`,
                solution: PAIN_POINT_MAP[w].solution,
                emailHook: PAIN_POINT_MAP[w].emailHook,
              }));

            reviewInsights = {
              strengths: uniqueStrengths,
              weaknesses: uniqueWeaknesses,
              customerType,
              sentimentScore,
              bestQuote: bestQuote || undefined,
              bestQuoteAuthor: bestQuoteAuthor || undefined,
              painPoints: painPoints.length > 0 ? painPoints : undefined,
            };

            log.push(`  Strengths: ${uniqueStrengths.join(", ") || "none identified"}`);
            log.push(`  Weaknesses: ${uniqueWeaknesses.join(", ") || "none identified"}`);
            log.push(`  Sentiment: ${sentimentScore}%`);
            if (bestQuote) log.push(`  Best quote: "${bestQuote.slice(0, 80)}..." — ${bestQuoteAuthor}`);

            // Save to DB
            await config.convex.mutation(api.businesses.updateReviewInsights, {
              id: businessId as Id<"businesses">,
              reviewInsights,
            });
          } catch (err: any) {
            log.push(`  ✗ Review insights error: ${err.message?.slice(0, 100)}`);
          }
        }

        log.push("");

        // ════════════════════════════════════════════════════════════════
        // STEP 6 — SAVE TO DATABASE
        // ════════════════════════════════════════════════════════════════
        const enrichmentQuality = [
          found.email,
          found.ownerName,
          found.metaPageUrl,
          found.linkedinOwnerUrl,
        ].filter(Boolean).length;

        log.push("── SUMMARY ──");
        log.push(`  Owner:    ${found.ownerName || "NOT FOUND"}`);
        log.push(`  Email:    ${found.email || "NOT FOUND"}`);
        log.push(`  Facebook: ${found.metaPageUrl || "NOT FOUND"}`);
        log.push(`  LinkedIn: ${found.linkedinUrl || "NOT FOUND"}`);
        log.push(`  LI Owner: ${found.linkedinOwnerUrl || "NOT FOUND"}`);
        log.push(`  Reviews:  ${found.reviews.length}`);
        log.push(`  Website:  ${websiteQuality ? `${websiteQuality.score}/100 (${websiteQuality.needsUpgrade})` : "NOT CHECKED"}`);
        log.push(`  Insights: ${reviewInsights ? `${reviewInsights.strengths.length} strengths, ${reviewInsights.weaknesses.length} weaknesses` : "NONE"}`);
        log.push(`  Score:    ${enrichmentQuality}/4`);

        const enrichmentLog = log.join("\n");

        // Save enrichment data
        await config.convex.mutation(api.businesses.updateEnrichment, {
          id: businessId as Id<"businesses">,
          ownerName: found.ownerName,
          metaPageUrl: found.metaPageUrl,
          linkedinUrl: found.linkedinUrl,
          linkedinOwnerUrl: found.linkedinOwnerUrl,
          email: found.email,
          enrichmentLog,
          facebookData: facebookData || undefined,
          linkedinData: linkedinData || undefined,
        });

        // Save reviews if found
        if (found.reviews.length > 0) {
          try {
            await config.convex.mutation(api.businesses.updateReviews, {
              id: businessId as Id<"businesses">,
              reviews: found.reviews,
            });
          } catch {
            // updateReviews might not exist yet — non-fatal
          }
        }

        // Compute lead score
        await config.convex.mutation(api.businesses.computeLeadScore, {
          id: businessId as Id<"businesses">,
        });

        return {
          __enriched: true,
          businessId,
          businessName,
          ownerName: found.ownerName || null,
          email: found.email || null,
          metaPageUrl: found.metaPageUrl || null,
          linkedinUrl: found.linkedinUrl || null,
          linkedinOwnerUrl: found.linkedinOwnerUrl || null,
          reviewsFound: found.reviews.length,
          enrichmentQuality,
          summary: [
            found.ownerName ? `Owner: ${found.ownerName}` : "No owner found",
            found.email ? `Email: ${found.email}` : "No email found",
            found.metaPageUrl ? "Facebook: found" : "No Facebook",
            found.linkedinOwnerUrl ? "LinkedIn owner: found" : "No LinkedIn",
            found.reviews.length ? `Reviews: ${found.reviews.length}` : "No reviews found",
          ].join(" | "),
        };
      } catch (err: any) {
        log.push("");
        log.push(`!! FATAL ERROR: ${err.message?.slice(0, 300)}`);
        console.error("[enrich_business] Failed:", err.message);

        // Try to save the partial log even on failure
        try {
          await config.convex.mutation(api.businesses.updateEnrichment, {
            id: businessId as Id<"businesses">,
            enrichmentLog: log.join("\n"),
          });
        } catch {
          // Can't save log — nothing more to do
        }

        return {
          __enriched: false,
          businessId,
          businessName,
          error: `Enrichment failed: ${err.message?.slice(0, 200)}`,
        };
      }
    },
  });
}

// ── Score Business Leads ───────────────────────────────────────────────

export function createScoreBusinessLeadsTool(config: {
  organizationId: Id<"organizations">;
  convex: ConvexHttpClient;
}) {
  const { organizationId, convex } = config;

  return tool({
    description: "Compute quality scores (0–100) for businesses that haven't been scored yet. Higher scores = better leads to contact first. Scores are based on contact completeness, rating, and review count. Run this after enrichment before sending outreach.",
    parameters: z.object({
      limit: z.number().min(1).max(100).default(50).describe("Max number of businesses to score in this batch (default 50)"),
    }),
    execute: async ({ limit }) => {
      try {
        const unscored = await convex.query(api.businesses.getUnscoredBusinesses, {
          organizationId,
          limit,
        });

        if (!unscored || unscored.length === 0) {
          return { scored: 0, message: "All businesses already have scores." };
        }

        let scored = 0;
        const results: Array<{ name: string; score: number }> = [];

        for (const biz of unscored) {
          const result = await convex.mutation(api.businesses.computeLeadScore, {
            id: biz._id as Id<"businesses">,
          });
          if (result.success) {
            scored++;
            results.push({ name: biz.name, score: result.score });
          }
        }

        const avg = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0;
        const highQuality = results.filter((r) => r.score >= 50).length;

        return {
          scored,
          averageScore: avg,
          highQualityLeads: highQuality,
          message: `Scored ${scored} businesses. Average score: ${avg}/100. High-quality leads (≥50): ${highQuality}.`,
          topLeads: results.sort((a, b) => b.score - a.score).slice(0, 5),
        };
      } catch (err: any) {
        return { scored: 0, error: err?.message ?? String(err) };
      }
    },
  });
}
