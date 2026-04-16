import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

// Plan defaults — request quotas instead of credits
export const PLAN_DEFAULTS = {
  free: {
    monthlyRequestLimit: 50,
    maxProjects: 3,
    maxStorageBytes: 100 * 1024 * 1024, // 100MB
    maxTeamMembers: 1,
    maxScheduledTasks: 0,
  },
  starter: {
    monthlyRequestLimit: 500,
    maxProjects: 25,
    maxStorageBytes: 1 * 1024 * 1024 * 1024, // 1GB
    maxTeamMembers: 1,
    maxScheduledTasks: 5,
  },
  pro: {
    monthlyRequestLimit: 2000,
    maxProjects: 999999,
    maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10GB
    maxTeamMembers: 10,
    maxScheduledTasks: 999999,
  },
  enterprise: {
    monthlyRequestLimit: 999999,
    maxProjects: 999999,
    maxStorageBytes: 100 * 1024 * 1024 * 1024, // 100GB
    maxTeamMembers: 999999,
    maxScheduledTasks: 999999,
  },
};

// ── Queries ──

export const getCurrent = query({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("organizations")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();
  },
});

export const getById = query({
  args: { id: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Returns true if the user (by Clerk user id) is a member of the given org.
 * Used by API routes to verify org access before calling other Convex functions.
 */
export const isUserMember = query({
  args: {
    userId: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { userId, organizationId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId_organizationId", (q) =>
        q.eq("clerkUserId", userId).eq("organizationId", organizationId)
      )
      .first();
    return !!user;
  },
});

export const getUsageStats = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) return null;

    const projectCount = (
      await ctx.db
        .query("projects")
        .withIndex("by_organizationId_status", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", "active")
        )
        .collect()
    ).length;

    // Calculate storage usage
    const files = await ctx.db
      .query("files")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const storageUsedBytes =
      files.reduce((sum, f) => sum + f.sizeBytes, 0) +
      artifacts.reduce((sum, a) => sum + a.sizeBytes, 0);

    // Resolve plan to get correct defaults for unmigrated orgs
    const planKey = (["free", "starter", "pro", "enterprise"].includes(org.plan) ? org.plan : "free") as keyof typeof PLAN_DEFAULTS;
    const defaults = PLAN_DEFAULTS[planKey];

    return {
      monthlyRequestCount: org.monthlyRequestCount ?? 0,
      monthlyRequestLimit: org.monthlyRequestLimit ?? defaults.monthlyRequestLimit,
      plan: org.plan,
      projectCount,
      maxProjects: org.maxProjects,
      storageUsedBytes,
      maxStorageBytes: org.maxStorageBytes,
    };
  },
});

// ── Internal Mutations (from Clerk webhooks) ──

export const createFromClerk = internalMutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();

    if (existing) return existing._id;

    // New orgs get 14-day Pro trial
    const proDefaults = PLAN_DEFAULTS.pro;
    const TRIAL_DAYS = 14;

    return await ctx.db.insert("organizations", {
      clerkOrgId: args.clerkOrgId,
      name: args.name,
      slug: args.slug,
      imageUrl: args.imageUrl,
      plan: "pro",
      monthlyRequestCount: 0,
      monthlyRequestLimit: proDefaults.monthlyRequestLimit,
      currentBillingPeriodStart: Date.now(),
      maxProjects: proDefaults.maxProjects,
      maxStorageBytes: proDefaults.maxStorageBytes,
      maxTeamMembers: proDefaults.maxTeamMembers,
      maxScheduledTasks: proDefaults.maxScheduledTasks,
      trialEndsAt: Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
      onboardingCompleted: false,
    });
  },
});

// ── Complete onboarding and save config ───────────────────────────────

export const completeOnboarding = mutation({
  args: {
    organizationId: v.id("organizations"),
    onboardingConfig: v.object({
      states: v.array(v.string()),
      verticals: v.array(v.string()),
      dailyLeads: v.number(),
      emailLimit: v.number(),
      metaLimit: v.number(),
      linkedinLimit: v.number(),
    }),
  },
  handler: async (ctx, { organizationId, onboardingConfig }) => {
    await ctx.db.patch(organizationId, {
      onboardingCompleted: true,
      onboardingConfig,
    });
  },
});

export const updateFromClerk = internalMutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();

    if (!org) return;

    await ctx.db.patch(org._id, {
      name: args.name,
      slug: args.slug,
      imageUrl: args.imageUrl,
    });
  },
});

