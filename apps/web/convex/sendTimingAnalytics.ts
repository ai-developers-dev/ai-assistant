import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ── Record a send event ──────────────────────────────────────────────

export const recordSend = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const now = new Date();
    const hourUTC = now.getUTCHours();
    const dayOfWeek = now.getUTCDay();

    const existing = await ctx.db
      .query("sendTimingAnalytics")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    const slot = existing.find((s) => s.hourUTC === hourUTC && s.dayOfWeek === dayOfWeek);

    if (slot) {
      await ctx.db.patch(slot._id, { sentCount: slot.sentCount + 1 });
    } else {
      await ctx.db.insert("sendTimingAnalytics", {
        organizationId,
        hourUTC,
        dayOfWeek,
        sentCount: 1,
        openCount: 0,
        replyCount: 0,
      });
    }
  },
});

// ── Record an open event ─────────────────────────────────────────────

export const recordOpen = mutation({
  args: { organizationId: v.id("organizations"), sentHourUTC: v.number(), sentDayOfWeek: v.number() },
  handler: async (ctx, { organizationId, sentHourUTC, sentDayOfWeek }) => {
    const existing = await ctx.db
      .query("sendTimingAnalytics")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    const slot = existing.find((s) => s.hourUTC === sentHourUTC && s.dayOfWeek === sentDayOfWeek);
    if (slot) {
      await ctx.db.patch(slot._id, { openCount: slot.openCount + 1 });
    }
  },
});

// ── Record a reply event ─────────────────────────────────────────────

export const recordReply = mutation({
  args: { organizationId: v.id("organizations"), sentHourUTC: v.number(), sentDayOfWeek: v.number() },
  handler: async (ctx, { organizationId, sentHourUTC, sentDayOfWeek }) => {
    const existing = await ctx.db
      .query("sendTimingAnalytics")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    const slot = existing.find((s) => s.hourUTC === sentHourUTC && s.dayOfWeek === sentDayOfWeek);
    if (slot) {
      await ctx.db.patch(slot._id, { replyCount: slot.replyCount + 1 });
    }
  },
});

// ── Get optimal send windows ─────────────────────────────────────────

export const getOptimalWindows = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const slots = await ctx.db
      .query("sendTimingAnalytics")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    const totalSent = slots.reduce((sum, s) => sum + s.sentCount, 0);

    // Default windows if not enough data
    if (totalSent < 50) {
      return {
        hasEnoughData: false,
        totalSent,
        optimalWindows: [
          { dayOfWeek: 2, hourUTC: 15, label: "Tuesday 9am CT" },
          { dayOfWeek: 3, hourUTC: 15, label: "Wednesday 9am CT" },
          { dayOfWeek: 4, hourUTC: 15, label: "Thursday 9am CT" },
        ],
        message: `Need ${50 - totalSent} more sends before data-driven optimization kicks in`,
      };
    }

    // Calculate reply rate per slot
    const ranked = slots
      .filter((s) => s.sentCount >= 3) // Need at least 3 sends to be meaningful
      .map((s) => ({
        dayOfWeek: s.dayOfWeek,
        hourUTC: s.hourUTC,
        sentCount: s.sentCount,
        openRate: s.sentCount > 0 ? Math.round((s.openCount / s.sentCount) * 100) : 0,
        replyRate: s.sentCount > 0 ? Math.round((s.replyCount / s.sentCount) * 1000) / 10 : 0,
        score: (s.replyCount * 10) + (s.openCount * 2), // Weight replies 5x more than opens
      }))
      .sort((a, b) => b.score - a.score);

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const top3 = ranked.slice(0, 3).map((s) => ({
      dayOfWeek: s.dayOfWeek,
      hourUTC: s.hourUTC,
      label: `${dayNames[s.dayOfWeek]} ${s.hourUTC}:00 UTC (${s.openRate}% open, ${s.replyRate}% reply)`,
      openRate: s.openRate,
      replyRate: s.replyRate,
    }));

    return {
      hasEnoughData: true,
      totalSent,
      optimalWindows: top3,
      allSlots: ranked.slice(0, 10),
    };
  },
});

// ── Check if now is a good time to send ──────────────────────────────

export const isOptimalTime = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const now = new Date();
    const hourUTC = now.getUTCHours();
    const dayOfWeek = now.getUTCDay();

    const slots = await ctx.db
      .query("sendTimingAnalytics")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    const totalSent = slots.reduce((sum, s) => sum + s.sentCount, 0);

    // If not enough data, use defaults (Tue-Thu, 14-17 UTC = 8-11am CT)
    if (totalSent < 50) {
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
      const isBusinessHours = hourUTC >= 13 && hourUTC <= 19; // 7am-1pm CT
      return { optimal: isWeekday && isBusinessHours, reason: "default_schedule" };
    }

    // Check if current slot is in top 50% of performing slots
    const currentSlot = slots.find((s) => s.hourUTC === hourUTC && s.dayOfWeek === dayOfWeek);
    if (!currentSlot) return { optimal: false, reason: "no_data_for_current_slot" };

    const avgScore = slots.reduce((sum, s) => sum + (s.replyCount * 10 + s.openCount * 2), 0) / slots.length;
    const currentScore = currentSlot.replyCount * 10 + currentSlot.openCount * 2;

    return {
      optimal: currentScore >= avgScore * 0.5, // Within 50% of average
      reason: currentScore >= avgScore ? "above_average" : "below_average_but_acceptable",
    };
  },
});
