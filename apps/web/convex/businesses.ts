import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authorizeOrgMember, authorizeOrgAdmin, authorizeOrgMemberLenient } from "./lib/auth";

// ── List businesses ──────────────────────────────────────────────────

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(v.union(
      v.literal("new"),
      v.literal("enriching"),
      v.literal("ready"),
      v.literal("all_sent")
    )),
    cityId: v.optional(v.id("cityCampaigns")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, status, cityId, limit }) => {
    await authorizeOrgMember(ctx, organizationId);
    // Use the most specific index available
    let results;
    if (status) {
      results = await ctx.db
        .query("businesses")
        .withIndex("by_organizationId_status", (q) =>
          q.eq("organizationId", organizationId).eq("status", status)
        )
        .collect();
    } else if (cityId) {
      results = await ctx.db
        .query("businesses")
        .withIndex("by_cityId", (q) => q.eq("cityId", cityId))
        .collect();
      // Filter to org since cityId index isn't org-scoped
      results = results.filter((b) => b.organizationId === organizationId);
    } else {
      results = await ctx.db
        .query("businesses")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .collect();
    }

    // Apply remaining filters
    if (cityId && status) results = results.filter((b) => b.cityId === cityId);

    return limit ? results.slice(0, limit) : results;
  },
});

// ── Get by ID ────────────────────────────────────────────────────────

export const getById = query({
  args: { id: v.id("businesses") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

// ── Delete all businesses for an org (campaign reset) ────────────────

export const deleteAllByOrganization = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    // Destructive operation — admins only.
    await authorizeOrgAdmin(ctx, organizationId);
    // Delete businesses
    const all = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const biz of all) {
      await ctx.db.delete(biz._id);
    }

    // Also clear leadGenPosts
    let postsDeleted = 0;
    const posts = await ctx.db
      .query("leadGenPosts")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const post of posts) {
      await ctx.db.delete(post._id);
      postsDeleted++;
    }

    // Also clear agentCommunications
    let commsDeleted = 0;
    const comms = await ctx.db
      .query("agentCommunications")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const comm of comms) {
      await ctx.db.delete(comm._id);
      commsDeleted++;
    }

    // Also clear agentDecisionLog
    let decisionsDeleted = 0;
    const decisions = await ctx.db
      .query("agentDecisionLog")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const d of decisions) {
      await ctx.db.delete(d._id);
      decisionsDeleted++;
    }

    return { deleted: all.length, postsDeleted, commsDeleted, decisionsDeleted };
  },
});

// ── Create from server (with dedup by googlePlaceId) ────────────────

export const createFromServer = mutation({
  args: {
    organizationId: v.id("organizations"),
    googlePlaceId: v.string(),
    name: v.string(),
    address: v.object({
      street: v.optional(v.string()),
      city: v.string(),
      state: v.string(),
      zip: v.optional(v.string()),
      formatted: v.string(),
    }),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    categories: v.array(v.string()),
    rating: v.optional(v.number()),
    reviewCount: v.optional(v.number()),
    reviews: v.optional(v.array(v.object({
      reviewerName: v.string(),
      text: v.string(),
      rating: v.number(),
      relativeTime: v.string(),
    }))),
    ownerName: v.optional(v.string()),
    ownerTitle: v.optional(v.string()),
    vertical: v.optional(v.string()),
    cityId: v.optional(v.any()), // Accept any value — AI sometimes passes invalid IDs
    campaignDailyLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Validate cityId — if it's not a real cityCampaigns ID, strip it
    let validCityId: any = undefined;
    if (args.cityId && typeof args.cityId === "string") {
      try {
        const city = await ctx.db.get(args.cityId as any);
        if (city) validCityId = args.cityId;
      } catch { /* invalid ID format — ignore */ }
    }

    // HARD CAP: If a daily limit is set, refuse inserts beyond it
    if (args.campaignDailyLimit && args.campaignDailyLimit > 0) {
      const count = (await ctx.db
        .query("businesses")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .collect()).length;
      if (count >= args.campaignDailyLimit) {
        return { id: null, created: false, reason: "HARD_LIMIT_REACHED" };
      }
    }

    // Dedup: check googlePlaceId first, then phone, then name+address
    const existingByPlaceId = await ctx.db
      .query("businesses")
      .withIndex("by_googlePlaceId", (q) => q.eq("googlePlaceId", args.googlePlaceId))
      .first();

    if (existingByPlaceId && existingByPlaceId.organizationId === args.organizationId) {
      return { id: existingByPlaceId._id, created: false };
    }

    // Phone-based dedup (catches same business scraped from different sources)
    if (args.phone) {
      const orgBusinesses = await ctx.db
        .query("businesses")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .collect();
      const phoneNorm = args.phone.replace(/\D/g, "");
      const matchByPhone = orgBusinesses.find(
        (b) => b.phone && b.phone.replace(/\D/g, "") === phoneNorm
      );
      if (matchByPhone) {
        return { id: matchByPhone._id, created: false };
      }
    }

    // Name + city + state dedup (last resort for businesses without placeId/phone)
    if (args.name && args.address?.city && args.address?.state) {
      const orgBusinesses = await ctx.db
        .query("businesses")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .collect();
      const nameLower = args.name.toLowerCase().trim();
      const cityLower = args.address.city.toLowerCase().trim();
      const stateLower = args.address.state.toLowerCase().trim();
      const matchByNameAddr = orgBusinesses.find(
        (b) =>
          b.name.toLowerCase().trim() === nameLower &&
          b.address.city.toLowerCase().trim() === cityLower &&
          b.address.state.toLowerCase().trim() === stateLower
      );
      if (matchByNameAddr) {
        return { id: matchByNameAddr._id, created: false };
      }
    }

    const now = Date.now();
    const { campaignDailyLimit: _limit, cityId: _rawCityId, ...insertArgs } = args;
    const id = await ctx.db.insert("businesses", {
      ...insertArgs,
      ...(validCityId ? { cityId: validCityId } : {}),
      status: "new",
      createdAt: now,
      updatedAt: now,
    });

    return { id, created: true };
  },
});

