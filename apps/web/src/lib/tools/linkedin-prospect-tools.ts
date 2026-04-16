import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

interface LinkedInProspectConfig {
  accessToken: string;
  organizationId: Id<"organizations">;
  convex: ConvexHttpClient;
}

/**
 * Factory: creates a LinkedIn prospecting tool.
 * Falls back to web search with site:linkedin.com if API access is restricted.
 */
export function createLinkedInProspectTool(config: LinkedInProspectConfig) {
  return tool({
    description:
      "Search LinkedIn for professionals, decision-makers, and companies. Results are automatically saved to the leads database. If LinkedIn API access is restricted, the tool will inform you to use web_search with site:linkedin.com instead.",
    parameters: z.object({
      query: z
        .string()
        .describe(
          "Search query (e.g. 'CTO at SaaS companies', 'marketing directors in Austin')"
        ),
      type: z
        .enum(["people", "companies"])
        .default("people")
        .describe("Search for people or companies"),
      limit: z
        .number()
        .min(1)
        .max(25)
        .default(10)
        .describe("Number of results (1-25)"),
    }),
    execute: async ({ query, type, limit }) => {
      try {
        // LinkedIn API endpoint depends on search type
        const endpoint =
          type === "companies"
            ? "https://api.linkedin.com/v2/search?q=companiesV2"
            : "https://api.linkedin.com/v2/search?q=people";

        const searchParams = new URLSearchParams({
          keywords: query,
          count: String(limit),
        });

        const res = await fetch(`${endpoint}&${searchParams}`, {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        });

        // Handle restricted access — fall back gracefully
        if (res.status === 403 || res.status === 401) {
          return {
            __linkedInProspect: false,
            fallback: true,
            error:
              "LinkedIn API access is restricted. This typically requires a LinkedIn Marketing or Sales Navigator API subscription. " +
              "As a fallback, please use the web_search tool with 'site:linkedin.com' prefix to find LinkedIn profiles. " +
              "Example: web_search({ query: 'site:linkedin.com " +
              query +
              "' })",
            results: [],
          };
        }

        if (!res.ok) {
          const err = await res.text();
          return {
            __linkedInProspect: false,
            error: `LinkedIn API error (${res.status}): ${err.slice(0, 300)}`,
            results: [],
          };
        }

        const data = await res.json();
        const elements = data.elements || [];

        const leads: Array<{
          name: string;
          title?: string;
          company?: string;
          profileUrl: string;
        }> = [];

        for (const el of elements) {
          const lead = {
            name:
              type === "companies"
                ? el.name || el.localizedName || "Unknown Company"
                : `${el.firstName?.localized?.en_US || el.firstName || ""} ${el.lastName?.localized?.en_US || el.lastName || ""}`.trim() ||
                  "Unknown",
            title:
              type === "people"
                ? el.headline?.localized?.en_US || el.headline
                : undefined,
            company:
              type === "companies"
                ? el.name || el.localizedName
                : el.positions?.values?.[0]?.companyName,
            profileUrl:
              el.publicProfileUrl ||
              `https://linkedin.com/in/${el.vanityName || el.id || ""}`,
          };
          leads.push(lead);

          // Save to leads database
          try {
            await config.convex.mutation(api.leads.createFromServer, {
              organizationId: config.organizationId,
              name: lead.name,
              title: lead.title,
              company: lead.company,
              source: "linkedin" as const,
              sourceUrl: lead.profileUrl,
              metadata: {
                searchQuery: query,
                searchType: type,
                linkedInId: el.id,
              },
            });
          } catch (err: any) {
            console.error("[linkedin_prospect] Failed to save lead:", err);
          }
        }

        return {
          __linkedInProspect: true,
          query,
          type,
          count: leads.length,
          results: leads,
        };
      } catch (err: any) {
        console.error("[linkedin_prospect] Search failed:", err);
        return {
          __linkedInProspect: false,
          error: `LinkedIn search failed: ${err.message?.slice(0, 300)}`,
          results: [],
        };
      }
    },
  });
}
