import { query } from "./_generated/server";

/**
 * Lightweight liveness probe for /api/health.
 *
 * Does no DB reads — its purpose is to confirm that (a) the caller can
 * reach the Convex deployment, (b) Convex can run a function, and (c) the
 * deployment's clock is sensible. Safe to call from uptime monitors.
 */
export const ping = query({
  args: {},
  handler: async () => ({ ok: true, at: Date.now() }),
});
