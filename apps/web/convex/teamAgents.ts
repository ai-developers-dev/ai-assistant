import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const MAX_SUB_AGENTS = 8;

// ── Queries ──────────────────────────────────────────────────────────

export const listByTeam = query({
  args: { agentTeamId: v.id("agentTeams") },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("teamAgents")
      .withIndex("by_agentTeamId", (q) =>
        q.eq("agentTeamId", args.agentTeamId)
      )
      .collect();
    return agents.sort((a, b) => a.order - b.order);
  },
});

export const listByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("teamAgents")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    return agents.sort((a, b) => a.order - b.order);
  },
});

// Team agents + their last recorded activity (from agentDecisionLog).
// Used by the Agents page to show "last seen 2m ago" per agent instead of a static "idle".
export const listByOrganizationWithActivity = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("teamAgents")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    // Pull last 200 decisions once, then index by agentName for O(n) lookup per agent.
    const decisions = await ctx.db
      .query("agentDecisionLog")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(200);
    const lastByName = new Map<string, { createdAt: number; decision: string; reason?: string }>();
    for (const d of decisions) {
      if (!lastByName.has(d.agentName)) {
        lastByName.set(d.agentName, {
          createdAt: d.createdAt,
          decision: d.decision,
          reason: d.reason,
        });
      }
    }
    return agents
      .sort((a, b) => a.order - b.order)
      .map((a) => ({
        ...a,
        lastActivity: lastByName.get(a.name) ?? null,
      }));
  },
});

// ── Mutations ────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    agentTeamId: v.id("agentTeams"),
    name: v.string(),
    specialty: v.string(),
    modelId: v.string(),
    toolProfile: v.string(),
    customPrompt: v.optional(v.string()),
    isEnabled: v.optional(v.boolean()),
    isHidden: v.optional(v.boolean()),
    reportsTo: v.optional(v.id("teamAgents")),
    minCollaboration: v.optional(v.array(v.id("teamAgents"))),
  },
  handler: async (ctx, args) => {
    // Enforce max 8 sub-agents (hidden agents don't count toward the limit)
    const existing = await ctx.db
      .query("teamAgents")
      .withIndex("by_agentTeamId", (q) =>
        q.eq("agentTeamId", args.agentTeamId)
      )
      .collect();

    const visibleCount = existing.filter((a) => !a.isHidden).length;
    if (!args.isHidden && visibleCount >= MAX_SUB_AGENTS) {
      throw new Error(`Maximum of ${MAX_SUB_AGENTS} sub-agents per team`);
    }

    return await ctx.db.insert("teamAgents", {
      organizationId: args.organizationId,
      agentTeamId: args.agentTeamId,
      name: args.name,
      specialty: args.specialty,
      modelId: args.modelId,
      toolProfile: args.toolProfile,
      customPrompt: args.customPrompt,
      status: "idle",
      order: existing.length,
      isEnabled: args.isEnabled ?? true,
      isHidden: args.isHidden ?? false,
      reportsTo: args.reportsTo,
      minCollaboration: args.minCollaboration,
      lastActiveAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    agentId: v.id("teamAgents"),
    name: v.optional(v.string()),
    specialty: v.optional(v.string()),
    modelId: v.optional(v.string()),
    toolProfile: v.optional(v.string()),
    customPrompt: v.optional(v.string()),
    isEnabled: v.optional(v.boolean()),
    isHidden: v.optional(v.boolean()),
    reportsTo: v.optional(v.id("teamAgents")),
    minCollaboration: v.optional(v.array(v.id("teamAgents"))),
  },
  handler: async (ctx, args) => {
    const { agentId, ...fields } = args;
    const patch: Record<string, any> = {};
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.specialty !== undefined) patch.specialty = fields.specialty;
    if (fields.modelId !== undefined) patch.modelId = fields.modelId;
    if (fields.toolProfile !== undefined) patch.toolProfile = fields.toolProfile;
    if (fields.customPrompt !== undefined) patch.customPrompt = fields.customPrompt;
    if (fields.isEnabled !== undefined) patch.isEnabled = fields.isEnabled;
    if (fields.isHidden !== undefined) patch.isHidden = fields.isHidden;
    if (fields.reportsTo !== undefined) patch.reportsTo = fields.reportsTo;
    if (fields.minCollaboration !== undefined) patch.minCollaboration = fields.minCollaboration;
    await ctx.db.patch(agentId, patch);
  },
});

export const remove = mutation({
  args: { agentId: v.id("teamAgents") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.agentId);
  },
});

export const updateStatus = mutation({
  args: {
    agentId: v.id("teamAgents"),
    status: v.union(
      v.literal("idle"),
      v.literal("working"),
      v.literal("waiting"),
      v.literal("error")
    ),
    currentTask: v.optional(v.string()),
    currentProjectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) return; // Agent was deleted, silently skip
    await ctx.db.patch(args.agentId, {
      status: args.status,
      currentTask: args.currentTask,
      currentProjectId: args.currentProjectId,
      lastActiveAt: Date.now(),
    });
  },
});

export const reorder = mutation({
  args: {
    agentTeamId: v.id("agentTeams"),
    orderedIds: v.array(v.id("teamAgents")),
  },
  handler: async (ctx, args) => {
    for (let i = 0; i < args.orderedIds.length; i++) {
      await ctx.db.patch(args.orderedIds[i], { order: i });
    }
  },
});
