import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { TOP_250_US_CITIES } from "../src/lib/data/us-cities";

// ── Initialize campaign for org (inserts all 250 cities if not done) ─

export const initialize = mutation({
  args: {
    organizationId: v.id("organizations"),
    states: v.optional(v.array(v.string())),
    cityCount: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, states, cityCount }) => {
    // Check if already initialized
    const existing = await ctx.db
      .query("cityCampaigns")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .first();

    if (existing) {
      return { alreadyInitialized: true, total: 0 };
    }

    // Filter cities by states if specified
    let cities = TOP_250_US_CITIES;
    if (states && states.length > 0) {
      // Map full state names to abbreviations for matching
      const stateAbbrevs = states.map((s) => STATE_NAME_TO_ABBREV[s] || s);
      cities = TOP_250_US_CITIES.filter((c) => stateAbbrevs.includes(c.state));
    }

    // Limit to cityCount if specified
    const limit = cityCount ?? cities.length;
    cities = cities.slice(0, limit);

    const now = Date.now();
    for (let i = 0; i < cities.length; i++) {
      const city = cities[i];
      await ctx.db.insert("cityCampaigns", {
        organizationId,
        cityName: city.name,
        stateCode: city.state,
        cityIndex: i,
        status: "pending",
        createdAt: now,
      });
    }

    return { alreadyInitialized: false, total: cities.length };
  },
});

// Re-initialize: clear existing cities and seed new ones filtered by states
export const reinitialize = mutation({
  args: {
    organizationId: v.id("organizations"),
    states: v.optional(v.array(v.string())),
    cityCount: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, states, cityCount }) => {
    // Delete all existing city campaigns for this org
    const existing = await ctx.db
      .query("cityCampaigns")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
    for (const city of existing) {
      await ctx.db.delete(city._id);
    }

    // Filter cities by states if specified
    let cities = TOP_250_US_CITIES;
    if (states && states.length > 0) {
      const stateAbbrevs = states.map((s) => STATE_NAME_TO_ABBREV[s] || s);
      cities = TOP_250_US_CITIES.filter((c) => stateAbbrevs.includes(c.state));
    }

    const limit = cityCount ?? cities.length;
    cities = cities.slice(0, limit);

    const now = Date.now();
    for (let i = 0; i < cities.length; i++) {
      const city = cities[i];
      await ctx.db.insert("cityCampaigns", {
        organizationId,
        cityName: city.name,
        stateCode: city.state,
        cityIndex: i,
        status: "pending",
        createdAt: now,
      });
    }

    return { deleted: existing.length, seeded: cities.length };
  },
});

// State name to abbreviation map
const STATE_NAME_TO_ABBREV: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
  "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
  "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
  "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO",
  "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH",
  "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
  "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
};

// ── Internal version callable from other mutations via scheduler ─────

export const initializeInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    states: v.optional(v.array(v.string())),
    cityCount: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, states, cityCount }) => {
    const existing = await ctx.db
      .query("cityCampaigns")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .first();

    if (existing) return { alreadyInitialized: true };

    let cities = TOP_250_US_CITIES;
    if (states && states.length > 0) {
      const stateAbbrevs = states.map((s) => STATE_NAME_TO_ABBREV[s] || s);
      cities = TOP_250_US_CITIES.filter((c) => stateAbbrevs.includes(c.state));
    }
    const limit = cityCount ?? cities.length;
    cities = cities.slice(0, limit);

    const now = Date.now();
    for (let i = 0; i < cities.length; i++) {
      const city = cities[i];
      await ctx.db.insert("cityCampaigns", {
        organizationId,
        cityName: city.name,
        stateCode: city.state,
        cityIndex: i,
        status: "pending",
        createdAt: now,
      });
    }

    return { alreadyInitialized: false, total: cities.length };
  },
});

// ── Get next pending city ────────────────────────────────────────────

export const getNextPending = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const pending = await ctx.db
      .query("cityCampaigns")
      .withIndex("by_organizationId_status", (q) =>
        q.eq("organizationId", organizationId).eq("status", "pending")
      )
      .collect();

    if (pending.length === 0) return null;

    // Return lowest cityIndex
    return pending.sort((a, b) => a.cityIndex - b.cityIndex)[0];
  },
});

