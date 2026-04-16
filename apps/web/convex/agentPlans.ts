import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Server-side mutation — called from the API route's onFinish callback
// via ConvexHttpClient (no user auth). Validates that referenced entities exist.
export const saveFromServer = mutation({
  args: {
    sessionId: v.id("sessions"),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    planId: v.string(),
    goal: v.string(),
    steps: v.array(
      v.object({
        id: v.string(),
        description: v.string(),
        status: v.string(),
        result: v.optional(v.string()),
      })
    ),
    status: v.string(),
    reflections: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate that the org, project, and session exist
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    return await ctx.db.insert("agentPlans", {
      sessionId: args.sessionId,
      projectId: args.projectId,
      organizationId: args.organizationId,
      planId: args.planId,
      goal: args.goal,
      steps: args.steps,
      status: args.status,
      reflections: args.reflections,
    });
  },
});

export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentPlans")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();
  },
});

export const listByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentPlans")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(args.limit ?? 20);
  },
});

export const getByPlanId = query({
  args: { planId: v.string() },
  handler: async (ctx, args) => {
    const plans = await ctx.db
      .query("agentPlans")
      .filter((q) => q.eq(q.field("planId"), args.planId))
      .first();
    return plans;
  },
});
