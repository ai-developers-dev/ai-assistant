import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Record a usage event
export const recordUsage = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    type: v.union(
      v.literal("chat"),
      v.literal("image_generation"),
      v.literal("embedding"),
      v.literal("tool_execution")
    ),
    model: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    creditCost: v.number(),
  },
  handler: async (ctx, args) => {
    const date = new Date().toISOString().split("T")[0];
    await ctx.db.insert("usageRecords", {
      ...args,
      date,
    });
  },
});

// Get usage for current period
export const getUsageForPeriod = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("usageRecords")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    return records.filter(
      (r) => r.date >= args.startDate && r.date <= args.endDate
    );
  },
});
