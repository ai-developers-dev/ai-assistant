import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

// Clean website URLs — remove tracking params, decode encoded chars, normalize to homepage
function cleanWebsiteUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    // Decode any URL-encoded characters first
    let cleaned = decodeURIComponent(url);
    // Parse as URL to strip query params
    const parsed = new URL(cleaned.startsWith("http") ? cleaned : `https://${cleaned}`);
    // Remove UTM and tracking parameters
    const stripParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "ref", "source"];
    stripParams.forEach((p) => parsed.searchParams.delete(p));
    // If only tracking params remain, return just the origin + path
    const result = parsed.searchParams.toString()
      ? `${parsed.origin}${parsed.pathname}?${parsed.searchParams}`
      : `${parsed.origin}${parsed.pathname}`;
    // Clean trailing slash on homepage
    return result.replace(/\/$/, "") || result;
  } catch {
    // If URL parsing fails, return as-is but try basic decode
    try { return decodeURIComponent(url); } catch { return url; }
  }
}

interface OutscraperConfig {
  apiKey: string;
  organizationId: Id<"organizations">;
  convex: ConvexHttpClient;
  dailyLimit?: number; // Max businesses to save per run (from campaignConfig.dailyResults)
  totalVerticals?: number; // Number of verticals in campaign (for fair distribution)
}

// Shared counters across tool calls within a single execution
let _scrapeRunCounter = 0;
let _scrapeCallCount = 0;
let _lastOutscraperFields = "";
export function resetScrapeCounter() { _scrapeRunCounter = 0; _scrapeCallCount = 0; _lastOutscraperFields = ""; }

// ── Outscraper Google Maps Search ─────────────────────────────────

