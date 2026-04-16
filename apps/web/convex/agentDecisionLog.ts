import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    agentName: v.string(),
    businessId: v.optional(v.id("businesses")),
    decision: v.union(v.literal("sent"), v.literal("skipped"), v.literal("deferred")),
    reason: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentDecisionLog", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const listByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
    agentName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("agentDecisionLog")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .order("desc");

    const results = await q.take(args.limit ?? 100);

    if (args.agentName) {
      return results.filter((r) => r.agentName === args.agentName);
    }
    return results;
  },
});

export const getDecisionStats = query({
  args: {
    organizationId: v.id("organizations"),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("agentDecisionLog")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const cutoff = args.since ?? 0;
    const recent = all.filter((r) => r.createdAt >= cutoff);

    return {
      total: recent.length,
      sent: recent.filter((r) => r.decision === "sent").length,
      skipped: recent.filter((r) => r.decision === "skipped").length,
      deferred: recent.filter((r) => r.decision === "deferred").length,
      topSkipReasons: Object.entries(
        recent
          .filter((r) => r.decision === "skipped")
          .reduce((acc: Record<string, number>, r) => {
            acc[r.reason] = (acc[r.reason] || 0) + 1;
            return acc;
          }, {})
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count })),
    };
  },
});
