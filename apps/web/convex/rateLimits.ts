import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * Per-minute rate limiter.
 *
 * Call from API routes (via ConvexHttpClient) before invoking an expensive
 * handler — e.g. /api/chat gates AI spend per-user and per-org.
 *
 * Atomicity: Convex runs each mutation in isolation with optimistic
 * concurrency, so the read-then-write pattern here will not double-count
 * across concurrent requests.
 */
export const checkAndIncrement = mutation({
  args: {
    scope: v.string(), // e.g. "chat:user" | "chat:org"
    key: v.string(),   // user/org id
    limit: v.number(), // max requests per minute for this scope
  },
  handler: async (ctx, { scope, key, limit }) => {
    const minute = Math.floor(Date.now() / 60_000);

    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_scope_key_minute", (q) =>
        q.eq("scope", scope).eq("key", key).eq("minute", minute)
      )
      .first();

    if (existing) {
      if (existing.count >= limit) {
        return { ok: false, remaining: 0, limit, resetInSeconds: 60 - (Math.floor(Date.now() / 1000) % 60) };
      }
      await ctx.db.patch(existing._id, { count: existing.count + 1 });
      return { ok: true, remaining: limit - (existing.count + 1), limit };
    }

    await ctx.db.insert("rateLimits", { scope, key, minute, count: 1 });
    return { ok: true, remaining: limit - 1, limit };
  },
});