// ── Update reviews from enrichment ─────────────────────────────────

export const updateReviews = mutation({
  args: {
    id: v.id("businesses"),
    reviews: v.array(v.object({
      reviewerName: v.string(),
      text: v.string(),
      rating: v.number(),
      relativeTime: v.string(),
    })),
  },
  handler: async (ctx, { id, reviews }) => {
    const biz = await ctx.db.get(id);
    if (!biz) return;
    await ctx.db.patch(id, { reviews, updatedAt: Date.now() });
  },
});

// ── Update enrichment data (owner + social profiles) ────────────────

export const updateEnrichment = mutation({
  args: {
    id: v.id("businesses"),
    ownerName: v.optional(v.string()),
    ownerTitle: v.optional(v.string()),
    metaPageUrl: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    linkedinOwnerUrl: v.optional(v.string()),
    email: v.optional(v.string()),
    enrichmentLog: v.optional(v.string()),
    facebookData: v.optional(v.object({
      about: v.optional(v.string()),
      recentPosts: v.optional(v.array(v.object({
        text: v.string(),
        date: v.optional(v.string()),
      }))),
    })),
    linkedinData: v.optional(v.object({
      headline: v.optional(v.string()),
      about: v.optional(v.string()),
      recentPosts: v.optional(v.array(v.object({
        text: v.string(),
        date: v.optional(v.string()),
      }))),
    })),
    contactFormUrl: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const fields: Record<string, any> = { updatedAt: Date.now() };
    if (updates.ownerName !== undefined) fields.ownerName = updates.ownerName;
    if (updates.ownerTitle !== undefined) fields.ownerTitle = updates.ownerTitle;
    if (updates.metaPageUrl !== undefined) fields.metaPageUrl = updates.metaPageUrl;
    if (updates.linkedinUrl !== undefined) fields.linkedinUrl = updates.linkedinUrl;
    if (updates.linkedinOwnerUrl !== undefined) fields.linkedinOwnerUrl = updates.linkedinOwnerUrl;
    if (updates.email !== undefined) fields.email = updates.email;
    if (updates.enrichmentLog !== undefined) fields.enrichmentLog = updates.enrichmentLog;
    if (updates.facebookData !== undefined) fields.facebookData = updates.facebookData;
    if (updates.linkedinData !== undefined) fields.linkedinData = updates.linkedinData;
    if (updates.contactFormUrl !== undefined) fields.contactFormUrl = updates.contactFormUrl;

    // Move to "ready" once enriched
    const current = await ctx.db.get(id);
    if (current?.status === "new" || current?.status === "enriching") {
      fields.status = "ready";
    }

    await ctx.db.patch(id, fields);
    return { success: true };
  },
});

// ── Record sent email on a business ─────────────────────────────────
export const recordSentEmail = mutation({
  args: {
    id: v.id("businesses"),
    subject: v.string(),
    body: v.string(),
    provider: v.string(),
    messageId: v.optional(v.string()),
  },
  handler: async (ctx, { id, subject, body, provider, messageId }) => {
    const biz = await ctx.db.get(id);
    if (!biz) return;
    const existing = biz.sentEmails || [];
    existing.push({ subject, body, sentAt: Date.now(), provider, messageId });
    await ctx.db.patch(id, { sentEmails: existing, updatedAt: Date.now() });
  },
});

// ── A/B Subject Line Testing ────────────────────────────────────────

export const recordSubjectLineVariant = mutation({
  args: {
    id: v.id("businesses"),
    variant: v.string(),
  },
  handler: async (ctx, { id, variant }) => {
    const biz = await ctx.db.get(id);
    if (!biz) return;

    const tests = biz.subjectLineTests ?? [];
    const existing = tests.find((t: any) => t.variant === variant);
    if (existing) {
      existing.sentCount += 1;
    } else {
      tests.push({ variant, sentCount: 1, openCount: 0, replyCount: 0 });
    }
    await ctx.db.patch(id, { subjectLineTests: tests, updatedAt: Date.now() });
  },
});

export const incrementSubjectLineOpen = mutation({
  args: {
    id: v.id("businesses"),
    variant: v.string(),
  },
  handler: async (ctx, { id, variant }) => {
    const biz = await ctx.db.get(id);
    if (!biz) return;

    const tests = biz.subjectLineTests ?? [];
    const existing = tests.find((t: any) => t.variant === variant);
    if (existing) {
      existing.openCount += 1;
      await ctx.db.patch(id, { subjectLineTests: tests, updatedAt: Date.now() });
    }
  },
});

export const getSubjectLineStats = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await authorizeOrgMember(ctx, organizationId);
    const all = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    // Aggregate across all businesses
    const stats: Record<string, { sent: number; opened: number; replied: number; openRate: number }> = {};
    for (const b of all) {
      if (!b.subjectLineTests) continue;
      for (const t of b.subjectLineTests as any[]) {
        if (!stats[t.variant]) stats[t.variant] = { sent: 0, opened: 0, replied: 0, openRate: 0 };
        stats[t.variant].sent += t.sentCount;
        stats[t.variant].opened += t.openCount;
        stats[t.variant].replied += t.replyCount;
      }
    }

    // Calculate rates
    for (const variant of Object.keys(stats)) {
      stats[variant].openRate = stats[variant].sent > 0
        ? stats[variant].opened / stats[variant].sent
        : 0;
    }

    return stats;
  },
});

