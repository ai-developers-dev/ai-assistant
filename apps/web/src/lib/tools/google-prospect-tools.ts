import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

interface GoogleProspectConfig {
  apiKey: string;
  searchEngineId: string;
  organizationId: Id<"organizations">;
  convex: ConvexHttpClient;
}

// ── Helpers ──

function extractEmail(text: string): string | undefined {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match?.[0];
}

function extractPhone(text: string): string | undefined {
  const match = text.match(
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/
  );
  return match?.[0];
}

function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * Factory: creates a Google Custom Search prospecting tool.
 */
export function createGoogleProspectTool(config: GoogleProspectConfig) {
  return tool({
    description:
      "Search Google Custom Search API to find business leads, companies, and contact information. Results are automatically saved to the leads database.",
    parameters: z.object({
      query: z
        .string()
        .describe(
          "Search query to find leads (e.g. 'SaaS companies in Chicago', 'dentists in Austin TX email')"
        ),
      num: z
        .number()
        .min(1)
        .max(10)
        .default(10)
        .describe("Number of results to return (1-10)"),
      siteRestrict: z
        .string()
        .optional()
        .describe(
          "Optional: restrict search to a specific site (e.g. 'linkedin.com')"
        ),
    }),
    execute: async ({ query, num, siteRestrict }) => {
      try {
        const params = new URLSearchParams({
          key: config.apiKey,
          cx: config.searchEngineId,
          q: siteRestrict ? `site:${siteRestrict} ${query}` : query,
          num: String(num),
        });

        const res = await fetch(
          `https://www.googleapis.com/customsearch/v1?${params}`
        );

        if (!res.ok) {
          const err = await res.text();
          return {
            __googleProspect: false,
            error: `Google CSE API error (${res.status}): ${err.slice(0, 300)}`,
            results: [],
          };
        }

        const data = await res.json();
        const items = data.items || [];
        const leads: Array<{
          name: string;
          company?: string;
          email?: string;
          phone?: string;
          sourceUrl: string;
          snippet: string;
        }> = [];

        for (const item of items) {
          const fullText = `${item.title || ""} ${item.snippet || ""} ${item.htmlSnippet || ""}`;
          const email = extractEmail(fullText);
          const phone = extractPhone(fullText);
          const domain = extractDomain(item.link || "");

          const lead = {
            name: item.title || "Unknown",
            company: domain || undefined,
            email,
            phone,
            sourceUrl: item.link || "",
            snippet: (item.snippet || "").slice(0, 300),
          };
          leads.push(lead);

          // Save to leads database
          try {
            await config.convex.mutation(api.leads.createFromServer, {
              organizationId: config.organizationId,
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
              company: lead.company,
              source: "google" as const,
              sourceUrl: lead.sourceUrl,
              notes: lead.snippet,
              metadata: {
                searchQuery: query,
                domain,
              },
            });
          } catch (err: any) {
            console.error("[google_prospect] Failed to save lead:", err);
          }
        }

        return {
          __googleProspect: true,
          query,
          totalResults: data.searchInformation?.totalResults || "0",
          count: leads.length,
          results: leads,
        };
      } catch (err: any) {
        console.error("[google_prospect] Search failed:", err);
        return {
          __googleProspect: false,
          error: `Google search failed: ${err.message?.slice(0, 300)}`,
          results: [],
        };
      }
    },
  });
}
