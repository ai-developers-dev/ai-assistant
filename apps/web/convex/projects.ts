import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const agentTypeValidator = v.union(
  v.literal("general"),
  v.literal("images"),
  v.literal("documents"),
  v.literal("slides"),
  v.literal("chat"),
  v.literal("sheets"),
  v.literal("websites"),
  v.literal("videos"),
  v.literal("tools"),
  v.literal("lead_gen")
);

// ── Queries ──

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(
      v.union(v.literal("active"), v.literal("archived"), v.literal("deleted"))
    ),
  },
  handler: async (ctx, args) => {
    const status = args.status || "active";
    return await ctx.db
      .query("projects")
      .withIndex("by_organizationId_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", status)
      )
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId);
  },
});

export const getRecent = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 6;
    return await ctx.db
      .query("projects")
      .withIndex("by_organizationId_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "active")
      )
      .order("desc")
      .take(limit);
  },
});

// ── Mutations ──

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    agentType: agentTypeValidator,
    agentConfig: v.optional(
      v.object({
        model: v.optional(v.string()),
        systemPrompt: v.optional(v.string()),
        temperature: v.optional(v.number()),
        maxSteps: v.optional(v.number()),
        enabledTools: v.optional(v.array(v.string())),
        proMode: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Check project limit
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    // Viewer role cannot create projects
    const creator = await ctx.db.get(args.createdBy);
    if (creator?.role === "viewer") {
      throw new Error("Viewers cannot create projects. Ask your admin to upgrade your role.");
    }

    const activeProjects = await ctx.db
      .query("projects")
      .withIndex("by_organizationId_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "active")
      )
      .collect();

    if (activeProjects.length >= org.maxProjects) {
      throw new Error(
        `Project limit reached (${org.maxProjects}). Upgrade your plan for more projects.`
      );
    }

    const projectId = await ctx.db.insert("projects", {
      organizationId: args.organizationId,
      createdBy: args.createdBy,
      name: args.name,
      description: args.description,
      agentType: args.agentType,
      agentConfig: args.agentConfig,
      status: "active",
      lastActivityAt: Date.now(),
      messageCount: 0,
    });

    // Auto-create first session
    await ctx.db.insert("sessions", {
      projectId,
      organizationId: args.organizationId,
      title: "New conversation",
      status: "active",
      messageCount: 0,
    });

    return projectId;
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    agentConfig: v.optional(
      v.object({
        model: v.optional(v.string()),
        systemPrompt: v.optional(v.string()),
        temperature: v.optional(v.number()),
        maxSteps: v.optional(v.number()),
        enabledTools: v.optional(v.array(v.string())),
        proMode: v.optional(v.boolean()),
        heartbeatEnabled: v.optional(v.boolean()),
        heartbeatIntervalMinutes: v.optional(v.number()),
        heartbeatChecklist: v.optional(v.string()),
        heartbeatActiveHours: v.optional(
          v.object({
            start: v.number(),
            end: v.number(),
            timezone: v.string(),
          })
        ),
      })
    ),
    isPinned: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { projectId, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(projectId, filtered);
  },
});

// Auto-rename a project based on the first user message.
// Called from the API route after the first exchange.
export const autoRename = mutation({
  args: {
    projectId: v.id("projects"),
    firstMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return;

    // Only rename if the name is still a default (e.g. "Websites Project")
    const isDefault = /^[A-Z][a-z]+ Project$/.test(project.name);
    if (!isDefault) return;

    // Create a short name from the first message (max 50 chars)
    let name = args.firstMessage
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (name.length > 50) {
      name = name.slice(0, 47) + "...";
    }

    if (name.length > 0) {
      await ctx.db.patch(args.projectId, { name });
    }
  },
});

export const archive = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { status: "archived" });
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { status: "deleted" });
  },
});
