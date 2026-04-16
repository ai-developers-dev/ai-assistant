import { internalMutation, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Multi-model pipeline: use cost-effective models per task type
// Email composition needs quality (Sonnet), classification/scraping can use Haiku
const MODELS = {
  emailOutreach: "anthropic/claude-sonnet-4-20250514",  // Quality email writing
  followUp: "anthropic/claude-sonnet-4-20250514",       // Conversational reply quality
  classification: "anthropic/claude-haiku-4-20250514",  // Fast, cheap classification
} as const;

/**
 * Internal query: get all organization IDs that have businesses with pending outreach.
 * Scans the small organizations table and checks each for due businesses.
 */
export const getActiveOrgIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    const now = Date.now();
    const activeOrgIds: string[] = [];

    for (const org of orgs) {
      // Quick check: does this org have any business with outreachNextStepAt <= now?
      const due = await ctx.db
        .query("businesses")
        .withIndex("by_organizationId_outreachNextStepAt", (q) =>
          q.eq("organizationId", org._id).lte("outreachNextStepAt", now)
        )
        .first();
      if (due) activeOrgIds.push(org._id);
    }

    return activeOrgIds;
  },
});

/**
 * Runs every 1 hour. Finds orgs with due businesses and dispatches
 * batched outreach actions per org with staggered delays.
 */
export const processOutreachSequences = internalAction({
  args: {},
  // Explicit return type breaks a type-inference cycle introduced when
  // businesses.ts started importing ./lib/auth (which imports generated types).
  handler: async (ctx): Promise<{ processed: number; orgs: number }> => {
    // Step 1: Get orgs that have due businesses
    const activeOrgIds = await ctx.runQuery(internal.outreachCron.getActiveOrgIds);

    if (activeOrgIds.length === 0) return { processed: 0, orgs: 0 };

    let totalDispatched = 0;

    for (const orgId of activeOrgIds) {
      // Step 2: Get due businesses for this org (indexed query, up to 50)
      const dueBusinesses = await ctx.runQuery(
        internal.businesses.getDueBusinessesForOrg,
        { organizationId: orgId as any, limit: 50 }
      );

      if (dueBusinesses.length === 0) continue;

      // Step 3: Check if now is an optimal send time for this org
      const timing = await ctx.runQuery(
        internal.outreachCron.isOptimalSendTime,
        { organizationId: orgId as any }
      );

      if (!timing.optimal) continue; // Defer to next cron cycle

      // Step 4: Dispatch in batches of 10, staggered by 30s
      const businessIds = dueBusinesses.map((b: any) => b._id as string);
      const BATCH_SIZE = 10;

      for (let i = 0; i < businessIds.length; i += BATCH_SIZE) {
        const batch = businessIds.slice(i, i + BATCH_SIZE);
        const delayMs = (i / BATCH_SIZE) * 30_000; // 0s, 30s, 60s, etc.

        await ctx.scheduler.runAfter(delayMs, internal.outreachCron.executeOutreachForOrg, {
          organizationId: orgId,
          businessIds: batch,
        });
        totalDispatched += batch.length;
      }

      // Step 5: Also dispatch follow-ups for hot/warm replies
      const hotLeads = await ctx.runQuery(
        internal.businesses.getHotLeadsNeedingFollowUp,
        { organizationId: orgId as any, limit: 5 }
      );

      if (hotLeads.length > 0) {
        const hotIds = hotLeads.map((b: any) => b._id as string);
        await ctx.scheduler.runAfter(0, internal.outreachCron.executeFollowUpForOrg, {
          organizationId: orgId,
          businessIds: hotIds,
        });
      }
    }

    return { processed: totalDispatched, orgs: activeOrgIds.length };
  },
});

/**
 * Internal query: check if now is an optimal send time for the org.
 * Falls back to business hours (Mon-Fri, 13-19 UTC) if no data.
 */
export const isOptimalSendTime = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat
    const hourUTC = now.getUTCHours();

    // Check org-specific timing data
    const slots = await ctx.db
      .query("sendTimingAnalytics")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    const totalSends = slots.reduce((sum, s) => sum + s.sentCount, 0);

    // With enough data, use data-driven windows
    if (totalSends >= 50) {
      const currentSlot = slots.find(
        (s) => s.hourUTC === hourUTC && s.dayOfWeek === dayOfWeek
      );
      if (!currentSlot) {
        // No data for this slot — fall back to business-hours heuristic
        // to avoid catch-22 where the slot never gets data because we block it
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        const isBusinessHours = hourUTC >= 13 && hourUTC <= 19;
        return {
          optimal: isWeekday && isBusinessHours,
          reason: isWeekday && isBusinessHours
            ? "No data for slot — allowing during business hours to collect data"
            : "No data for slot — outside business hours fallback",
        };
      }

      const scores = slots.map((s) => (s.replyCount ?? 0) * 10 + (s.openCount ?? 0) * 2);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const slotScore = (currentSlot.replyCount ?? 0) * 10 + (currentSlot.openCount ?? 0) * 2;

      return {
        optimal: slotScore >= avgScore * 0.5,
        reason: slotScore >= avgScore * 0.5 ? "Data-driven optimal window" : "Below average performance window",
      };
    }

    // Default: weekday business hours (13-19 UTC = 7am-1pm CT)
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isBusinessHours = hourUTC >= 13 && hourUTC <= 19;

    return {
      optimal: isWeekday && isBusinessHours,
      reason: isWeekday && isBusinessHours
        ? "Default business hours window"
        : "Outside default business hours (Mon-Fri 13-19 UTC)",
    };
  },
});

/**
 * Calls the chat API for a specific org to advance outreach for due businesses.
 * On failure, marks businesses as failed with retry backoff.
 */
