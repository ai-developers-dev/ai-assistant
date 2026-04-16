import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ── Queries ──

export const getByAgentType = query({
  args: { agentType: v.string() },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("platformConfig")
      .withIndex("by_agentType", (q) => q.eq("agentType", args.agentType))
      .unique();
    if (!config || !config.enabled) return null;
    return config;
  },
});

export const listAll = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller) return null;

    return await ctx.db.query("platformConfig").collect();
  },
});

// ── Mutations ──

export const upsert = mutation({
  args: {
    clerkUserId: v.string(),
    agentType: v.string(),
    buildCriteria: v.string(),
    isOverride: v.boolean(),
    enabled: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller) {
      throw new Error("Not authorized. Only platform admins can manage agent config.");
    }

    const existing = await ctx.db
      .query("platformConfig")
      .withIndex("by_agentType", (q) => q.eq("agentType", args.agentType))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        buildCriteria: args.buildCriteria,
        isOverride: args.isOverride,
        enabled: args.enabled,
        updatedBy: args.clerkUserId,
        notes: args.notes,
      });
      return existing._id;
    }

    return await ctx.db.insert("platformConfig", {
      agentType: args.agentType,
      buildCriteria: args.buildCriteria,
      isOverride: args.isOverride,
      enabled: args.enabled,
      updatedBy: args.clerkUserId,
      notes: args.notes,
    });
  },
});

export const remove = mutation({
  args: {
    clerkUserId: v.string(),
    agentType: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller) {
      throw new Error("Not authorized. Only platform admins can manage agent config.");
    }

    const existing = await ctx.db
      .query("platformConfig")
      .withIndex("by_agentType", (q) => q.eq("agentType", args.agentType))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
