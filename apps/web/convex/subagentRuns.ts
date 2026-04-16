import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ── startRun ─────────────────────────────────────────────────────────
// Record the start of a subagent delegation.

export const startRun = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    sessionId: v.optional(v.id("sessions")),
    parentAgentType: v.string(),
    childAgentType: v.string(),
    depth: v.number(),
    task: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("subagentRuns", {
      organizationId: args.organizationId,
      projectId: args.projectId,
      sessionId: args.sessionId,
      parentAgentType: args.parentAgentType,
      childAgentType: args.childAgentType,
      depth: args.depth,
      task: args.task.slice(0, 2000), // Truncate long tasks
      status: "running",
      startedAt: Date.now(),
    });
  },
});

// ── completeRun ──────────────────────────────────────────────────────
// Record the completion (success or failure) of a subagent delegation.

export const completeRun = mutation({
  args: {
    runId: v.id("subagentRuns"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return;

    const now = Date.now();
    await ctx.db.patch(args.runId, {
      status: args.status,
      result: args.result?.slice(0, 5000), // Truncate long results
      error: args.error?.slice(0, 1000),
      completedAt: now,
      durationMs: now - run.startedAt,
    });
  },
});

// ── listBySession ────────────────────────────────────────────────────
// List all subagent runs for a session (for UI display).

export const listBySession = query({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subagentRuns")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();
  },
});

// ── listByProject ────────────────────────────────────────────────────
// List recent subagent runs for a project.

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subagentRuns")
      .withIndex("by_projectId_status")
      .order("desc")
      .take(args.limit ?? 20);
  },
});
