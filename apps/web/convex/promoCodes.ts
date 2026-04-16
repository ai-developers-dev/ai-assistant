import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { PLAN_DEFAULTS } from "./organizations";

// ── Helpers ──

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(type: "trial_30d" | "unlimited"): string {
  const prefix = type === "trial_30d" ? "TRIAL" : "PRO";
  const segment = () =>
    Array.from({ length: 4 }, () =>
      CHARSET[Math.floor(Math.random() * CHARSET.length)]
    ).join("");
  return `${prefix}-${segment()}-${segment()}`;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ── Admin Mutations ──

export const createPromoCode = mutation({
  args: {
    clerkUserId: v.string(),
    type: v.union(v.literal("trial_30d"), v.literal("unlimited")),
    plan: v.optional(
      v.union(v.literal("starter"), v.literal("pro"), v.literal("enterprise"))
    ),
    maxRedemptions: v.optional(v.number()),
    note: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", args.clerkUserId)
      )
      .unique();
    if (!caller || caller.role !== "super_admin") {
      throw new Error("Only super admins can create promo codes.");
    }

    const plan = args.plan ?? "pro";
    const maxRedemptions = args.maxRedemptions ?? 1;

    // Generate unique code with retry
    let code = "";
    for (let i = 0; i < 5; i++) {
      const candidate = generateCode(args.type);
      const existing = await ctx.db
        .query("promoCodes")
        .withIndex("by_code", (q) => q.eq("code", candidate))
        .unique();
      if (!existing) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      throw new Error("Failed to generate unique code after 5 attempts.");
    }

    const id = await ctx.db.insert("promoCodes", {
      code,
      type: args.type,
      plan,
      maxRedemptions,
      currentRedemptions: 0,
      status: "active",
      createdBy: args.clerkUserId,
      note: args.note,
      expiresAt: args.expiresAt,
    });

    return { code, _id: id };
  },
});

export const revokePromoCode = mutation({
  args: {
    clerkUserId: v.string(),
    promoCodeId: v.id("promoCodes"),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", args.clerkUserId)
      )
      .unique();
    if (!caller || caller.role !== "super_admin") {
      throw new Error("Only super admins can revoke promo codes.");
    }

    const promoCode = await ctx.db.get(args.promoCodeId);
    if (!promoCode) throw new Error("Promo code not found.");

    await ctx.db.patch(args.promoCodeId, { status: "revoked" });
  },
});

// ── User-Facing Mutations ──

export const redeemPromoCode = mutation({
  args: {
    clerkUserId: v.string(),
    clerkOrgId: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    // Look up the org
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();
    if (!org) throw new Error("Organization not found.");

    // Reject if org has an active Stripe subscription
    if (org.stripeSubscriptionId) {
      throw new Error(
        "Cannot redeem promo code — your organization has an active Stripe subscription."
      );
    }

    // Look up the promo code
    const promoCode = await ctx.db
      .query("promoCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .unique();
    if (!promoCode) throw new Error("Invalid promo code.");
    if (promoCode.status !== "active") {
      throw new Error("This promo code is no longer active.");
    }
    if (promoCode.currentRedemptions >= promoCode.maxRedemptions) {
      throw new Error("This promo code has been fully redeemed.");
    }
    if (promoCode.expiresAt && promoCode.expiresAt <= Date.now()) {
      throw new Error("This promo code has expired.");
    }

    // If org has an existing promo, mark old redemption as superseded
    // but preserve the original previousPlan for rollback
    let previousPlan: string = org.plan;
    if (org.isPromoUpgrade) {
      // Already on promo — keep original previousPlan
      previousPlan = org.previousPlan ?? "free";

      // Mark existing active redemptions as superseded
      const existingRedemptions = await ctx.db
        .query("promoRedemptions")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", org._id)
        )
        .collect();
      for (const r of existingRedemptions) {
        if (r.status === "active") {
          await ctx.db.patch(r._id, { status: "superseded" });
        }
      }
    }

    // Calculate expiry
    const expiresAt =
      promoCode.type === "trial_30d" ? Date.now() + THIRTY_DAYS_MS : undefined;

    // Insert redemption record
    await ctx.db.insert("promoRedemptions", {
      promoCodeId: promoCode._id,
      organizationId: org._id,
      redeemedBy: args.clerkUserId,
      redeemedAt: Date.now(),
      planGranted: promoCode.plan,
      expiresAt,
      status: "active",
    });

    // Increment redemptions on code
    const newCount = promoCode.currentRedemptions + 1;
    await ctx.db.patch(promoCode._id, {
      currentRedemptions: newCount,
      status: newCount >= promoCode.maxRedemptions ? "exhausted" : "active",
    });

    // Upgrade the org
    const planDefaults =
      PLAN_DEFAULTS[promoCode.plan as keyof typeof PLAN_DEFAULTS];
    await ctx.db.patch(org._id, {
      plan: promoCode.plan as "starter" | "pro" | "enterprise",
      monthlyRequestLimit: planDefaults.monthlyRequestLimit,
      maxProjects: planDefaults.maxProjects,
      maxStorageBytes: planDefaults.maxStorageBytes,
      maxTeamMembers: planDefaults.maxTeamMembers,
      maxScheduledTasks: planDefaults.maxScheduledTasks,
      promoCodeId: promoCode._id,
      promoExpiresAt: expiresAt,
      isPromoUpgrade: true,
      previousPlan: previousPlan as string,
    });

    return {
      plan: promoCode.plan,
      type: promoCode.type,
      expiresAt,
    };
  },
});

