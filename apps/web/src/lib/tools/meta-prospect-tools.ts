import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

interface MetaProspectConfig {
  accessToken: string;
  organizationId: Id<"organizations">;
  convex: ConvexHttpClient;
}

const META_API_BASE = "https://graph.facebook.com/v19.0";

/**
 * Factory: creates a Meta/Facebook prospecting tool.
 */
export function createMetaProspectTool(config: MetaProspectConfig) {
  return tool({
    description:
      "Search Meta/Facebook for business pages and places to find leads and contact information. Results are automatically saved to the leads database.",
    parameters: z.object({
      query: z
        .string()
        .describe(
          "Search query for businesses (e.g. 'pizza restaurants in New York')"
        ),
      type: z
        .enum(["page", "place"])
        .default("page")
        .describe("Search type: 'page' for business pages, 'place' for locations"),
      limit: z
        .number()
        .min(1)
        .max(25)
        .default(10)
        .describe("Number of results (1-25)"),
    }),
    execute: async ({ query, type, limit }) => {
      try {
        // Search for pages/places
        const searchParams = new URLSearchParams({
          q: query,
          type,
          limit: String(limit),
          access_token: config.accessToken,
        });

        const searchRes = await fetch(
          `${META_API_BASE}/search?${searchParams}`
        );

        if (!searchRes.ok) {
          const err = await searchRes.json().catch(() => ({}));
          const errorMsg =
            err?.error?.message || `HTTP ${searchRes.status}`;

          if (
            searchRes.status === 401 ||
            errorMsg.includes("expired") ||
            errorMsg.includes("invalid")
          ) {
            return {
              __metaProspect: false,
              error: `Meta access token is invalid or expired. Please update your Meta API token in Settings. Error: ${errorMsg}`,
              results: [],
            };
          }

          return {
            __metaProspect: false,
            error: `Meta API error: ${errorMsg}`,
            results: [],
          };
        }

        const searchData = await searchRes.json();
        const items = searchData.data || [];

        const leads: Array<{
          name: string;
          company?: string;
          email?: string;
          phone?: string;
          website?: string;
          category?: string;
          sourceUrl: string;
        }> = [];

        // Fetch details for each result
        for (const item of items) {
          try {
            const detailParams = new URLSearchParams({
              fields:
                "name,emails,phone,website,category,single_line_address,link",
              access_token: config.accessToken,
            });

            const detailRes = await fetch(
              `${META_API_BASE}/${item.id}?${detailParams}`
            );

            if (!detailRes.ok) continue;

            const detail = await detailRes.json();
            const email = detail.emails?.[0];
            const phone = detail.phone;
            const website = detail.website;

            const lead = {
              name: detail.name || item.name || "Unknown",
              company: detail.name,
              email,
              phone,
              website,
              category: detail.category,
              sourceUrl: detail.link || `https://facebook.com/${item.id}`,
            };
            leads.push(lead);

            // Save to leads database
            await config.convex.mutation(api.leads.createFromServer, {
              organizationId: config.organizationId,
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
              company: lead.company,
              source: "meta" as const,
              sourceUrl: lead.sourceUrl,
              metadata: {
                searchQuery: query,
                category: lead.category,
                website: lead.website,
                facebookId: item.id,
              },
            });
          } catch (err: any) {
            console.error("[meta_prospect] Failed to fetch/save page detail:", err);
          }
        }

        return {
          __metaProspect: true,
          query,
          count: leads.length,
          results: leads,
        };
      } catch (err: any) {
        console.error("[meta_prospect] Search failed:", err);
        return {
          __metaProspect: false,
          error: `Meta search failed: ${err.message?.slice(0, 300)}`,
          results: [],
        };
      }
    },
  });
}
