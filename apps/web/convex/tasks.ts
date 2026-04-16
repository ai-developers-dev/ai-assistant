import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(200);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    title: v.string(),
    description: v.optional(v.string()),
    stage: v.optional(
      v.union(
        v.literal("inbox"),
        v.literal("assigned"),
        v.literal("in_progress"),
        v.literal("review"),
        v.literal("quality_review"),
        v.literal("done")
      )
    ),
    priority: v.optional(
      v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
        v.literal("urgent")
      )
    ),
    assignedAgentId: v.optional(v.id("teamAgents")),
    assignedAgentName: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    sessionId: v.optional(v.id("sessions")),
    createdBy: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("tasks", {
      organizationId: args.organizationId,
      title: args.title,
      description: args.description,
      stage: args.stage ?? "inbox",
      priority: args.priority ?? "medium",
      assignedAgentId: args.assignedAgentId,
      assignedAgentName: args.assignedAgentName,
      projectId: args.projectId,
      sessionId: args.sessionId,
      createdBy: args.createdBy,
      tags: args.tags,
      dueAt: args.dueAt,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStage = mutation({
  args: {
    taskId: v.id("tasks"),
    stage: v.union(
      v.literal("inbox"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("quality_review"),
      v.literal("done")
    ),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      stage: args.stage,
      updatedAt: Date.now(),
    };
    if (args.stage === "done") {
      patch.completedAt = Date.now();
    }
    await ctx.db.patch(args.taskId, patch);
  },
});

export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(
      v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
        v.literal("urgent")
      )
    ),
    assignedAgentId: v.optional(v.id("teamAgents")),
    assignedAgentName: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { taskId, ...fields } = args;
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(taskId, updates);
  },
});

export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.taskId);
  },
});
