import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ── Create a post record ──────────────────────────────────────────────

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    platform: v.union(
      v.literal("reddit"),
      v.literal("meta_group"),
      v.literal("linkedin_group"),
      v.literal("youtube"),
      v.literal("discord"),
      v.literal("twitter"),
      v.literal("quora"),
      v.literal("nextdoor")
    ),
    // Legacy fields (kept for backward compat)
    groupName: v.optional(v.string()),
    groupUrl: v.optional(v.string()),
    // New unified target fields
    targetId: v.optional(v.string()),
    targetName: v.optional(v.string()),
    content: v.optional(v.string()),
    vertical: v.optional(v.string()),
    postedAt: v.optional(v.number()),
    status: v.union(v.literal("posted"), v.literal("failed"), v.literal("logged")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Reject empty posts — don't waste DB space on posts with no content
    if (args.status === "posted" && (!args.content || args.content.trim().length === 0)) {
      return null; // Skip saving empty posts
    }

    // Default postedAt to now if not provided
    const doc = {
      ...args,
      postedAt: args.postedAt ?? Date.now(),
    };
    return await ctx.db.insert("leadGenPosts", doc);
  },
});

// ── List recent posts ─────────────────────────────────────────────────

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
    platform: v.optional(v.union(
      v.literal("reddit"),
      v.literal("meta_group"),
      v.literal("linkedin_group"),
      v.literal("youtube"),
      v.literal("discord"),
      v.literal("twitter"),
      v.literal("quora"),
      v.literal("nextdoor")
    )),
  },
  handler: async (ctx, { organizationId, limit = 20, platform }) => {
    const posts = await ctx.db
      .query("leadGenPosts")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .collect();

    const filtered = platform ? posts.filter((p) => p.platform === platform) : posts;
    return filtered.slice(0, limit);
  },
});

// ── Stats by date range ───────────────────────────────────────────────

export const getStatsByDateRange = query({
  args: {
    organizationId: v.id("organizations"),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, { organizationId, startTime, endTime }) => {
    const posts = await ctx.db
      .query("leadGenPosts")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    const inRange = posts.filter((p) => (p.postedAt ?? 0) >= startTime && (p.postedAt ?? 0) <= endTime);

    return {
      total: inRange.length,
      reddit: inRange.filter((p) => p.platform === "reddit" && p.status === "posted").length,
      metaGroup: inRange.filter((p) => p.platform === "meta_group" && p.status === "posted").length,
      linkedinGroup: inRange.filter((p) => p.platform === "linkedin_group" && p.status === "posted").length,
      youtube: inRange.filter((p) => p.platform === "youtube" && p.status === "posted").length,
      twitter: inRange.filter((p) => p.platform === "twitter" && p.status === "posted").length,
      discord: inRange.filter((p) => p.platform === "discord" && p.status === "posted").length,
      quora: inRange.filter((p) => p.platform === "quora").length, // includes "logged"
      nextdoor: inRange.filter((p) => p.platform === "nextdoor").length,
      posted: inRange.filter((p) => p.status === "posted").length,
      failed: inRange.filter((p) => p.status === "failed").length,
      logged: inRange.filter((p) => p.status === "logged").length,
    };
  },
});

// ── All-time stats ────────────────────────────────────────────────────

export const getStats = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const posts = await ctx.db
      .query("leadGenPosts")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    return {
      total: posts.length,
      reddit: posts.filter((p) => p.platform === "reddit").length,
      metaGroup: posts.filter((p) => p.platform === "meta_group").length,
      posted: posts.filter((p) => p.status === "posted").length,
    };
  },
});