export const executeOutreachForOrg = internalAction({
  args: {
    organizationId: v.string(),
    businessIds: v.array(v.string()),
  },
  handler: async (ctx, { organizationId, businessIds }) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
    if (!appUrl) {
      throw new Error("[outreachCron] FATAL: APP_URL/NEXT_PUBLIC_APP_URL not set. Outreach pipeline halted.");
    }

    const businessList = businessIds.join(", ");
    const prompt = `Run the next outreach sequence step for these business IDs: ${businessList}.

For each business:
1. Check what step they are on (outreachSequenceStep) and what contact channels they have
2. Send the appropriate message for that step
3. After sending, record the step completion so the next step is scheduled

Use the send_direct_email, send_meta_message, or send_linkedin_connection tools as appropriate for each business's available channels and current step number.`;

    try {
      const response = await fetch(`${appUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-convex-internal": "true",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          agentType: "lead_gen",
          modelId: MODELS.emailOutreach,
          organizationId,
          isInternalCron: true,
        }),
      });

      if (!response.ok) {
        console.error(`[outreachCron] Chat API error: ${response.status}`);
        // Mark businesses as failed with retry backoff
        await ctx.runMutation(internal.businesses.markOutreachFailed, {
          businessIds: businessIds as any,
        });
      } else {
        // On success, reset retry counts for these businesses
        await ctx.runMutation(internal.outreachCron.resetRetryCount, {
          businessIds: businessIds as any,
        });
      }
    } catch (err: any) {
      console.error("[outreachCron] Failed to call chat API:", err.message);
      await ctx.runMutation(internal.businesses.markOutreachFailed, {
        businessIds: businessIds as any,
      });
    }
  },
});

/**
 * Calls the chat API for automated follow-up on hot/warm reply leads.
 */
export const executeFollowUpForOrg = internalAction({
  args: {
    organizationId: v.string(),
    businessIds: v.array(v.string()),
  },
  handler: async (ctx, { organizationId, businessIds }) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
    if (!appUrl) {
      throw new Error("[outreachCron] FATAL: APP_URL/NEXT_PUBLIC_APP_URL not set.");
    }

    // Fetch org's booking link if configured
    let bookingLink = "";
    try {
      const org = await ctx.runQuery(internal.outreachCron.getOrgCampaignConfig, {
        organizationId: organizationId as any,
      });
      bookingLink = org?.bookingLink ?? "";
    } catch { /* non-fatal */ }

    const businessList = businessIds.join(", ");
    const bookingInstruction = bookingLink
      ? `6. For hot leads, include this booking link in your reply so they can schedule a call directly: ${bookingLink}`
      : `6. For hot leads, propose 2-3 specific time options for a call this week.`;

    const prompt = `These leads have replied positively (hot or warm). Send a follow-up for each business ID: ${businessList}.

For each business:
1. Check their replyClassification (hot or warm)
2. For "hot" leads: Send a brief, enthusiastic reply acknowledging their interest
3. For "warm" leads: Send a nurturing reply that addresses their specific concern with a soft CTA
4. Use send_direct_email with a conversational, non-salesy tone — this is a reply, not a cold email
5. After sending, update the business lastFollowUpAt timestamp
${bookingInstruction}`;

    try {
      const response = await fetch(`${appUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-convex-internal": "true",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          agentType: "lead_gen",
          modelId: MODELS.followUp,
          organizationId,
          isInternalCron: true,
        }),
      });

      if (!response.ok) {
        console.error(`[outreachCron] Follow-up API error: ${response.status}`);
      }
    } catch (err: any) {
      console.error("[outreachCron] Follow-up failed:", err.message);
    }
  },
});

/**
 * Reset retry count on successful outreach dispatch.
 */
export const resetRetryCount = internalMutation({
  args: {
    businessIds: v.array(v.id("businesses")),
  },
  handler: async (ctx, { businessIds }) => {
    for (const id of businessIds) {
      const b = await ctx.db.get(id);
      if (b && b.outreachRetryCount) {
        await ctx.db.patch(id, {
          outreachRetryCount: 0,
          outreachLastFailedAt: undefined,
          updatedAt: Date.now(),
        });
      }
    }
  },
});

/**
 * Weekly cron: reactivate stale leads that never replied.
 * Re-enrolls them at step 4 (final email) for a fresh angle.
 */
export const reactivateStaleLeads = internalAction({
  args: {},
  handler: async (ctx) => {
    const activeOrgIds = await ctx.runQuery(internal.outreachCron.getActiveOrgIds);

    // Also get all orgs (stale leads may be in orgs with no active outreach)
    const allOrgs = await ctx.runQuery(internal.outreachCron.getAllOrgIds);
    const orgIds = [...new Set([...activeOrgIds, ...allOrgs])];

    let totalReactivated = 0;

    for (const orgId of orgIds) {
      const staleLeads = await ctx.runQuery(
        internal.businesses.getStaleLeads,
        { organizationId: orgId as any, limit: 20 }
      );

      for (const lead of staleLeads) {
        await ctx.runMutation(internal.businesses.reactivateLead, {
          id: lead._id as any,
        });
        totalReactivated++;
      }
    }

    return { reactivated: totalReactivated };
  },
});

/**
 * Get all org IDs (for stale lead reactivation which needs all orgs, not just active ones).
 */
export const getAllOrgIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    return orgs.map((o) => o._id as string);
  },
});

/**
 * Get org's onboarding config (for booking link injection into follow-ups).
 * Returns the onboardingConfig object which includes `bookingLink`.
 */
export const getOrgCampaignConfig = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const org = await ctx.db.get(organizationId);
    return org?.onboardingConfig ?? null;
  },
});
