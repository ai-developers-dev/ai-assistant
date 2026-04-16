import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

export const getActiveForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    return sessions.find((s) => s.status === "active") || sessions[0] || null;
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sessions", {
      projectId: args.projectId,
      organizationId: args.organizationId,
      title: args.title || "New conversation",
      status: "active",
      messageCount: 0,
    });
  },
});

export const updateTitle = mutation({
  args: {
    sessionId: v.id("sessions"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { title: args.title });
  },
});

export const archive = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { status: "archived" });
  },
});

export const saveSummary = mutation({
  args: {
    sessionId: v.id("sessions"),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { summary: args.summary });
  },
});