async function outscraperSearch(
  query: string,
  apiKey: string,
  limit: number
): Promise<any[]> {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    reviews_limit: "3",
    async: "false",
    language: "en",
    region: "us",
  });

  const res = await fetch(
    `https://api.app.outscraper.com/maps/search-v3?${params}`,
    {
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Outscraper API error (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();

  // Outscraper returns data as array of arrays (one per query)
  const results = data?.data?.[0] || [];
  const arr = Array.isArray(results) ? results : [];

  // Capture what fields Outscraper returned for debugging
  if (arr.length > 0) {
    const sample = arr[0];
    const keys = Object.keys(sample);
    _lastOutscraperFields = `keys(${keys.length}): ${keys.join(", ")} | site=${sample.site} | reviews_data=${Array.isArray(sample.reviews_data) ? sample.reviews_data.length : typeof sample.reviews_data} | reviews=${sample.reviews}`;
    console.log(`[outscraper] ${_lastOutscraperFields}`);
  }

  return arr;
}

// ── Factory ────────────────────────────────────────────────────────

export function createGooglePlacesTool(config: OutscraperConfig) {
  return tool({
    description:
      "Search Google Maps via Outscraper to find home service businesses in a specific city. Returns structured business data including address, phone, website, rating, and recent Google reviews. Results are automatically saved to the businesses database.",
    parameters: z.object({
      city: z.string().describe("City name (e.g. 'Chicago')"),
      state: z.string().describe("State code (e.g. 'IL')"),
      category: z
        .string()
        .describe(
          "Home service category to search (e.g. 'roofing contractor', 'plumber', 'HVAC contractor')"
        ),
      maxResults: z
        .number()
        .min(1)
        .max(20)
        .default(20)
        .describe("Maximum number of businesses to return (1-20)"),
      cityId: z
        .string()
        .optional()
        .describe("Convex city campaign ID to link businesses to"),
    }),
    execute: async ({ city, state, category, maxResults, cityId }) => {
      try {
        _scrapeCallCount++;

        // If daily limit set, enforce a hard per-vertical cap so each vertical
        // gets a fair share: perVerticalCap = ceil(dailyLimit / totalVerticals)
        // This prevents the first vertical from eating the entire budget
        let perVerticalCap = maxResults;
        if (config.dailyLimit) {
          const remaining = config.dailyLimit - _scrapeRunCounter;
          if (remaining <= 0) {
            return {
              __googlePlaces: true,
              query: `${category} in ${city}, ${state}`,
              city, state, category,
              found: 0, saved: 0, skipped: 0, businesses: [],
              totalSavedThisRun: _scrapeRunCounter,
              dailyLimit: config.dailyLimit,
              limitReached: true,
              message: `DAILY LIMIT REACHED (${config.dailyLimit}). STOP SCRAPING.`,
            };
          }
          const numVerticals = config.totalVerticals || 1;
          perVerticalCap = Math.max(1, Math.ceil(config.dailyLimit / numVerticals));
        }
        const effectiveMax = Math.min(maxResults, perVerticalCap);

        const query = `${category} in ${city}, ${state}`;
        const results = await outscraperSearch(query, config.apiKey, effectiveMax);

        let saved = 0;
        let skipped = 0;
        const businesses: any[] = [];

        // Hard-truncate results to prevent Outscraper returning more than requested
        const cappedResults = config.dailyLimit
          ? results.slice(0, Math.min(results.length, effectiveMax + 2))
          : results;

        for (const place of cappedResults) {
          try {
            // Skip if no place_id (can't dedup)
            if (!place.place_id) continue;

            // Enforce daily limit at tool level
            if (config.dailyLimit && _scrapeRunCounter >= config.dailyLimit) {
              skipped++;
              continue;
            }
            // Also enforce per-call limit (effectiveMax) to distribute across verticals
            if (config.dailyLimit && saved >= effectiveMax) {
              skipped++;
              continue;
            }

            // Extract top 3 reviews for personalization
            const reviews = (place.reviews_data || [])
              .slice(0, 10)
              .map((r: any) => ({
                reviewerName: r.author_title || "A customer",
                text: (r.review_text || "").slice(0, 500),
                rating: r.review_rating || 5,
                relativeTime: r.review_datetime_utc
                  ? new Date(r.review_datetime_utc).toLocaleDateString()
                  : "recently",
              }));

            const address = {
              street: place.street || undefined,
              city: place.city || city,
              state: place.state || state,
              zip: place.postal_code || undefined,
              formatted: place.full_address || `${city}, ${state}`,
            };

            const businessData = {
              organizationId: config.organizationId,
              googlePlaceId: place.place_id,
              name: place.name || "Unknown Business",
              address,
              phone: place.phone || undefined,
              email: (place.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(place.email)) ? place.email : undefined,
              website: cleanWebsiteUrl(place.website || place.site) || undefined,
              categories: [
                category,
                ...(place.category ? [place.category] : []),
                ...(Array.isArray(place.subtypes) ? place.subtypes : []),
              ]
                .filter(Boolean)
                .map((c: string) => c.trim())
                .filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i)
                .slice(0, 3), // Max 3 categories
              rating: place.rating || undefined,
              reviewCount: place.reviews || undefined,
              reviews: reviews.length > 0 ? reviews : undefined,
              // ownerName intentionally NOT set from Outscraper — owner_title is the business name, not the actual owner. Owner comes from enrichment (Apollo/Firecrawl).
              vertical: category,
              cityId: cityId as Id<"cityCampaigns"> | undefined,
            };

            const result = await config.convex.mutation(
              api.businesses.createFromServer,
              { ...businessData, campaignDailyLimit: config.dailyLimit || undefined }
            );

            if (result.created) {
              saved++;
              _scrapeRunCounter++;
            } else if ((result as any).reason === "HARD_LIMIT_REACHED") {
              return {
                success: true,
                limitReached: true,
                message: `HARD LIMIT REACHED: DB refused insert (${config.dailyLimit} cap). Saved ${saved} this call.`,
                saved,
                skipped,
                businesses,
              };
            } else {
              skipped++;
            }

            businesses.push({
              id: result.id,
              name: businessData.name,
              address: address.formatted,
              phone: businessData.phone,
              website: businessData.website,
              rating: businessData.rating,
              reviewCount: businessData.reviewCount,
              topReviewer: reviews[0]?.reviewerName,
              topReviewSnippet: reviews[0]?.text?.slice(0, 80),
              saved: result.created,
            });
          } catch (err: any) {
            console.error(
              `[outscraper] Failed to save ${place.name}:`,
              err.message
            );
          }
        }

        const limitReached = !!(config.dailyLimit && _scrapeRunCounter >= config.dailyLimit);
        return {
          __googlePlaces: true,
          query,
          city,
          state,
          category,
          found: results.length,
          saved,
          skipped,
          businesses,
          totalSavedThisRun: _scrapeRunCounter,
          dailyLimit: config.dailyLimit,
          limitReached,
          ...(limitReached ? { message: `DAILY LIMIT REACHED (${config.dailyLimit}). STOP SCRAPING.` } : {}),
        };
      } catch (err: any) {
        console.error("[outscraper] Search failed:", err);
        return {
          __googlePlaces: false,
          error: `Outscraper search failed: ${err.message?.slice(0, 300)}`,
          businesses: [],
        };
      }
    },
  });
}

// ── Batch scrape tool: handles ALL verticals in one call ──────────
// This removes AI decision-making about which verticals to search.
// The tool loops through every vertical, distributing the daily limit evenly.

export function createScrapeAllVerticalsTool(config: OutscraperConfig) {
  const hardLimit = config.dailyLimit || 50;
  return tool({
    description:
      `Scrape Google Maps for ALL verticals in a city. The daily lead target is FIXED at ${hardLimit} (from campaign config). Call this ONCE per city.`,
    parameters: z.object({
      city: z.string().describe("City name"),
      state: z.string().describe("State code"),
      verticals: z.array(z.string()).describe("Array of verticals to search"),
      cityId: z.string().optional().describe("Convex city campaign ID"),
    }),
    execute: async ({ city, state, verticals, cityId }) => {
      const dailyTarget = hardLimit;
      const perVertical = Math.max(1, Math.ceil(dailyTarget / verticals.length));
      const results: Record<string, { saved: number; skipped: number }> = {};
      let totalSaved = 0;
      let totalSkipped = 0;

      for (const vertical of verticals) {
        if (totalSaved >= dailyTarget) {
          results[vertical] = { saved: 0, skipped: 0 };
          continue;
        }

        const remaining = dailyTarget - totalSaved;
        const maxForThis = Math.min(perVertical, remaining);

        try {
          const query = `${vertical} in ${city}, ${state}`;
          const places = await outscraperSearch(query, config.apiKey, maxForThis);

          let saved = 0;
          let skipped = 0;

          // Hard-truncate to prevent Outscraper returning more than requested
          const cappedPlaces = places.slice(0, maxForThis + 2);

          for (const place of cappedPlaces) {
            if (!place.place_id) continue;
            if (saved >= maxForThis || totalSaved >= dailyTarget) {
              skipped++;
              continue;
            }

            const reviews = (place.reviews_data || [])
              .slice(0, 10)
              .map((r: any) => ({
                reviewerName: r.author_title || "A customer",
                text: (r.review_text || "").slice(0, 500),
                rating: r.review_rating || 5,
                relativeTime: r.review_datetime_utc
                  ? new Date(r.review_datetime_utc).toLocaleDateString()
                  : "recently",
              }));

            const address = {
              street: place.street || undefined,
              city: place.city || city,
              state: place.state || state,
              zip: place.postal_code || undefined,
              formatted: place.full_address || `${city}, ${state}`,
            };

            try {
              const result = await config.convex.mutation(
                api.businesses.createFromServer,
                {
                  organizationId: config.organizationId,
                  googlePlaceId: place.place_id,
                  name: place.name || "Unknown Business",
                  address,
                  phone: place.phone || undefined,
                  email: (place.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(place.email)) ? place.email : undefined,
                  website: cleanWebsiteUrl(place.website || place.site) || undefined,
                  categories: [
                    vertical,
                    ...(place.category ? [place.category] : []),
                    ...(Array.isArray(place.subtypes) ? place.subtypes : []),
                  ]
                    .filter(Boolean)
                    .map((c: string) => c.trim())
                    .filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i)
                    .slice(0, 3),
                  rating: place.rating || undefined,
                  reviewCount: place.reviews || undefined,
                  reviews: reviews.length > 0 ? reviews : undefined,
                  vertical,
                  cityId: cityId as Id<"cityCampaigns"> | undefined,
                  campaignDailyLimit: dailyTarget,
                }
              );

              if (result.created) {
                saved++;
                totalSaved++;
              } else if ((result as any).reason === "HARD_LIMIT_REACHED") {
                break; // DB says stop — obey immediately
              } else {
                skipped++;
              }
            } catch {
              skipped++;
            }
          }

          results[vertical] = { saved, skipped };
          totalSkipped += skipped;
        } catch {
          results[vertical] = { saved: 0, skipped: 0 };
        }
      }

      return {
        success: true,
        city,
        state,
        totalSaved,
        totalSkipped,
        dailyTarget,
        limitReached: totalSaved >= dailyTarget,
        byVertical: results,
        summary: Object.entries(results)
          .map(([v, r]) => `${v}: ${r.saved}`)
          .join(", "),
        _debug_outscraper_fields: _lastOutscraperFields,
      };
    },
  });
}
