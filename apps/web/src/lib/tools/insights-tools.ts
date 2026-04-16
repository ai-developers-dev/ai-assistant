import { tool } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function createSaveInsightTool(organizationId: string, agentId?: string) {
  return tool({
    description:
      "Save an insight or recommendation to the database. Use this after analyzing task execution data, agent performance, or platform usage to record actionable recommendations for the user.",
    parameters: z.object({
      category: z
        .enum(["performance", "optimization", "failure_analysis", "new_automation", "general"])
        .describe("Category of the insight"),
      title: z.string().describe("Short, descriptive title (max 100 chars)"),
      summary: z.string().describe("One-sentence summary of the recommendation"),
      details: z
        .string()
        .describe("Full explanation with specific data points, steps to fix, or implementation suggestions"),
      priority: z
        .enum(["low", "medium", "high"])
        .describe("Priority based on impact: high = failures/critical issues, medium = optimizations, low = nice-to-haves"),
    }),
    execute: async ({ category, title, summary, details, priority }) => {
      try {
        await convex.mutation(api.agentInsights.createInsight, {
          organizationId: organizationId as Id<"organizations">,
          ...(agentId ? { generatedBy: agentId as Id<"teamAgents"> } : {}),
          category,
          title,
          summary,
          details,
          priority,
        });

        return {
          success: true,
          message: `Insight saved: "${title}" (${priority} priority, ${category})`,
        };
      } catch (error: any) {
        return {
          success: false,
          error: `Failed to save insight: ${error.message}`,
        };
      }
    },
  });
}