// ── Update website quality assessment ────────────────────────────────
export const updateWebsiteQuality = mutation({
  args: {
    id: v.id("businesses"),
    websiteQuality: v.object({
      score: v.number(),
      mobile: v.boolean(),
      ssl: v.boolean(),
      platform: v.optional(v.string()),
      speed: v.optional(v.string()),
      hasContactForm: v.boolean(),
      lastUpdated: v.optional(v.string()),
      needsUpgrade: v.union(v.literal("critical"), v.literal("recommended"), v.literal("good")),
    }),
  },
  handler: async (ctx, { id, websiteQuality }) => {
    await ctx.db.patch(id, { websiteQuality, updatedAt: Date.now() });
  },
});

// ── Update review insights ──────────────────────────────────────────
export const updateReviewInsights = mutation({
  args: {
    id: v.id("businesses"),
    reviewInsights: v.object({
      strengths: v.array(v.string()),
      weaknesses: v.array(v.string()),
      customerType: v.optional(v.string()),
      sentimentScore: v.number(),
      bestQuote: v.optional(v.string()),
      bestQuoteAuthor: v.optional(v.string()),
      painPoints: v.optional(v.array(v.object({
        theme: v.string(),
        evidence: v.string(),
        solution: v.string(),
        emailHook: v.string(),
      }))),
    }),
  },
  handler: async (ctx, { id, reviewInsights }) => {
    await ctx.db.patch(id, { reviewInsights, updatedAt: Date.now() });
  },
});

// ── Update pipeline stage ───────────────────────────────────────────
export const updatePipelineStage = mutation({
  args: {
    id: v.id("businesses"),
    pipelineStage: v.union(
      v.literal("scraped"), v.literal("enriched"), v.literal("contacted"),
      v.literal("opened"), v.literal("replied"), v.literal("qualified"),
      v.literal("proposal"), v.literal("won"), v.literal("lost"),
    ),
  },
  handler: async (ctx, { id, pipelineStage }) => {
    await ctx.db.patch(id, { pipelineStage, updatedAt: Date.now() });
  },
});

// ── Update reply classification ─────────────────────────────────────
export const updateReplyClassification = mutation({
  args: {
    id: v.id("businesses"),
    replyClassification: v.union(
      v.literal("hot"), v.literal("warm"), v.literal("objection"),
      v.literal("cold"), v.literal("auto_reply"),
    ),
  },
  handler: async (ctx, { id, replyClassification }) => {
    await ctx.db.patch(id, { replyClassification, pipelineStage: "replied", updatedAt: Date.now() });
  },
});

// ── Update outreach status ───────────────────────────────────────────

export const updateOutreachStatus = mutation({
  args: {
    id: v.id("businesses"),
    channel: v.union(v.literal("email"), v.literal("meta"), v.literal("linkedin")),
    sentAt: v.number(),
  },
  handler: async (ctx, { id, channel, sentAt }) => {
    const business = await ctx.db.get(id);
    if (!business) return { success: false };

    const current = business.outreachStatus ?? {};
    const updated = { ...current };

    if (channel === "email") updated.emailSentAt = sentAt;
    if (channel === "meta") updated.metaSentAt = sentAt;
    if (channel === "linkedin") updated.linkedinSentAt = sentAt;

    // Mark all_sent based on which channels this business actually has data for.
    // A business with no Facebook page should never be blocked by a missing metaSentAt.
    const needsEmail = !!business.email;
    const needsMeta = !!business.metaPageUrl;
    const needsLinkedin = !!business.linkedinOwnerUrl;

    const emailDone = !needsEmail || !!updated.emailSentAt;
    const metaDone = !needsMeta || !!updated.metaSentAt;
    const linkedinDone = !needsLinkedin || !!updated.linkedinSentAt;

    // Only mark all_sent if at least one channel has been sent
    const anySent = !!(updated.emailSentAt || updated.metaSentAt || updated.linkedinSentAt);
    const allSent = anySent && emailDone && metaDone && linkedinDone;

    await ctx.db.patch(id, {
      outreachStatus: updated,
      status: allSent ? "all_sent" : business.status,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// ── Get businesses ready for a specific outreach channel ────────────

export const getReadyForOutreach = query({
  args: {
    organizationId: v.id("organizations"),
    channel: v.union(v.literal("email"), v.literal("meta"), v.literal("linkedin")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, channel, limit = 10 }) => {
    await authorizeOrgMemberLenient(ctx, organizationId);
    // Use the composite index to fetch only "ready" businesses — avoids a full-table scan.
    const businesses = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId_status", (q) =>
        q.eq("organizationId", organizationId).eq("status", "ready")
      )
      .collect();

    const eligible = businesses.filter((b) => {
      // Respect opt-outs
      if (b.emailStatus === "unsubscribed" || b.emailStatus === "bounced") {
        if (channel === "email") return false;
      }
      const os = b.outreachStatus ?? {};
      if (channel === "email") return !os.emailSentAt && !!b.email;
      if (channel === "meta") return !os.metaSentAt && !!b.metaPageUrl;
      if (channel === "linkedin") return !os.linkedinSentAt && !!b.linkedinOwnerUrl;
      return false;
    });

    // Sort by lead score descending (highest quality leads first)
    eligible.sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0));

    return eligible.slice(0, limit);
  },
});

// ── Stats by date range ──────────────────────────────────────────────

export const getStatsByDateRange = query({
  args: {
    organizationId: v.id("organizations"), // validated via authorizeOrgMember below
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, { organizationId, startTime, endTime }) => {
    await authorizeOrgMember(ctx, organizationId);
    const all = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    const inRange = all.filter((b) => b.createdAt >= startTime && b.createdAt <= endTime);

    return {
      found: inRange.length,
      ownerFound: inRange.filter((b) => !!b.ownerName).length,
      withEmail: inRange.filter((b) => !!b.email).length,
      withMeta: inRange.filter((b) => !!b.metaPageUrl).length,
      withLinkedin: inRange.filter((b) => !!b.linkedinOwnerUrl).length,
      emailSent: all.filter((b) => {
        const t = b.outreachStatus?.emailSentAt;
        return t && t >= startTime && t <= endTime;
      }).length,
      metaSent: all.filter((b) => {
        const t = b.outreachStatus?.metaSentAt;
        return t && t >= startTime && t <= endTime;
      }).length,
      linkedinSent: all.filter((b) => {
        const t = b.outreachStatus?.linkedinSentAt;
        return t && t >= startTime && t <= endTime;
      }).length,
      emailReplied: all.filter((b) => {
        const t = b.outreachStatus?.emailRepliedAt;
        return t && t >= startTime && t <= endTime;
      }).length,
      metaReplied: all.filter((b) => {
        const t = b.outreachStatus?.metaRepliedAt;
        return t && t >= startTime && t <= endTime;
      }).length,
      linkedinReplied: all.filter((b) => {
        const t = b.outreachStatus?.linkedinRepliedAt;
        return t && t >= startTime && t <= endTime;
      }).length,
    };
  },
});

// ── Daily Pipeline Stats (real-time pipeline visibility) ─────────────

export const getDailyPipelineStats = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await authorizeOrgMember(ctx, organizationId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    const all = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    return {
      total: all.length,
      byStatus: {
        new: all.filter((b) => b.status === "new").length,
        enriching: all.filter((b) => b.status === "enriching").length,
        ready: all.filter((b) => b.status === "ready").length,
        allSent: all.filter((b) => b.status === "all_sent").length,
      },
      scrapedToday: all.filter((b) => b.createdAt >= todayStart).length,
      enrichedToday: all.filter((b) => b.status !== "new" && b.updatedAt >= todayStart).length,
      emailedToday: all.filter((b) => b.outreachStatus?.emailSentAt && b.outreachStatus.emailSentAt >= todayStart).length,
      metaSentToday: all.filter((b) => b.outreachStatus?.metaSentAt && b.outreachStatus.metaSentAt >= todayStart).length,
      linkedinSentToday: all.filter((b) => b.outreachStatus?.linkedinSentAt && b.outreachStatus.linkedinSentAt >= todayStart).length,
      queues: {
        awaitingEnrichment: all.filter((b) => b.status === "new").length,
        awaitingEmail: all.filter((b) => b.status === "ready" && b.email && !b.outreachStatus?.emailSentAt).length,
        awaitingMeta: all.filter((b) => b.status === "ready" && b.metaPageUrl && !b.outreachStatus?.metaSentAt).length,
        awaitingLinkedin: all.filter((b) => b.status === "ready" && b.linkedinOwnerUrl && !b.outreachStatus?.linkedinSentAt).length,
      },
    };
  },
});