// ── Mark city as scraping ────────────────────────────────────────────

export const markScraping = mutation({
  args: { cityId: v.any() },
  handler: async (ctx, { cityId }) => {
    try {
      const city = await ctx.db.get(cityId);
      if (!city) return;
      await ctx.db.patch(cityId, { status: "scraping", lastRunAt: Date.now() });
    } catch { /* Invalid ID — silently ignore */ }
  },
});

// ── Mark city as done ────────────────────────────────────────────────

export const markDone = mutation({
  args: {
    cityId: v.any(),
    businessesFound: v.number(),
  },
  handler: async (ctx, { cityId, businessesFound }) => {
    try {
      const city = await ctx.db.get(cityId);
      if (!city) return;
      await ctx.db.patch(cityId, { status: "done", businessesFound, lastRunAt: Date.now() });
    } catch { /* Invalid ID — silently ignore */ }
  },
});

// ── Mark city as failed ──────────────────────────────────────────────

export const markFailed = mutation({
  args: { cityId: v.any() },
  handler: async (ctx, { cityId }) => {
    try {
      const city = await ctx.db.get(cityId);
      if (!city) return;
      await ctx.db.patch(cityId, { status: "failed" });
    } catch { /* Invalid ID — silently ignore */ }
  },
});

// ── Get campaign progress ────────────────────────────────────────────

export const getProgress = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const all = await ctx.db
      .query("cityCampaigns")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    if (all.length === 0) {
      return { initialized: false, done: 0, pending: 0, scraping: 0, failed: 0, total: 250 };
    }

    return {
      initialized: true,
      done: all.filter((c) => c.status === "done").length,
      pending: all.filter((c) => c.status === "pending").length,
      scraping: all.filter((c) => c.status === "scraping").length,
      failed: all.filter((c) => c.status === "failed").length,
      total: all.length,
      businessesFound: all.reduce((sum, c) => sum + (c.businessesFound ?? 0), 0),
    };
  },
});

// ── List all cities with status ──────────────────────────────────────

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    return await ctx.db
      .query("cityCampaigns")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
  },
});

// ── Reset a city back to pending (re-scrape) ──────────────────────────
export const resetCity = mutation({
  args: { cityId: v.id("cityCampaigns") },
  handler: async (ctx, { cityId }) => {
    const city = await ctx.db.get(cityId);
    if (!city) return;
    await ctx.db.patch(cityId, { status: "pending", businessesFound: undefined, lastRunAt: undefined });
  },
});

// ── Skip a city (mark as done without scraping) ───────────────────────
export const skipCity = mutation({
  args: { cityId: v.id("cityCampaigns") },
  handler: async (ctx, { cityId }) => {
    const city = await ctx.db.get(cityId);
    if (!city) return;
    await ctx.db.patch(cityId, { status: "done", businessesFound: 0, lastRunAt: Date.now() });
  },
});

// ── Add a custom city ─────────────────────────────────────────────────
export const addCity = mutation({
  args: {
    organizationId: v.id("organizations"),
    cityName: v.string(),
    stateCode: v.string(),
  },
  handler: async (ctx, { organizationId, cityName, stateCode }) => {
    // Check for duplicates
    const existing = await ctx.db
      .query("cityCampaigns")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    const dupe = existing.find(
      (c) => c.cityName.toLowerCase() === cityName.toLowerCase() && c.stateCode === stateCode.toUpperCase()
    );
    if (dupe) return { id: dupe._id, created: false };

    const maxIndex = existing.reduce((max, c) => Math.max(max, c.cityIndex), -1);

    const id = await ctx.db.insert("cityCampaigns", {
      organizationId,
      cityName: cityName.trim(),
      stateCode: stateCode.toUpperCase().trim(),
      cityIndex: maxIndex + 1,
      status: "pending",
      createdAt: Date.now(),
    });

    return { id, created: true };
  },
});

// ── Remove a city ─────────────────────────────────────────────────────
export const removeCity = mutation({
  args: { cityId: v.id("cityCampaigns") },
  handler: async (ctx, { cityId }) => {
    await ctx.db.delete(cityId);
  },
});
