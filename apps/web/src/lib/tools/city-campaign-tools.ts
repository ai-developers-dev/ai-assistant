import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

interface CityCampaignToolConfig {
  organizationId: Id<"organizations">;
  convex: ConvexHttpClient;
}

export function createCityCampaignTools({ organizationId, convex }: CityCampaignToolConfig) {
  const get_city_campaign_progress = tool({
    description:
      "Get the next pending city to prospect and the overall campaign progress. Call this at the start of each run to know which city to work on and how many cities are done vs remaining.",
    parameters: z.object({}),
    execute: async () => {
      const [nextCity, progress] = await Promise.all([
        convex.query(api.cityCampaigns.getNextPending, { organizationId }),
        convex.query(api.cityCampaigns.getProgress, { organizationId }),
      ]);
      return { nextCity, progress };
    },
  });

  const mark_city_status = tool({
    description:
      "Mark a city's scraping status. Call with status='in_progress' when starting a city, status='done' when finished (include businessesFound count), or status='failed' if an error occurred.",
    parameters: z.object({
      cityId: z.string().describe("The _id of the city from get_city_campaign_progress"),
      status: z.enum(["in_progress", "done", "failed"]),
      businessesFound: z
        .number()
        .optional()
        .describe("Required when status is 'done' — total new businesses saved for this city"),
    }),
    execute: async ({ cityId, status, businessesFound }) => {
      // Validate this is actually a cityCampaigns ID (starts with ns7 or similar)
      // and NOT a businesses ID (starts with nn7)
      try {
        const id = cityId as Id<"cityCampaigns">;
        if (status === "in_progress") {
          await convex.mutation(api.cityCampaigns.markScraping, { cityId: id });
        } else if (status === "done") {
          await convex.mutation(api.cityCampaigns.markDone, {
            cityId: id,
            businessesFound: businessesFound ?? 0,
          });
        } else if (status === "failed") {
          await convex.mutation(api.cityCampaigns.markFailed, { cityId: id });
        }
        return { success: true, cityId, status };
      } catch (err: any) {
        // Gracefully handle wrong ID type instead of crashing
        return { success: false, error: `Invalid cityId: ${err.message?.slice(0, 100)}` };
      }
    },
  });

  return { get_city_campaign_progress, mark_city_status };
}