// ── Stats ────────────────────────────────────────────────────────────

export const getStats = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await authorizeOrgMember(ctx, organizationId);
    const all = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    return {
      total: all.length,
      new: all.filter((b) => b.status === "new").length,
      ready: all.filter((b) => b.status === "ready").length,
      allSent: all.filter((b) => b.status === "all_sent").length,
      withEmail: all.filter((b) => !!b.email).length,
      withMeta: all.filter((b) => !!b.metaPageUrl).length,
      withLinkedin: all.filter((b) => !!b.linkedinOwnerUrl).length,
      emailSent: all.filter((b) => !!b.outreachStatus?.emailSentAt).length,
      metaSent: all.filter((b) => !!b.outreachStatus?.metaSentAt).length,
      linkedinSent: all.filter((b) => !!b.outreachStatus?.linkedinSentAt).length,
      emailReplied: all.filter((b) => !!b.outreachStatus?.emailRepliedAt).length,
      metaReplied: all.filter((b) => !!b.outreachStatus?.metaRepliedAt).length,
      linkedinReplied: all.filter((b) => !!b.outreachStatus?.linkedinRepliedAt).length,
    };
  },
});

// ── Mark outreach reply ──────────────────────────────────────────────

export const markOutreachReply = mutation({
  args: {
    id: v.id("businesses"),
    channel: v.union(v.literal("email"), v.literal("meta"), v.literal("linkedin")),
    repliedAt: v.number(),
    repliedBy: v.optional(v.string()),
  },
  handler: async (ctx, { id, channel, repliedAt, repliedBy }) => {
    const business = await ctx.db.get(id);
    if (!business) return { success: false };
    const current = business.outreachStatus ?? {};
    const updated = { ...current };
    if (channel === "email") { updated.emailRepliedAt = repliedAt; if (repliedBy) updated.emailRepliedBy = repliedBy; }
    if (channel === "meta") { updated.metaRepliedAt = repliedAt; if (repliedBy) updated.metaRepliedBy = repliedBy; }
    if (channel === "linkedin") { updated.linkedinRepliedAt = repliedAt; if (repliedBy) updated.linkedinRepliedBy = repliedBy; }
    await ctx.db.patch(id, { outreachStatus: updated, updatedAt: Date.now() });
    return { success: true };
  },
});

// ── Get responders ───────────────────────────────────────────────────

