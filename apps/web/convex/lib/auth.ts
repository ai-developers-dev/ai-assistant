import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Verify the authenticated user is a member of the given organization.
 * Call at the top of every public mutation/query that accepts organizationId.
 * Throws if unauthenticated or if user is not a member of the claimed org.
 *
 * Returns the user record for convenience.
 */
export async function authorizeOrgMember(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: not signed in");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId_organizationId", (q) =>
      q.eq("clerkUserId", identity.subject).eq("organizationId", organizationId)
    )
    .first();

  if (!user) {
    throw new Error("Forbidden: not a member of this organization");
  }

  return user;
}

/**
 * Like authorizeOrgMember but also requires admin role.
 */
export async function authorizeOrgAdmin(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">
) {
  const user = await authorizeOrgMember(ctx, organizationId);
  if (user.role !== "admin") {
    throw new Error("Forbidden: admin role required");
  }
  return user;
}

/**
 * Resolve the organization for an existing business/resource and verify
 * the caller is a member. Use this when the mutation takes a resource ID
 * (not an orgId) and you need to verify access via the resource's owner org.
 */
export async function authorizeViaBusiness(
  ctx: QueryCtx | MutationCtx,
  businessId: Id<"businesses">
) {
  const business = await ctx.db.get(businessId);
  if (!business) throw new Error("Business not found");
  await authorizeOrgMember(ctx, business.organizationId);
  return business;
}

/**
 * Lenient variant for endpoints called from BOTH authed clients and
 * server-side tools (via ConvexHttpClient which has no identity).
 *
 * - If an identity is present (browser/UI caller): enforce org membership.
 *   This closes the DevTools/direct-Convex-client IDOR from signed-in users.
 * - If no identity (server-side caller via ConvexHttpClient): allow.
 *   Auth is assumed to be enforced at the Next.js API route layer.
 *
 * Use this for queries/mutations that are called from both UI and server tools
 * (e.g. email-send tools, webhook handlers, the IMAP poller, outreach crons).
 *
 * For UI-only endpoints, use the strict `authorizeOrgMember` instead.
 */
export async function authorizeOrgMemberLenient(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null; // Server-side caller — trust API-layer auth

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId_organizationId", (q) =>
      q.eq("clerkUserId", identity.subject).eq("organizationId", organizationId)
    )
    .first();

  if (!user) {
    throw new Error("Forbidden: not a member of this organization");
  }

  return user;
}