// ── Admin Queries ──

export const listPromoCodes = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", args.clerkUserId)
      )
      .unique();
    if (!caller) return null;

    return await ctx.db.query("promoCodes").order("desc").collect();
  },
});

export const getPromoCodeRedemptions = query({
  args: {
    clerkUserId: v.string(),
    promoCodeId: v.id("promoCodes"),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db
      .query("platformUsers")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", args.clerkUserId)
      )
      .unique();
    if (!caller) return null;

    const redemptions = await ctx.db
      .query("promoRedemptions")
      .withIndex("by_promoCodeId", (q) =>
        q.eq("promoCodeId", args.promoCodeId)
      )
      .collect();

    const result = [];
    for (const r of redemptions) {
      const org = await ctx.db.get(r.organizationId);
      result.push({
        ...r,
        orgName: org?.name ?? "Unknown",
      });
    }
    return result;
  },
});

// ── User-Facing Queries ──

export const getActivePromoForOrg = query({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();
    if (!org || !org.isPromoUpgrade) return null;

    const redemptions = await ctx.db
      .query("promoRedemptions")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", org._id))
      .collect();

    const active = redemptions.find((r) => r.status === "active");
    if (!active) return null;

    const isUnlimited = !active.expiresAt;
    const daysRemaining = active.expiresAt
      ? Math.max(
          0,
          Math.ceil((active.expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
        )
      : null;

    return {
      plan: active.planGranted,
      isUnlimited,
      daysRemaining,
      expiresAt: active.expiresAt ?? null,
    };
  },
});

// ── Internal: Cron Handler ──

export const expireTrials = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    // Find all active redemptions that have expired
    const activeRedemptions = await ctx.db
      .query("promoRedemptions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    for (const redemption of activeRedemptions) {
      // Skip unlimited (no expiresAt)
      if (!redemption.expiresAt) continue;
      // Skip not yet expired
      if (redemption.expiresAt > now) continue;

      // Mark redemption as expired
      await ctx.db.patch(redemption._id, { status: "expired" });

      // Downgrade the org
      const org = await ctx.db.get(redemption.organizationId);
      if (!org) continue;

      const rollbackPlan = (org.previousPlan ?? "free") as keyof typeof PLAN_DEFAULTS;
      const defaults = PLAN_DEFAULTS[rollbackPlan] ?? PLAN_DEFAULTS.free;

      await ctx.db.patch(org._id, {
        plan: rollbackPlan as "free" | "starter" | "pro" | "enterprise",
        monthlyRequestLimit: defaults.monthlyRequestLimit,
        maxProjects: defaults.maxProjects,
        maxStorageBytes: defaults.maxStorageBytes,
        maxTeamMembers: defaults.maxTeamMembers,
        maxScheduledTasks: defaults.maxScheduledTasks,
        promoCodeId: undefined,
        promoExpiresAt: undefined,
        isPromoUpgrade: undefined,
        previousPlan: undefined,
      });
    }
  },
});