export const getResponders = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, limit = 50 }) => {
    await authorizeOrgMember(ctx, organizationId);
    const all = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    const responders = all.filter((b) =>
      b.outreachStatus?.emailRepliedAt ||
      b.outreachStatus?.metaRepliedAt ||
      b.outreachStatus?.linkedinRepliedAt
    );

    // Sort by most recent reply
    responders.sort((a, b) => {
      const aMax = Math.max(
        a.outreachStatus?.emailRepliedAt ?? 0,
        a.outreachStatus?.metaRepliedAt ?? 0,
        a.outreachStatus?.linkedinRepliedAt ?? 0
      );
      const bMax = Math.max(
        b.outreachStatus?.emailRepliedAt ?? 0,
        b.outreachStatus?.metaRepliedAt ?? 0,
        b.outreachStatus?.linkedinRepliedAt ?? 0
      );
      return bMax - aMax;
    });

    return responders.slice(0, limit);
  },
});

// ── Update email tracking status (Resend webhooks) ──────────────────

export const updateEmailStatus = mutation({
  args: {
    id: v.id("businesses"),
    emailStatus: v.optional(v.union(v.literal("active"), v.literal("bounced"), v.literal("unsubscribed"))),
    emailOpenedAt: v.optional(v.number()),
    incrementOpenCount: v.optional(v.boolean()),
    lastEmailMessageId: v.optional(v.string()),
  },
  handler: async (ctx, { id, emailStatus, emailOpenedAt, incrementOpenCount, lastEmailMessageId }) => {
    const business = await ctx.db.get(id);
    if (!business) return { success: false };

    const patch: Record<string, any> = { updatedAt: Date.now() };
    if (emailStatus !== undefined) patch.emailStatus = emailStatus;
    if (emailOpenedAt !== undefined) patch.emailOpenedAt = emailOpenedAt;
    if (lastEmailMessageId !== undefined) patch.lastEmailMessageId = lastEmailMessageId;
    if (incrementOpenCount) patch.emailOpenCount = (business.emailOpenCount ?? 0) + 1;

    await ctx.db.patch(id, patch);
    return { success: true };
  },
});

// ── Find by Resend message ID ────────────────────────────────────────

export const findByMessageId = query({
  args: {
    organizationId: v.id("organizations"),
    messageId: v.string(),
  },
  handler: async (ctx, { organizationId, messageId }) => {
    // Use the global index — messageId is unique, then verify org match
    const result = await ctx.db
      .query("businesses")
      .withIndex("by_lastEmailMessageId", (q) => q.eq("lastEmailMessageId", messageId))
      .first();
    if (result && result.organizationId === organizationId) return result;
    return null;
  },
});

// ── Compute and store lead score ─────────────────────────────────────

export const computeLeadScore = mutation({
  args: { id: v.id("businesses") },
  handler: async (ctx, { id }) => {
    const b = await ctx.db.get(id);
    if (!b) return { success: false, score: 0 };

    let score = 0;

    // ── Data completeness (max 40 pts) ──
    if (b.email) score += 15;
    if (b.ownerName) score += 10;
    if (b.linkedinOwnerUrl) score += 8;
    if (b.metaPageUrl) score += 7;

    // ── Engagement signals (max 30 pts) ──
    const wq = b.websiteQuality as any;
    if (wq?.needsUpgrade === "critical") score += 15;
    else if (wq?.needsUpgrade === "recommended") score += 8;

    const ri = b.reviewInsights as any;
    if (ri?.sentimentScore !== undefined && ri.sentimentScore < 3.5) score += 10;

    const rc = b.reviewCount ?? 0;
    if (rc >= 10 && rc < 50) score += 5;  // Sweet spot: established but not huge
    else if (rc >= 50) score += 3;

    // Opened email but no reply = warm interest
    if (b.emailOpenedAt && !b.outreachStatus?.emailRepliedAt) score += 7;

    // ── Business health (max 20 pts) ──
    if ((b.rating ?? 0) >= 4.0) score += 10;
    if ((b.rating ?? 5) < 3.0) score -= 10;
    if (rc < 5) score -= 5;
    if (b.website) score += 5;

    // ── Fit signals (max 10 pts) ──
    if (b.contactFormUrl && !wq) score += 5;  // Has contact form but no website assessment
    if ((b.enrichmentQuality ?? 0) >= 3) score += 5;

    // Pain points detected = high-intent lead
    if (ri?.painPoints?.length) score += Math.min(5, ri.painPoints.length * 2);

    score = Math.max(0, Math.min(100, score));
    await ctx.db.patch(id, { leadScore: score, leadScoreVersion: 2, updatedAt: Date.now() });
    return { success: true, score };
  },
});

// ── Batch score unscored leads ───────────────────────────────────────

export const getUnscoredBusinesses = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, limit = 50 }) => {
    await authorizeOrgMemberLenient(ctx, organizationId);
    const all = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId_status", (q) =>
        q.eq("organizationId", organizationId).eq("status", "ready")
      )
      .collect();
    return all.filter((b) => b.leadScore === undefined).slice(0, limit);
  },
});

// ── Get funnel counts for dashboard ─────────────────────────────────

export const getFunnelCounts = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await authorizeOrgMember(ctx, organizationId);
    // Try pre-computed aggregates first (single doc read)
    const agg = await ctx.db
      .query("businessAggregates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .first();

    if (agg) {
      return {
        scraped: agg.scraped,
        enriched: agg.enriched,
        scored: agg.scored,
        contacted: agg.contacted,
        opened: agg.opened,
        replied: agg.replied,
      };
    }

    // Fallback: compute from full scan (until aggregates are populated)
    const all = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    return {
      scraped: all.length,
      enriched: all.filter((b) => b.status === "ready" || b.status === "all_sent").length,
      scored: all.filter((b) => b.leadScore !== undefined && (b.leadScore ?? 0) >= 20).length,
      contacted: all.filter((b) =>
        b.outreachStatus?.emailSentAt || b.outreachStatus?.metaSentAt || b.outreachStatus?.linkedinSentAt
      ).length,
      opened: all.filter((b) => b.emailOpenedAt !== undefined).length,
      replied: all.filter((b) =>
        b.outreachStatus?.emailRepliedAt || b.outreachStatus?.metaRepliedAt || b.outreachStatus?.linkedinRepliedAt
      ).length,
    };
  },
});