export const deleteFromClerk = internalMutation({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();

    if (!org) return;

    // Cascade delete: users, projects, sessions, messages
    const users = await ctx.db
      .query("users")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", org._id)
      )
      .collect();
    for (const user of users) {
      await ctx.db.delete(user._id);
    }

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", org._id)
      )
      .collect();
    for (const project of projects) {
      const sessions = await ctx.db
        .query("sessions")
        .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
        .collect();
      for (const session of sessions) {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
          .collect();
        for (const msg of messages) {
          await ctx.db.delete(msg._id);
        }
        await ctx.db.delete(session._id);
      }
      await ctx.db.delete(project._id);
    }

    await ctx.db.delete(org._id);
  },
});

// ── Public Mutations ──

export const updatePlan = mutation({
  args: {
    organizationId: v.id("organizations"),
    plan: v.union(
      v.literal("free"),
      v.literal("starter"),
      v.literal("pro"),
      v.literal("enterprise")
    ),
  },
  handler: async (ctx, args) => {
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

// Check if org has requests remaining and increment usage.
// Resets counter if the billing period has rolled over (30 days).
export const checkAndIncrementUsage = mutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    // Resolve defaults for unmigrated orgs
    const planKey = (["free", "starter", "pro", "enterprise"].includes(org.plan) ? org.plan : "free") as keyof typeof PLAN_DEFAULTS;
    const defaults = PLAN_DEFAULTS[planKey];
    const limit = org.monthlyRequestLimit ?? defaults.monthlyRequestLimit;

    let currentCount = org.monthlyRequestCount ?? 0;
    let periodStart = org.currentBillingPeriodStart ?? now;

    // If billing period has rolled over, reset the counter
    if (now - periodStart >= thirtyDaysMs) {
      currentCount = 0;
      periodStart = now;
    }

    // BYOK users bypass quota checks — any provider credential counts
    const providerKeys = org.providerKeys as Record<string, any> | undefined;
    const hasAnyCredential = providerKeys && Object.values(providerKeys).some(
      (v) => v != null && v !== "" && (typeof v === "string" || (typeof v === "object" && v.type))
    );
    if (hasAnyCredential) {
      await ctx.db.patch(args.organizationId, {
        monthlyRequestCount: currentCount + 1,
        currentBillingPeriodStart: periodStart,
      });
      return { allowed: true, remaining: 999999 };
    }

    // Check quota
    if (currentCount >= limit) {
      throw new Error(
        "Monthly request limit reached. Upgrade your plan for more requests."
      );
    }

    await ctx.db.patch(args.organizationId, {
      monthlyRequestCount: currentCount + 1,
      currentBillingPeriodStart: periodStart,
    });

    return {
      allowed: true,
      remaining: limit - currentCount - 1,
    };
  },
});

export const updateProviderKeys = mutation({
  args: {
    organizationId: v.id("organizations"),
    providerKeys: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.organizationId, {
      providerKeys: args.providerKeys,
    });
  },
});

// ── One-time Migration ──
// Run once via Convex dashboard to migrate existing orgs from credits → request quotas.
// After running, this function can be removed.
export const migrateToRequestQuotas = internalMutation({
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    let migrated = 0;

    for (const org of orgs) {
      // Skip already-migrated orgs
      if (org.monthlyRequestLimit !== undefined) continue;

      // Map old plan names to new ones
      let plan = org.plan;
      if (plan === "team") plan = "pro"; // "team" → "pro"

      const planKey = (["free", "starter", "pro", "enterprise"].includes(plan) ? plan : "free") as keyof typeof PLAN_DEFAULTS;
      const defaults = PLAN_DEFAULTS[planKey];

      // Convert old providerKeys shape to new (preserve openrouter if any, drop old providers)
      const oldKeys = org.providerKeys as Record<string, string | undefined> | undefined;
      const newKeys = oldKeys
        ? { openrouter: (oldKeys as any).openrouter || undefined }
        : undefined;

      await ctx.db.patch(org._id, {
        plan,
        monthlyRequestCount: 0,
        monthlyRequestLimit: defaults.monthlyRequestLimit,
        currentBillingPeriodStart: Date.now(),
        providerKeys: newKeys,
        // Clear legacy fields
        creditBalance: undefined,
        dailyCreditAllowance: undefined,
        lastDailyReset: undefined,
        totalCreditsUsed: undefined,
      });
      migrated++;
    }

    console.log(`Migrated ${migrated} organizations to request quota system.`);
    return { migrated };
  },
});
