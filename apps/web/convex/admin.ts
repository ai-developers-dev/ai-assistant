import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { PLAN_DEFAULTS } from "./organizations";

// ── Queries ──

export const checkAccess = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  },
});

export const getPlatformStats = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller) return null;

    const orgs = await ctx.db.query("organizations").collect();
    const users = await ctx.db.query("users").collect();
    const projects = await ctx.db.query("projects").collect();
    const messages = await ctx.db.query("messages").collect();

    const totalRequests = orgs.reduce((sum, o) => sum + (o.monthlyRequestCount ?? 0), 0);

    const planDistribution: Record<string, number> = { free: 0, starter: 0, pro: 0, enterprise: 0 };
    for (const org of orgs) {
      if (planDistribution[org.plan] !== undefined) {
        planDistribution[org.plan]++;
      }
    }

    return {
      orgCount: orgs.length,
      userCount: users.length,
      projectCount: projects.length,
      messageCount: messages.length,
      totalRequests,
      planDistribution,
    };
  },
});

export const listAllOrganizations = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller) return null;

    const orgs = await ctx.db.query("organizations").collect();

    const result = [];
    for (const org of orgs) {
      const projectCount = (
        await ctx.db
          .query("projects")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", org._id))
          .collect()
      ).length;
      const userCount = (
        await ctx.db
          .query("users")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", org._id))
          .collect()
      ).length;

      result.push({ ...org, projectCount, userCount });
    }

    return result;
  },
});

export const listPlatformUsers = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller) return null;

    return await ctx.db.query("platformUsers").collect();
  },
});

export const getPlatformUsage = query({
  args: {
    clerkUserId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller) return null;

    const records = await ctx.db.query("usageRecords").collect();

    const filtered = records.filter(
      (r) => r.date >= args.startDate && r.date <= args.endDate
    );

    let totalTokens = 0;
    let totalCredits = 0;
    let requestCount = 0;
    const byType: Record<string, { tokens: number; credits: number; count: number }> = {};
    const byModel: Record<string, { tokens: number; credits: number; count: number }> = {};
    const byDate: Record<string, { tokens: number; credits: number; count: number }> = {};

    for (const r of filtered) {
      totalTokens += r.totalTokens;
      totalCredits += r.creditCost;
      requestCount++;

      if (!byType[r.type]) byType[r.type] = { tokens: 0, credits: 0, count: 0 };
      byType[r.type].tokens += r.totalTokens;
      byType[r.type].credits += r.creditCost;
      byType[r.type].count++;

      if (!byModel[r.model]) byModel[r.model] = { tokens: 0, credits: 0, count: 0 };
      byModel[r.model].tokens += r.totalTokens;
      byModel[r.model].credits += r.creditCost;
      byModel[r.model].count++;

      if (!byDate[r.date]) byDate[r.date] = { tokens: 0, credits: 0, count: 0 };
      byDate[r.date].tokens += r.totalTokens;
      byDate[r.date].credits += r.creditCost;
      byDate[r.date].count++;
    }

    return { totalTokens, totalCredits, requestCount, byType, byModel, byDate };
  },
});

export const getOrganizationDetail = query({
  args: {
    clerkUserId: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller) return null;

    const org = await ctx.db.get(args.organizationId);
    if (!org) return null;

    const users = await ctx.db
      .query("users")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const recentProjects = allProjects
      .sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0))
      .slice(0, 5)
      .map((p) => ({
        _id: p._id,
        name: p.name,
        agentType: (p as any).agentType ?? null,
        createdAt: p._creationTime,
      }));

    return {
      org,
      users: users.map((u) => ({
        _id: u._id,
        clerkUserId: u.clerkUserId,
        name: u.name,
        email: u.email,
        role: u.role,
        lastActive: (u as any).lastActive ?? null,
        imageUrl: (u as any).imageUrl ?? null,
      })),
      recentProjects,
      projectCount: allProjects.length,
    };
  },
});

export const getTenantFullData = query({
  args: {
    clerkUserId: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller) return null;

    const org = await ctx.db.get(args.organizationId);
    if (!org) return null;

    const agentTeam = await ctx.db
      .query("agentTeams")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .first();

    const agents = agentTeam
      ? await ctx.db
          .query("teamAgents")
          .withIndex("by_agentTeamId", (q) => q.eq("agentTeamId", agentTeam._id))
          .collect()
      : [];

    const scheduledTasks = await ctx.db
      .query("scheduledTasks")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const projects = (await ctx.db
      .query("projects")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect()).sort((a, b) => b.lastActivityAt - a.lastActivityAt);

    const users = await ctx.db
      .query("users")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return { org, agentTeam, agents, scheduledTasks, tasks, projects, users };
  },
});

