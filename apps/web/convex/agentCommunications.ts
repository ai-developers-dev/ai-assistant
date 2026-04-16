import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ── Mutations ────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    agentTeamId: v.id("agentTeams"),
    projectId: v.optional(v.id("projects")),
    sessionId: v.optional(v.id("sessions")),
    fromType: v.union(v.literal("main"), v.literal("sub")),
    fromAgentId: v.optional(v.id("teamAgents")),
    fromName: v.string(),
    toType: v.union(v.literal("main"), v.literal("sub")),
    toAgentId: v.optional(v.id("teamAgents")),
    toName: v.string(),
    messageType: v.union(
      v.literal("delegation"),
      v.literal("result"),
      v.literal("question"),
      v.literal("info"),
      v.literal("error")
    ),
    content: v.string(),
    metadata: v.optional(v.any()),
    delegationChainId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentCommunications", args);
  },
});

// ── Queries ──────────────────────────────────────────────────────────

export const listByTeam = query({
  args: {
    agentTeamId: v.id("agentTeams"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentCommunications")
      .withIndex("by_agentTeamId", (q) =>
        q.eq("agentTeamId", args.agentTeamId)
      )
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentCommunications")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listBySession = query({
  args: {
    sessionId: v.id("sessions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentCommunications")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listByChain = query({
  args: {
    delegationChainId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentCommunications")
      .withIndex("by_delegationChainId", (q) =>
        q.eq("delegationChainId", args.delegationChainId)
      )
      .order("asc")
      .collect();
  },
});

export const listRecentByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentCommunications")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(args.limit ?? 20);
  },
});

export const listByAgent = query({
  args: {
    agentTeamId: v.id("agentTeams"),
    agentId: v.id("teamAgents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("agentCommunications")
      .withIndex("by_agentTeamId", (q) =>
        q.eq("agentTeamId", args.agentTeamId)
      )
      .order("desc")
      .take(200);

    return all
      .filter(
        (c) => c.fromAgentId === args.agentId || c.toAgentId === args.agentId
      )
      .slice(0, args.limit ?? 50);
  },
});
