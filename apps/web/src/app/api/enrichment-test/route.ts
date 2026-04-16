import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { decryptProviderKeys } from "@/lib/credentials/provider-keys";
import { apolloSearchOwner } from "@/lib/tools/apollo-tools";
import type { Id } from "../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const maxDuration = 120;

// ── Firecrawl helpers (same as enrichment tool but with logging) ─────

async function scrape(url: string, apiKey: string, log: string[]): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"], waitFor: 3000, timeout: 15000, onlyMainContent: true }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        log.push(`  → ${url}: HTTP ${res.status} (${err.slice(0, 150)})`);
        if (attempt === 0) { await new Promise(r => setTimeout(r, 2000)); continue; }
        return "";
      }
      const data = await res.json();
      const md = data.data?.markdown || "";
      log.push(`  → ${url}: ${md.length} chars${md.length > 50 ? " ✓" : " (too short)"}`);
      return md;
    } catch (err: any) {
      log.push(`  → ${url}: Error — ${err.message?.slice(0, 150)}`);
      if (attempt === 0) { await new Promise(r => setTimeout(r, 2000)); continue; }
      return "";
    }
  }
  return "";
}

async function search(query: string, apiKey: string, log: string[], limit = 5): Promise<any[]> {
  log.push(`  🔍 "${query}" (limit ${limit})`);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit, scrapeOptions: { formats: ["markdown"] } }),
      });
      if (!res.ok) {
        log.push(`  → Search failed: HTTP ${res.status}`);
        if (attempt === 0) { await new Promise(r => setTimeout(r, 2000)); continue; }
        return [];
      }
      const data = await res.json();
      const results = data.data || [];
      log.push(`  → ${results.length} results`);
      return results;
    } catch (err: any) {
      log.push(`  → Search error: ${err.message?.slice(0, 100)}`);
      if (attempt === 0) { await new Promise(r => setTimeout(r, 2000)); continue; }
      return [];
    }
  }
  return [];
}

async function getReviews(placeId: string, apiKey: string, log: string[]): Promise<any[]> {
  try {
    const params = new URLSearchParams({ query: placeId, reviewsLimit: "10", async: "false", sort: "newest", language: "en" });
    const res = await fetch(`https://api.app.outscraper.com/maps/reviews-v3?${params}`, {
      headers: { "X-API-KEY": apiKey },
    });
    if (!res.ok) { log.push(`  → Reviews API: HTTP ${res.status}`); return []; }
    const data = await res.json();
    const reviews = (data?.data?.[0] || []).slice(0, 10).map((r: any) => ({
      reviewerName: r.author_title || r.author_name || "A customer",
      text: (r.review_text || "").slice(0, 500),
      rating: r.review_rating || 5,
      date: r.review_datetime_utc || "recently",
    }));
    log.push(`  → ${reviews.length} reviews fetched ✓`);
    return reviews;
  } catch (err: any) {
    log.push(`  → Reviews error: ${err.message?.slice(0, 100)}`);
    return [];
  }
}

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

// ── Email + owner extraction ─────────────────────────────────────────

const EMAIL_BLOCKLIST = ["noreply", "no-reply", "@sentry", "@wordpress", "@woocommerce", "@gravatar", "@squarespace", "@wix.com", "@godaddy", "@localhost", "name@domain", "user@", "yourname@", "youremail@", "sample@", "demo@", "placeholder"];