export const adminUpdateUserRole = mutation({
  args: {
    clerkUserId: v.string(),
    targetUserId: v.id("users"),
    newRole: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller) throw new Error("Not authorized.");

    await ctx.db.patch(args.targetUserId, { role: args.newRole });
  },
});

export const adminRemoveUserFromOrg = mutation({
  args: {
    clerkUserId: v.string(),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller) throw new Error("Not authorized.");

    await ctx.db.delete(args.targetUserId);
  },
});

// ── Mutations ──

export const seedSuperAdmin = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("platformUsers").collect();
    if (existing.length > 0) {
      throw new Error("Platform users already exist. Seed is only for initial setup.");
    }

    return await ctx.db.insert("platformUsers", {
      clerkUserId: args.clerkUserId,
      email: args.email,
      role: "super_admin",
    });
  },
});

export const addPlatformUser = mutation({
  args: {
    clerkUserId: v.string(),
    newClerkUserId: v.string(),
    email: v.string(),
    role: v.union(v.literal("super_admin"), v.literal("platform_staff")),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller || caller.role !== "super_admin") {
      throw new Error("Only super admins can add platform users.");
    }

    const existing = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.newClerkUserId))
      .unique();
    if (existing) {
      throw new Error("User already exists as a platform user.");
    }

    return await ctx.db.insert("platformUsers", {
      clerkUserId: args.newClerkUserId,
      email: args.email,
      role: args.role,
    });
  },
});

export const removePlatformUser = mutation({
  args: {
    clerkUserId: v.string(),
    targetId: v.id("platformUsers"),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller || caller.role !== "super_admin") {
      throw new Error("Only super admins can remove platform users.");
    }

    const target = await ctx.db.get(args.targetId);
    if (!target) throw new Error("Platform user not found.");
    if (target.clerkUserId === args.clerkUserId) {
      throw new Error("Cannot remove yourself.");
    }

    await ctx.db.delete(args.targetId);
  },
});

export const adminCreateOrg = mutation({
  args: {
    clerkUserId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    plan: v.union(
      v.literal("free"),
      v.literal("starter"),
      v.literal("pro"),
      v.literal("enterprise")
    ),
    ownerEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller || caller.role !== "super_admin") {
      throw new Error("Only super admins can create organizations.");
    }

    const defaults = PLAN_DEFAULTS[args.plan];
    const slug = args.slug ?? args.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    // Use a placeholder clerkOrgId — admin-provisioned orgs not backed by Clerk
    const clerkOrgId = `admin_provisioned_${Date.now()}`;

    return await ctx.db.insert("organizations", {
      clerkOrgId,
      name: args.name,
      slug,
      plan: args.plan,
      monthlyRequestCount: 0,
      ...defaults,
    });
  },
});

export const adminUpdateOrg = mutation({
  args: {
    clerkUserId: v.string(),
    organizationId: v.id("organizations"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller) throw new Error("Not authorized.");

    const patch: Record<string, string> = {};
    if (args.name) patch.name = args.name;
    if (args.slug) patch.slug = args.slug;
    if (Object.keys(patch).length === 0) return;

    await ctx.db.patch(args.organizationId, patch);
  },
});

export const adminDeleteOrg = mutation({
  args: {
    clerkUserId: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller || caller.role !== "super_admin") {
      throw new Error("Only super admins can delete organizations.");
    }

    // Delete all users in the org
    const users = await ctx.db
      .query("users")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const u of users) await ctx.db.delete(u._id);

    // Delete all projects in the org
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const p of projects) await ctx.db.delete(p._id);

    // Delete the org itself
    await ctx.db.delete(args.organizationId);
  },
});

export const adminUpdateOrgPlan = mutation({
  args: {
    clerkUserId: v.string(),
    organizationId: v.id("organizations"),
    plan: v.union(
      v.literal("free"),
      v.literal("starter"),
      v.literal("pro"),
      v.literal("enterprise")
    ),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (!caller) {
      throw new Error("Not authorized.");
    }

    const defaults = PLAN_DEFAULTS[args.plan];
    await ctx.db.patch(args.organizationId, {
      plan: args.plan,
      monthlyRequestLimit: defaults.monthlyRequestLimit,
      maxProjects: defaults.maxProjects,
      maxStorageBytes: defaults.maxStorageBytes,
      maxTeamMembers: defaults.maxTeamMembers,
      maxScheduledTasks: defaults.maxScheduledTasks,
    });
  },
});