// ── Get email stats for dashboard ───────────────────────────────────

export const getEmailStats = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await authorizeOrgMember(ctx, organizationId);
    // Try pre-computed aggregates first
    const agg = await ctx.db
      .query("businessAggregates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .first();

    if (agg) {
      return {
        sent: agg.emailSent,
        opened: agg.opened,
        replied: agg.replied,
        bounced: agg.emailBounced,
        unsubscribed: agg.emailUnsubscribed,
      };
    }

    // Fallback: compute from full scan
    const all = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    const sent = all.filter((b) => !!b.outreachStatus?.emailSentAt).length;
    const opened = all.filter((b) => !!b.emailOpenedAt).length;
    const replied = all.filter((b) => !!b.outreachStatus?.emailRepliedAt).length;
    const bounced = all.filter((b) => b.emailStatus === "bounced").length;
    const unsubscribed = all.filter((b) => b.emailStatus === "unsubscribed").length;

    return { sent, opened, replied, bounced, unsubscribed };
  },
});

// ── Refresh business aggregates for an org (call after status changes) ──

export const refreshAggregates = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const all = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    const data = {
      organizationId,
      scraped: all.length,
      enriched: all.filter((b) => b.status === "ready" || b.status === "all_sent").length,
      scored: all.filter((b) => b.leadScore !== undefined && (b.leadScore ?? 0) >= 20).length,
      contacted: all.filter((b) =>
        b.outreachStatus?.emailSentAt || b.outreachStatus?.metaSentAt || b.outreachStatus?.linkedinSentAt
      ).length,
      opened: all.filter((b) => !!b.emailOpenedAt).length,
      replied: all.filter((b) =>
        b.outreachStatus?.emailRepliedAt || b.outreachStatus?.metaRepliedAt || b.outreachStatus?.linkedinRepliedAt
      ).length,
      emailSent: all.filter((b) => !!b.outreachStatus?.emailSentAt).length,
      emailBounced: all.filter((b) => b.emailStatus === "bounced").length,
      emailUnsubscribed: all.filter((b) => b.emailStatus === "unsubscribed").length,
      lastUpdated: Date.now(),
    };

    const existing = await ctx.db
      .query("businessAggregates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("businessAggregates", data);
    }
  },
});

// ── Get businesses due for next outreach sequence step ───────────────

export const getBusinessesDueForOutreach = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, limit = 20 }) => {
    await authorizeOrgMemberLenient(ctx, organizationId);
    const now = Date.now();
    // Use outreachNextStepAt index — only fetches businesses with a scheduled step
    const candidates = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId_outreachNextStepAt", (q) =>
        q.eq("organizationId", organizationId).lte("outreachNextStepAt", now)
      )
      .collect();

    return candidates
      .filter((b) => {
        if (!b.outreachNextStepAt) return false;
        if (b.emailStatus === "unsubscribed" || b.emailStatus === "bounced") return false;
        const os = b.outreachStatus ?? {};
        if (os.emailRepliedAt || os.metaRepliedAt || os.linkedinRepliedAt) return false;
        // Skip businesses in retry backoff
        if (b.outreachLastFailedAt && b.outreachRetryCount) {
          const backoffMs = b.outreachRetryCount >= 3 ? 24 * 60 * 60 * 1000
            : b.outreachRetryCount >= 2 ? 4 * 60 * 60 * 1000
            : 60 * 60 * 1000;
          if (now - b.outreachLastFailedAt < backoffMs) return false;
        }
        return true;
      })
      .sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0))
      .slice(0, limit);
  },
});

// ── Advance outreach sequence step ───────────────────────────────────

export const advanceSequenceStep = mutation({
  args: {
    id: v.id("businesses"),
    step: v.number(),
    nextStepAt: v.optional(v.number()),
  },
  handler: async (ctx, { id, step, nextStepAt }) => {
    const now = Date.now();
    await ctx.db.patch(id, {
      outreachSequenceStep: step,
      outreachLastStepAt: now,
      outreachNextStepAt: nextStepAt,
      updatedAt: now,
    });
    return { success: true };
  },
});

// ── Daily outreach count (rate limiting) ─────────────────────────────

export const getDailyOutreachCount = query({
  args: {
    organizationId: v.id("organizations"),
    channel: v.union(v.literal("email"), v.literal("meta"), v.literal("linkedin")),
    date: v.optional(v.string()), // "YYYY-MM-DD" — defaults to today
  },
  handler: async (ctx, { organizationId, channel, date }) => {
    await authorizeOrgMemberLenient(ctx, organizationId);
    const today = date ?? new Date().toISOString().split("T")[0];

    // Use the atomic counter table (single doc read instead of full-table scan)
    const counter = await ctx.db
      .query("outreachDailyCounts")
      .withIndex("by_org_date_channel", (q) =>
        q.eq("organizationId", organizationId).eq("date", today).eq("channel", channel)
      )
      .first();

    const sentToday = counter?.count ?? 0;
    const LIMITS: Record<string, number> = { email: 500, meta: 10, linkedin: 10 };
    return {
      sent: sentToday,
      limit: LIMITS[channel] ?? 10,
      remaining: Math.max(0, (LIMITS[channel] ?? 10) - sentToday),
      withinLimit: sentToday < (LIMITS[channel] ?? 10),
    };
  },
});

// ── Find by Resend message ID (global, for webhook handling) ────────

export const findByMessageIdGlobal = query({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }) => {
    return await ctx.db
      .query("businesses")
      .withIndex("by_lastEmailMessageId", (q) => q.eq("lastEmailMessageId", messageId))
      .first();
  },
});