function findEmails(text: string, preferDomain?: string): string[] {
  const standard = [...text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)];
  const mailto = [...text.matchAll(/mailto:([^)"'\s]+)/g)];
  const all = new Set<string>();
  for (const m of standard) all.add(m[0].toLowerCase());
  for (const m of mailto) all.add(m[1].toLowerCase().replace(/\?.*$/, ""));
  const domainFirst: string[] = [];
  const others: string[] = [];
  for (const e of all) {
    if (EMAIL_BLOCKLIST.some(b => e.includes(b))) continue;
    if (/^[0-9a-f]{10,}@/.test(e)) continue;
    if (preferDomain && e.endsWith(`@${preferDomain}`)) domainFirst.push(e);
    else others.push(e);
  }
  return [...domainFirst, ...others];
}

const OWNER_BLOCKLIST = new Set(["our", "us", "your", "the", "my", "we", "i", "read", "learn", "click", "find", "privacy", "terms", "small", "local", "best", "top", "great", "new", "free", "home", "all"]);

function findOwner(text: string): string | null {
  const nc = `[A-Z][a-zA-Z'-]+`;
  const name2 = `${nc}\\s+${nc}`;
  const name3 = `${nc}\\s+${nc}\\s+${nc}`;
  const patterns = [
    new RegExp(`(?:owner|founder|president|ceo|proprietor|principal|co-founder)[:\\s]+?(${name3}|${name2})`, "i"),
    new RegExp(`(${name3}|${name2}),?\\s+(?:owner|founder|president|ceo|proprietor|operator)`, "i"),
    new RegExp(`(?:owned and operated by|started by|established by|run by|created by)\\s+(${name3}|${name2})`, "i"),
    new RegExp(`(?:founded|established|started)\\s+in\\s+\\d{4}\\s+by\\s+(${name3}|${name2})`, "i"),
    new RegExp(`(${name3}|${name2})\\s+(?:started|founded|established|owns|operates)\\s`, "i"),
    new RegExp(`(?:Hi,?\\s+I'?m|My name is|I am)\\s+(${name3}|${name2})`, "i"),
    new RegExp(`(?:meet|about)\\s+(${name3}|${name2})(?:\\s|$|,|\\.)`, "i"),
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const n = m[1].trim();
      const words = n.toLowerCase().split(/\s+/);
      if (words.some(w => OWNER_BLOCKLIST.has(w))) continue;
      if (/\b(llc|inc|corp|ltd|team|company|service|group)\b/i.test(n)) continue;
      return n;
    }
  }
  return null;
}

// Facebook URL extraction
const FB_REJECT = ["/share", "/events/", "/groups/", "/permalink/", "/photo/", "/reel/", "/video/", "/login", "/help/"];
function findFacebook(results: any[]): string | null {
  for (const r of results) {
    if (!r.url?.includes("facebook.com")) continue;
    if (FB_REJECT.some(p => r.url.includes(p))) continue;
    if (/facebook\.com\/(?:pages\/[^/?#]+|[a-zA-Z0-9][a-zA-Z0-9._-]{2,})(?:[/?#]|$)/.test(r.url)) return r.url;
  }
  return null;
}

function findLinkedIn(results: any[]): { company?: string; owner?: string } {
  return {
    company: results.find(r => r.url?.includes("linkedin.com/company"))?.url,
    owner: results.find(r => r.url?.includes("linkedin.com/in/"))?.url,
  };
}

// ── Main route ───────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { businessName, city, state, website, googlePlaceId, organizationId } = await req.json();
    if (!businessName || !city || !state || !organizationId) {
      return NextResponse.json({ error: "Missing: businessName, city, state, organizationId" }, { status: 400 });
    }

    const orgData = await convex.query(api.organizations.getById, { id: organizationId as Id<"organizations"> });
    const credentials = orgData?.providerKeys
      ? decryptProviderKeys(orgData.providerKeys as Record<string, any>, organizationId)
      : {};

    const fcKey = credentials.firecrawl?.token || process.env.FIRECRAWL_API_KEY || "";
    const osKey = credentials.outscraper?.token || "";
    if (!fcKey) return NextResponse.json({ error: "No Firecrawl API key" }, { status: 400 });

    const log: string[] = [
      `=== Enrichment Test: ${businessName} ===`,
      `City: ${city}, ${state}`,
      `Website: ${website || "NONE"}`,
      `Google Place ID: ${googlePlaceId || "NONE"}`,
      `Firecrawl key: ${fcKey.slice(0, 8)}...`,
      `Outscraper key: ${osKey ? osKey.slice(0, 8) + "..." : "NONE"}`,
      `Hunter.io key: ${credentials.hunter?.token ? credentials.hunter.token.slice(0, 8) + "..." : "NONE"}`,
      `Apollo.io key: ${credentials.apollo?.token ? credentials.apollo.token.slice(0, 8) + "..." : "NONE"}`,
      "",
    ];

    const found: any = { emails: [], owner: null, facebook: null, linkedin: {}, reviews: [] };

    // ─── STEP 0: Apollo.io ────────────────────────────────
    log.push("── STEP 0: Apollo.io ──");
    const apolloKey = credentials.apollo?.token || "";
    if (apolloKey) {
      const apollo = await apolloSearchOwner(businessName, city, state, apolloKey, log);
      if (apollo) {
        if (apollo.name) found.owner = apollo.name;
        if (apollo.email) found.emails = [apollo.email, ...found.emails];
        if (apollo.linkedinUrl) found.linkedin.owner = apollo.linkedinUrl;
      }
    } else {
      log.push("  (skipped — no Apollo.io API key configured)");
    }
    log.push("");

    // ─── STEP 1: Scrape website ────────────────────────────────
    log.push("── STEP 1: Scrape website pages ──");
    if (website) {
      const base = website.replace(/\/?$/, "");
      const domain = (() => { try { return new URL(website).hostname.replace(/^www\./, ""); } catch { return ""; } })();
      const pages = [base, `${base}/about`, `${base}/about-us`, `${base}/contact`, `${base}/contact-us`, `${base}/our-team`, `${base}/team`, `${base}/testimonials`];

      for (const url of pages) {
        const content = await scrape(url, fcKey, log);
        if (content.length > 50) {
          if (!found.owner) {
            const owner = findOwner(content);
            if (owner) { found.owner = owner; log.push(`  ✓ Owner found: ${owner}`); }
          }
          const emails = findEmails(content, domain);
          found.emails.push(...emails);
        }
      }
      const unique = [...new Set(found.emails as string[])];
      found.emails = unique;
      if (unique.length > 0) log.push(`  ✓ Emails found: ${unique.join(", ")}`);
      else log.push("  ✗ No emails found on website");
      if (!found.owner) log.push("  ✗ No owner found on website");
    } else {
      log.push("  (skipped — no website)");
    }
    log.push("");

    // ─── STEP 2: Google search fallback ────────────────────────
    log.push("── STEP 2: Google search fallback ──");
    if (!found.owner) {
      const results = await search(`"${businessName}" ${city} ${state} owner founder`, fcKey, log);
      for (const r of results) {
        const text = `${r.title} ${r.description} ${r.markdown || ""}`;
        const owner = findOwner(text);
        if (owner) { found.owner = owner; log.push(`  ✓ Owner via search: ${owner}`); break; }
      }
      if (!found.owner) log.push("  ✗ No owner via search");
    }
    if (found.emails.length === 0) {
      const results = await search(`"${businessName}" ${city} email contact`, fcKey, log);
      for (const r of results) {
        const emails = findEmails(`${r.description} ${r.markdown || ""}`);
        if (emails.length > 0) { found.emails = emails; log.push(`  ✓ Email via search: ${emails[0]}`); break; }
      }
      if (found.emails.length === 0) log.push("  ✗ No email via search");
    }
    log.push("");

    // ─── STEP 2.5: Hunter.io ────────────────────────────────
    log.push("── STEP 2.5: Hunter.io ──");
    const hunterKey = credentials.hunter?.token || "";
    if (hunterKey && website && found.emails.length === 0) {
      try {
        const hunterDomain = (() => {
          try { return new URL(website).hostname.replace(/^www\./, ""); } catch { return ""; }
        })();
        if (hunterDomain) {
          log.push(`  Searching Hunter.io for ${hunterDomain}...`);
          const hunterRes = await fetch(
            `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(hunterDomain)}&api_key=${hunterKey}`
          );
          if (hunterRes.ok) {
            const hunterData = await hunterRes.json();
            const hunterEmails = hunterData.data?.emails || [];
            log.push(`  → Hunter.io returned ${hunterEmails.length} emails`);

            const ownerPositions = ["owner", "ceo", "founder", "president", "co-founder", "proprietor"];
            const ownerEmail = hunterEmails.find((e: any) =>
              e.position && ownerPositions.some((p: string) => e.position.toLowerCase().includes(p))
            );
            if (ownerEmail && !found.owner && ownerEmail.first_name && ownerEmail.last_name) {
              found.owner = `${ownerEmail.first_name} ${ownerEmail.last_name}`;
              log.push(`  ✓ Owner from Hunter.io: ${found.owner} (${ownerEmail.position})`);
            }

            const bestEmail = ownerEmail || hunterEmails.sort((a: any, b: any) => (b.confidence || 0) - (a.confidence || 0))[0];
            if (bestEmail?.value) {
              found.emails = [bestEmail.value, ...found.emails];
              log.push(`  ✓ Email from Hunter.io: ${bestEmail.value} (confidence: ${bestEmail.confidence || "?"}%)`);
            }
          } else {
            log.push(`  → Hunter.io: HTTP ${hunterRes.status}`);
          }
        }
      } catch (err: any) {
        log.push(`  → Hunter.io error: ${err.message?.slice(0, 100)}`);
      }
    } else if (!hunterKey) {
      log.push("  (skipped — no Hunter.io API key)");
    } else if (!website) {
      log.push("  (skipped — no website)");
    } else {
      log.push("  (skipped — email already found)");
    }
    log.push("");

    // ─── STEP 3: Google Reviews ────────────────────────────────
    log.push("── STEP 3: Google Reviews ──");
    if (osKey) {
      let resolvedPlaceId = googlePlaceId || null;
      if (!resolvedPlaceId) {
        resolvedPlaceId = await findPlaceId(businessName, city, state, osKey, log);
      }
      if (resolvedPlaceId) {
        found.reviews = await getReviews(resolvedPlaceId, osKey, log);
      } else {
        log.push("  (skipped — could not determine Google Place ID)");
      }
    } else {
      log.push("  (skipped — no Outscraper key)");
    }
    log.push("");

    // ─── STEP 4: Facebook ──────────────────────────────────────
    log.push("── STEP 4: Facebook ──");
    const fbResults = await search(`"${businessName}" ${city} facebook`, fcKey, log);
    found.facebook = findFacebook(fbResults);
    if (found.facebook) log.push(`  ✓ Facebook: ${found.facebook}`);
    else log.push("  ✗ No Facebook page found");
    log.push("");

    // ─── STEP 5: LinkedIn ──────────────────────────────────────
    log.push("── STEP 5: LinkedIn ──");
    const liResults = await search(`"${businessName}" ${city} linkedin`, fcKey, log);
    found.linkedin = findLinkedIn(liResults);
    if (found.linkedin.company) log.push(`  ✓ Company: ${found.linkedin.company}`);
    else log.push("  ✗ No LinkedIn company page");
    if (found.linkedin.owner) log.push(`  ✓ Owner: ${found.linkedin.owner}`);
    else log.push("  ✗ No LinkedIn owner profile");

    if (found.owner && !found.linkedin.owner) {
      const ownerLi = await search(`${found.owner} "${businessName}" linkedin.com/in`, fcKey, log);
      const li = findLinkedIn(ownerLi);
      if (li.owner) { found.linkedin.owner = li.owner; log.push(`  ✓ Owner LI (refined): ${li.owner}`); }
    }
    log.push("");

    // ─── SUMMARY ───────────────────────────────────────────────
    log.push("── SUMMARY ──");
    log.push(`  Owner:    ${found.owner || "NOT FOUND"}`);
    log.push(`  Email:    ${found.emails[0] || "NOT FOUND"} ${found.emails.length > 1 ? `(+${found.emails.length - 1} more)` : ""}`);
    log.push(`  Facebook: ${found.facebook || "NOT FOUND"}`);
    log.push(`  LinkedIn: ${found.linkedin.company || "NOT FOUND"}`);
    log.push(`  LI Owner: ${found.linkedin.owner || "NOT FOUND"}`);
    log.push(`  Reviews:  ${found.reviews.length}`);

    return NextResponse.json({
      success: true,
      owner: found.owner,
      emails: found.emails,
      facebook: found.facebook,
      linkedin: found.linkedin,
      reviews: found.reviews,
      log: log.join("\n"),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
