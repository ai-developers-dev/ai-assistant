import { tool } from "ai";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { ConvexHttpClient } from "convex/browser";

export function createGetCampaignSummaryTool(config: { organizationId: string; convex: ConvexHttpClient }) {
  return tool({
    description: "Get a complete summary of the current campaign state: city progress, business counts by status, and today's activity. Call this FIRST before doing any work.",
    parameters: z.object({}),
    execute: async () => {
      try {
        const [cityProgress, stats] = await Promise.all([
          config.convex.query(api.cityCampaigns.getProgress, {
            organizationId: config.organizationId as any,
          }),
          config.convex.query(api.businesses.getStats, {
            organizationId: config.organizationId as any,
          }),
        ]);

        // Get today's stats
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        let todayStats = null;
        try {
          todayStats = await config.convex.query(api.businesses.getStatsByDateRange, {
            organizationId: config.organizationId as any,
            startTime: todayStart.getTime(),
            endTime: Date.now(),
          });
        } catch (err) {
          console.error("[campaign-summary] getStatsByDateRange failed:", err);
        }

        return {
          success: true,
          cityProgress: {
            done: cityProgress.done,
            pending: cityProgress.pending,
            scraping: cityProgress.scraping,
            failed: cityProgress.failed,
            total: cityProgress.total,
            businessesFound: cityProgress.businessesFound,
          },
          businessStats: {
            total: stats.total,
            new: stats.new,
            ready: stats.ready,
            allSent: stats.allSent,
            withEmail: stats.withEmail,
            withMeta: stats.withMeta,
            withLinkedin: stats.withLinkedin,
          },
          todayStats: todayStats ? {
            scraped: todayStats.found,
            emailsSent: todayStats.emailSent,
            metaSent: todayStats.metaSent,
            linkedinSent: todayStats.linkedinSent,
          } : null,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}
