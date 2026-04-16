import { v } from "convex/values";
import { mutation, query, internalAction, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

type WarmupStage = "week1" | "week2" | "week3" | "week4" | "warmed" | "paused";

const WARMUP_STAGES = {
  week1: { dailyLimit: 5, durationDays: 7 },
  week2: { dailyLimit: 15, durationDays: 7 },
  week3: { dailyLimit: 25, durationDays: 7 },
  week4: { dailyLimit: 50, durationDays: 7 },
  warmed: { dailyLimit: 999, durationDays: Infinity },
} satisfies Record<Exclude<WarmupStage, "paused">, { dailyLimit: number; durationDays: number }>;

// ── Start warmup for an email account ────────────────────────────────

export const startWarmup = mutation({
  args: {
    organizationId: v.id("organizations"),
    accountEmail: v.string(),
  },
  handler: async (ctx, { organizationId, accountEmail }) => {
    // Check if already exists
    const existing = await ctx.db
      .query("emailWarmup")
      .withIndex("by_accountEmail", (q) => q.eq("accountEmail", accountEmail))
      .first();

    if (existing) {
      // Reset to week1
      await ctx.db.patch(existing._id, {
        stage: "week1",
        startedAt: Date.now(),
        dailyLimit: 5,
        sentToday: 0,
      });
      return { id: existing._id, restarted: true };
    }

    const id = await ctx.db.insert("emailWarmup", {
      organizationId,
      accountEmail,
      stage: "week1",
      startedAt: Date.now(),
      dailyLimit: 5,
      sentToday: 0,
    });
    return { id, restarted: false };
  },
});

// ── Skip warmup (mark as warmed) ─────────────────────────────────────

export const skipWarmup = mutation({
  args: { accountEmail: v.string() },
  handler: async (ctx, { accountEmail }) => {
    const record = await ctx.db
      .query("emailWarmup")
      .withIndex("by_accountEmail", (q) => q.eq("accountEmail", accountEmail))
      .first();
    if (record) {
      await ctx.db.patch(record._id, { stage: "warmed", dailyLimit: 999 });
    }
  },
});

// ── Get warmup status for an org ─────────────────────────────────────

export const getStatus = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("emailWarmup")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
  },
});

// ── Get effective daily limit (warmup-aware) ─────────────────────────

export const getEffectiveLimit = query({
  args: { accountEmail: v.string() },
  handler: async (ctx, { accountEmail }) => {
    const record = await ctx.db
      .query("emailWarmup")
      .withIndex("by_accountEmail", (q) => q.eq("accountEmail", accountEmail))
      .first();

    if (!record) return { limit: 50, stage: "no_warmup", isWarming: false }; // Default if no warmup configured

    return {
      limit: record.dailyLimit,
      stage: record.stage,
      isWarming: record.stage !== "warmed" && record.stage !== "paused",
      sentToday: record.sentToday,
      remaining: Math.max(0, record.dailyLimit - record.sentToday),
    };
  },
});

// ── Internal: advance warmup stages (called by cron) ─────────────────

export const getWarmupAccounts = internalQuery({
  handler: async (ctx) => {
    return await ctx.db.query("emailWarmup").collect();
  },
});

export const advanceStages = internalAction({
  handler: async (ctx) => {
    const accounts = await ctx.runQuery(internal.emailWarmup.getWarmupAccounts);
    const now = Date.now();

    for (const account of accounts) {
      if (account.stage === "warmed" || account.stage === "paused") continue;

      const daysSinceStart = Math.floor((now - account.startedAt) / (24 * 60 * 60 * 1000));
      let newStage: WarmupStage = account.stage;
      let newLimit = account.dailyLimit;

      if (daysSinceStart >= 28) {
        newStage = "warmed";
        newLimit = 999;
      } else if (daysSinceStart >= 21) {
        newStage = "week4";
        newLimit = WARMUP_STAGES.week4.dailyLimit;
      } else if (daysSinceStart >= 14) {
        newStage = "week3";
        newLimit = WARMUP_STAGES.week3.dailyLimit;
      } else if (daysSinceStart >= 7) {
        newStage = "week2";
        newLimit = WARMUP_STAGES.week2.dailyLimit;
      }

      if (newStage !== account.stage) {
        await ctx.runMutation(internal.emailWarmup.updateStage, {
          id: account._id,
          stage: newStage,
          dailyLimit: newLimit,
        });
      }

      // Reset sentToday if date changed
      const today = new Date().toISOString().split("T")[0];
      if (account.lastResetDate !== today) {
        await ctx.runMutation(internal.emailWarmup.resetDaily, {
          id: account._id,
          date: today,
        });
      }
    }
  },
});

export const updateStage = internalMutation({
  args: {
    id: v.id("emailWarmup"),
    stage: v.union(v.literal("week1"), v.literal("week2"), v.literal("week3"), v.literal("week4"), v.literal("warmed"), v.literal("paused")),
    dailyLimit: v.number(),
  },
  handler: async (ctx, { id, stage, dailyLimit }) => {
    await ctx.db.patch(id, { stage, dailyLimit });
  },
});

export const resetDaily = internalMutation({
  args: { id: v.id("emailWarmup"), date: v.string() },
  handler: async (ctx, { id, date }) => {
    await ctx.db.patch(id, { sentToday: 0, lastResetDate: date });
  },
});

export const incrementSent = mutation({
  args: { accountEmail: v.string() },
  handler: async (ctx, { accountEmail }) => {
    const record = await ctx.db
      .query("emailWarmup")
      .withIndex("by_accountEmail", (q) => q.eq("accountEmail", accountEmail))
      .first();
    if (record) {
      await ctx.db.patch(record._id, {
        sentToday: record.sentToday + 1,
        lastSentAt: Date.now(),
      });
    }
  },
});
