import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";

// ── Queries ──

export const listByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(
      v.union(
        v.literal("new"),
        v.literal("acknowledged"),
        v.literal("applied"),
        v.literal("dismissed")
      )
    ),
    category: v.optional(
      v.union(
        v.literal("performance"),
        v.literal("optimization"),
        v.literal("failure_analysis"),
        v.literal("new_automation"),
        v.literal("general")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q;
    if (args.status) {
      q = ctx.db
        .query("agentInsights")
        .withIndex("by_organizationId_status", (idx) =>
          idx.eq("organizationId", args.organizationId).eq("status", args.status!)
        );
    } else if (args.category) {
      q = ctx.db
        .query("agentInsights")
        .withIndex("by_organizationId_category", (idx) =>
          idx.eq("organizationId", args.organizationId).eq("category", args.category!)
        );
    } else {
      q = ctx.db
        .query("agentInsights")
        .withIndex("by_organizationId", (idx) =>
          idx.eq("organizationId", args.organizationId)
        );
    }

    return await q.order("desc").take(args.limit ?? 50);
  },
});

export const getStats = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("agentInsights")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    return {
      total: all.length,
      new: all.filter((i) => i.status === "new").length,
      high: all.filter((i) => i.priority === "high" && i.status === "new").length,
      byCategory: {
        performance: all.filter((i) => i.category === "performance").length,
        optimization: all.filter((i) => i.category === "optimization").length,
        failure_analysis: all.filter((i) => i.category === "failure_analysis").length,
        new_automation: all.filter((i) => i.category === "new_automation").length,
        general: all.filter((i) => i.category === "general").length,
      },
    };
  },
});

// ── Mutations ──

export const updateStatus = mutation({
  args: {
    insightId: v.id("agentInsights"),
    status: v.union(
      v.literal("acknowledged"),
      v.literal("applied"),
      v.literal("dismissed")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.insightId, { status: args.status });
  },
});

export const deleteInsight = mutation({
  args: { insightId: v.id("agentInsights") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.insightId);
  },
});

// ── Server-side creation (called by insights agent tool) ──

export const createInsight = mutation({
  args: {
    organizationId: v.id("organizations"),
    generatedBy: v.optional(v.id("teamAgents")),
    category: v.union(
      v.literal("performance"),
      v.literal("optimization"),
      v.literal("failure_analysis"),
      v.literal("new_automation"),
      v.literal("general")
    ),
    title: v.string(),
    summary: v.string(),
    details: v.string(),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    ),
    relatedTaskId: v.optional(v.id("scheduledTasks")),
    relatedAgentId: v.optional(v.id("teamAgents")),
    dataSnapshot: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentInsights", {
      ...args,
      status: "new",
      generatedAt: Date.now(),
    });
  },
});

// ── Internal (called by scheduled tasks) ──

export const createFromServer = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    generatedBy: v.optional(v.id("teamAgents")),
    category: v.union(
      v.literal("performance"),
      v.literal("optimization"),
      v.literal("failure_analysis"),
      v.literal("new_automation"),
      v.literal("general")
    ),
    title: v.string(),
    summary: v.string(),
    details: v.string(),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    ),
    relatedTaskId: v.optional(v.id("scheduledTasks")),
    relatedAgentId: v.optional(v.id("teamAgents")),
    dataSnapshot: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentInsights", {
      ...args,
      status: "new",
      generatedAt: Date.now(),
    });
  },
});

/** Fetch execution data for the insights agent to analyze */
export const getAnalysisData = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    // Recent task executions (last 50)
    const executions = await ctx.db
      .query("taskExecutionResults")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(50);

    // All scheduled tasks
    const tasks = await ctx.db
      .query("scheduledTasks")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    // Team agents
    const teamAgentsRaw = await ctx.db.query("teamAgents").collect();
    const teamAgents = teamAgentsRaw.filter(
      (a) => a.organizationId === args.organizationId
    );

    // Summary stats
    const successCount = executions.filter((e) => e.status === "success").length;
    const failCount = executions.filter((e) => e.status === "failed").length;
    const avgDuration =
      executions.length > 0
        ? executions.reduce((sum, e) => sum + (e.durationMs || 0), 0) /
          executions.length
        : 0;

    return {
      tasks: tasks.map((t) => ({
        id: t._id,
        name: t.name,
        status: t.status,
        runCount: t.runCount,
        schedule: t.schedule,
        lastRunAt: t.lastRunAt,
        agentType: t.agentConfig.agentType,
      })),
      recentExecutions: executions.map((e) => ({
        taskId: e.taskId,
        status: e.status,
        durationMs: e.durationMs,
        error: e.error?.slice(0, 200),
        executedAt: e.executedAt,
      })),
      teamAgents: teamAgents.map((a) => ({
        id: a._id,
        name: a.name,
        specialty: a.specialty,
        isEnabled: a.isEnabled,
        status: a.status,
      })),
      summary: {
        totalTasks: tasks.length,
        activeTasks: tasks.filter((t) => t.status === "active").length,
        totalExecutions: executions.length,
        successRate:
          executions.length > 0
            ? Math.round((successCount / executions.length) * 100)
            : 0,
        failureRate:
          executions.length > 0
            ? Math.round((failCount / executions.length) * 100)
            : 0,
        avgDurationMs: Math.round(avgDuration),
        totalAgents: teamAgents.length,
        enabledAgents: teamAgents.filter((a) => a.isEnabled).length,
      },
    };
  },
});