// ── Check engagement signals and auto-advance sequence ───────────────

export const checkAndAdvanceSequence = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const b = await ctx.db.get(businessId);
    if (!b) return { action: "not_found" };

    const now = Date.now();
    const os = b.outreachStatus ?? {};
    const currentStep = b.outreachSequenceStep ?? 0;
    const DAY_MS = 24 * 60 * 60 * 1000;

    // Rule 1: Email bounced → skip to step 3 (LinkedIn follow-up) or mark complete
    if (b.emailStatus === "bounced") {
      // Email steps: 0 (Email #1), 2 (Email #2), 4 (Final email)
      const isEmailStep = currentStep === 0 || currentStep === 2 || currentStep === 4;
      if (isEmailStep) {
        // Jump to next non-email step: 0→1, 2→3, 4→complete(5)
        const nextStep = currentStep === 0 ? 1 : currentStep === 2 ? 3 : 5;
        const nextAt = nextStep <= 4 ? now : undefined;
        await ctx.db.patch(businessId, {
          outreachSequenceStep: nextStep,
          outreachNextStepAt: nextAt,
          outreachLastStepAt: now,
          updatedAt: now,
        });
        return {
          action: "bounced_skip",
          fromStep: currentStep,
          toStep: nextStep,
          message: nextStep <= 4
            ? `Email bounced — skipped to step ${nextStep} (non-email).`
            : "Email bounced — sequence complete (no remaining non-email steps).",
        };
      }
    }

    // Rule 2: Email opened + 48h passed + no reply → advance immediately
    if (
      b.emailOpenedAt &&
      !os.emailRepliedAt &&
      now - b.emailOpenedAt >= 2 * DAY_MS
    ) {
      // Only advance if still waiting on the scheduled delay (i.e. next step hasn't fired yet)
      if (b.outreachNextStepAt && b.outreachNextStepAt > now) {
        const nextStep = currentStep + 1;
        if (nextStep <= 4) {
          await ctx.db.patch(businessId, {
            outreachSequenceStep: nextStep,
            outreachNextStepAt: now, // Due immediately
            outreachLastStepAt: now,
            updatedAt: now,
          });
          return {
            action: "early_advance",
            fromStep: currentStep,
            toStep: nextStep,
            message: `Email opened 48h+ ago with no reply — advanced to step ${nextStep} early.`,
          };
        }
      }
    }

    // Rule 3: LinkedIn replied → pause sequence for human follow-up
    if (os.linkedinRepliedAt) {
      // Clear nextStepAt to pause the sequence
      if (b.outreachNextStepAt) {
        await ctx.db.patch(businessId, {
          outreachNextStepAt: undefined,
          updatedAt: now,
        });
        return {
          action: "linkedin_pause",
          currentStep,
          message: "LinkedIn reply detected — sequence paused for priority human follow-up.",
        };
      }
      return { action: "already_paused", currentStep };
    }

    return { action: "no_change", currentStep };
  },
});

// ── Find by email ────────────────────────────────────────────────────

export const findByEmail = query({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
  },
  handler: async (ctx, { organizationId, email }) => {
    await authorizeOrgMemberLenient(ctx, organizationId);
    return await ctx.db
      .query("businesses")
      .withIndex("by_organizationId_email", (q) =>
        q.eq("organizationId", organizationId).eq("email", email)
      )
      .first();
  },
});

// ── Internal: Get due businesses for a specific org (used by outreach cron) ──

export const getDueBusinessesForOrg = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, limit = 50 }) => {
    const now = Date.now();
    const candidates = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId_outreachNextStepAt", (q) =>
        q.eq("organizationId", organizationId).lte("outreachNextStepAt", now)
      )
      .collect();

    return candidates
      .filter((b) => {
        if (!b.outreachNextStepAt) return false;
        if (b.emailStatus === "unsubscribed" || b.emailStatus === "bounced") return false;
        const os = b.outreachStatus ?? {};
        if (os.emailRepliedAt || os.metaRepliedAt || os.linkedinRepliedAt) return false;
        // Skip businesses in retry backoff
        if (b.outreachLastFailedAt && b.outreachRetryCount) {
          const backoffMs = b.outreachRetryCount >= 3 ? 24 * 60 * 60 * 1000
            : b.outreachRetryCount >= 2 ? 4 * 60 * 60 * 1000
            : 60 * 60 * 1000;
          if (now - b.outreachLastFailedAt < backoffMs) return false;
        }
        return true;
      })
      .sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0))
      .slice(0, limit);
  },
});

// ── Mark outreach as failed (retry with backoff) ────────────────────

export const markOutreachFailed = internalMutation({
  args: {
    businessIds: v.array(v.id("businesses")),
  },
  handler: async (ctx, { businessIds }) => {
    const now = Date.now();
    for (const id of businessIds) {
      const b = await ctx.db.get(id);
      if (!b) continue;

      const retryCount = (b.outreachRetryCount ?? 0) + 1;
      const patch: Record<string, any> = {
        outreachRetryCount: retryCount,
        outreachLastFailedAt: now,
        updatedAt: now,
      };

      // After 5 retries, mark as stalled — clear outreachNextStepAt
      if (retryCount >= 5) {
        patch.outreachNextStepAt = undefined;
      }

      await ctx.db.patch(id, patch);
    }
  },
});

// ── Get hot/warm leads needing automated follow-up ──────────────────

