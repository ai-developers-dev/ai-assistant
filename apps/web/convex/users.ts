import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

// ── Queries ──

export const getCurrent = query({
  args: {
    clerkUserId: v.string(),
    clerkOrgId: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();

    if (!org) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerkUserId_organizationId", (q) =>
        q
          .eq("clerkUserId", args.clerkUserId)
          .eq("organizationId", org._id)
      )
      .unique();
  },
});

export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
  },
});

// ── Internal Mutations (from Clerk webhooks) ──

export const addToOrganization = internalMutation({
  args: {
    clerkUserId: v.string(),
    clerkOrgId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    role: v.union(
      v.literal("admin"),
      v.literal("member"),
      v.literal("viewer")
    ),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();

    if (!org) {
      console.error(`Organization not found for clerkOrgId: ${args.clerkOrgId}`);
      return;
    }

    // Check if already exists (upsert)
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId_organizationId", (q) =>
        q
          .eq("clerkUserId", args.clerkUserId)
          .eq("organizationId", org._id)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        name: args.name,
        imageUrl: args.imageUrl,
        role: args.role,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      organizationId: org._id,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      role: args.role,
      lastActiveAt: Date.now(),
    });
  },
});

export const updateMembership = internalMutation({
  args: {
    clerkUserId: v.string(),
    clerkOrgId: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("member"),
      v.literal("viewer")
    ),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();

    if (!org) return;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId_organizationId", (q) =>
        q
          .eq("clerkUserId", args.clerkUserId)
          .eq("organizationId", org._id)
      )
      .unique();

    if (!user) return;

    await ctx.db.patch(user._id, { role: args.role });
  },
});

export const removeFromOrganization = internalMutation({
  args: {
    clerkUserId: v.string(),
    clerkOrgId: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();

    if (!org) return;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId_organizationId", (q) =>
        q
          .eq("clerkUserId", args.clerkUserId)
          .eq("organizationId", org._id)
      )
      .unique();

    if (user) {
      await ctx.db.delete(user._id);
    }
  },
});

export const updateFromClerk = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", args.clerkUserId)
      )
      .collect();

    for (const user of users) {
      await ctx.db.patch(user._id, {
        email: args.email,
        name: args.name,
        imageUrl: args.imageUrl,
      });
    }
  },
});

export const deleteFromClerk = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", args.clerkUserId)
      )
      .collect();

    for (const user of users) {
      await ctx.db.delete(user._id);
    }
  },
});

// ── Public Queries ──

export const getById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ── Public Mutations ──

/** Tenant admin: change another member's role in the same org. */
export const updateRole = mutation({
  args: {
    callerId: v.id("users"),
    targetId: v.id("users"),
    newRole: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db.get(args.callerId);
    if (!caller || caller.role !== "admin") {
      throw new Error("Only admins can change member roles.");
    }
    const target = await ctx.db.get(args.targetId);
    if (!target || target.organizationId !== caller.organizationId) {
      throw new Error("User not found in your organization.");
    }
    await ctx.db.patch(args.targetId, { role: args.newRole });
  },
});

/** Tenant admin: remove a member from the org. */
export const removeFromOrg = mutation({
  args: {
    callerId: v.id("users"),
    targetId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db.get(args.callerId);
    if (!caller || caller.role !== "admin") {
      throw new Error("Only admins can remove members.");
    }
    const target = await ctx.db.get(args.targetId);
    if (!target || target.organizationId !== caller.organizationId) {
      throw new Error("User not found in your organization.");
    }
    if (target._id === caller._id) {
      throw new Error("You cannot remove yourself.");
    }
    await ctx.db.delete(args.targetId);
  },
});



export const updateLastActive = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { lastActiveAt: Date.now() });
  },
});

export const updatePreferences = mutation({
  args: {
    userId: v.id("users"),
    preferences: v.object({
      defaultModel: v.optional(v.string()),
      theme: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { preferences: args.preferences });
  },
});