export const getHotLeadsNeedingFollowUp = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, limit = 10 }) => {
    const now = Date.now();
    const TWO_HOURS = 2 * 60 * 60 * 1000;

    const all = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId_status", (q) =>
        q.eq("organizationId", organizationId).eq("status", "ready")
      )
      .collect();

    return all
      .filter((b) => {
        if (!b.replyClassification) return false;
        if (b.replyClassification !== "hot" && b.replyClassification !== "warm") return false;
        // Must have a reply timestamp
        const os = b.outreachStatus ?? {};
        const replyAt = os.emailRepliedAt || os.metaRepliedAt || os.linkedinRepliedAt;
        if (!replyAt) return false;
        // Give humans 2 hours to respond first
        if (now - replyAt < TWO_HOURS) return false;
        // Skip if already followed up
        if (b.lastFollowUpAt && b.lastFollowUpAt > replyAt) return false;
        return true;
      })
      .slice(0, limit);
  },
});

// ── Increment outreach daily count ──────────────────────────────────

export const incrementOutreachDailyCount = mutation({
  args: {
    organizationId: v.id("organizations"),
    channel: v.string(),
  },
  handler: async (ctx, { organizationId, channel }) => {
    const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
    const existing = await ctx.db
      .query("outreachDailyCounts")
      .withIndex("by_org_date_channel", (q) =>
        q.eq("organizationId", organizationId).eq("date", today).eq("channel", channel)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { count: existing.count + 1 });
    } else {
      await ctx.db.insert("outreachDailyCounts", {
        organizationId,
        date: today,
        channel,
        count: 1,
      });
    }
  },
});

// ── Get stale leads for reactivation ────────────────────────────────

export const getStaleLeads = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, limit = 20 }) => {
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    const all = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId_status", (q) =>
        q.eq("organizationId", organizationId).eq("status", "all_sent")
      )
      .collect();

    return all
      .filter((b) => {
        // Must have completed sequence (step >= 5) or status is all_sent
        if (!b.outreachLastStepAt) return false;
        // Must be stale (30+ days since last step)
        if (now - b.outreachLastStepAt < THIRTY_DAYS) return false;
        // Must not have any replies
        const os = b.outreachStatus ?? {};
        if (os.emailRepliedAt || os.metaRepliedAt || os.linkedinRepliedAt) return false;
        // Must not be unsubscribed or bounced
        if (b.emailStatus === "unsubscribed" || b.emailStatus === "bounced") return false;
        // Must not have been reactivated already
        if (b.reactivatedAt) return false;
        return true;
      })
      .sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0))
      .slice(0, limit);
  },
});

export const reactivateLead = internalMutation({
  args: { id: v.id("businesses") },
  handler: async (ctx, { id }) => {
    const now = Date.now();
    await ctx.db.patch(id, {
      outreachSequenceStep: 4,     // Final email step — fresh angle
      outreachNextStepAt: now,     // Due immediately
      outreachLastStepAt: now,
      outreachRetryCount: 0,
      outreachLastFailedAt: undefined,
      reactivatedAt: now,
      status: "ready",
      updatedAt: now,
    });
  },
});

// ── Reply intelligence analytics ────────────────────────────────────

export const getReplyIntelligence = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await authorizeOrgMember(ctx, organizationId);
    const all = await ctx.db
      .query("businesses")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    // Classification breakdown
    const classifications = { hot: 0, warm: 0, objection: 0, cold: 0, auto_reply: 0, none: 0 };
    const byVertical: Record<string, { total: number; hot: number; warm: number; objection: number }> = {};
    const weeklyTrend: Record<string, { hot: number; warm: number; objection: number; cold: number }> = {};

    for (const b of all) {
      const cls = (b as any).replyClassification;
      if (cls && cls in classifications) {
        classifications[cls as keyof typeof classifications]++;
      } else if (b.outreachStatus?.emailRepliedAt || b.outreachStatus?.metaRepliedAt || b.outreachStatus?.linkedinRepliedAt) {
        classifications.none++;
      }

      // Per-vertical breakdown (only for replied businesses)
      if (cls) {
        const vertical = (b as any).vertical || b.categories?.[0] || "Unknown";
        if (!byVertical[vertical]) byVertical[vertical] = { total: 0, hot: 0, warm: 0, objection: 0 };
        byVertical[vertical].total++;
        if (cls === "hot") byVertical[vertical].hot++;
        if (cls === "warm") byVertical[vertical].warm++;
        if (cls === "objection") byVertical[vertical].objection++;
      }

      // Weekly trend (based on reply timestamp)
      const replyAt = b.outreachStatus?.emailRepliedAt || b.outreachStatus?.metaRepliedAt || b.outreachStatus?.linkedinRepliedAt;
      if (replyAt && cls) {
        const weekStart = new Date(replyAt);
        weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
        const weekKey = weekStart.toISOString().split("T")[0];
        if (!weeklyTrend[weekKey]) weeklyTrend[weekKey] = { hot: 0, warm: 0, objection: 0, cold: 0 };
        if (cls in weeklyTrend[weekKey]) {
          weeklyTrend[weekKey][cls as keyof typeof weeklyTrend[typeof weekKey]]++;
        }
      }
    }

    const totalReplied = classifications.hot + classifications.warm + classifications.objection + classifications.cold + classifications.auto_reply + classifications.none;
    const totalContacted = all.filter((b) => b.outreachStatus?.emailSentAt || b.outreachStatus?.metaSentAt || b.outreachStatus?.linkedinSentAt).length;

    return {
      classifications,
      totalReplied,
      totalContacted,
      replyRate: totalContacted > 0 ? Math.round((totalReplied / totalContacted) * 1000) / 10 : 0,
      positiveRate: totalReplied > 0 ? Math.round(((classifications.hot + classifications.warm) / totalReplied) * 1000) / 10 : 0,
      byVertical: Object.entries(byVertical)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10),
      weeklyTrend: Object.entries(weeklyTrend)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-8), // Last 8 weeks
    };
  },
});
