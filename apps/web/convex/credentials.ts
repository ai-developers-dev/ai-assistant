import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";

// ── Queries ──

/** List credentials for an org (metadata only — never returns encrypted values) */
export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const credentials = await ctx.db
      .query("credentials")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    return credentials
      .filter((c) => c.status === "active")
      .map((c) => ({
        _id: c._id,
        _creationTime: c._creationTime,
        serviceName: c.serviceName,
        serviceLabel: c.serviceLabel,
        lastUsedAt: c.lastUsedAt,
        status: c.status,
      }));
  },
});

/** Get a single credential by ID (metadata only) */
export const getById = query({
  args: { id: v.id("credentials") },
  handler: async (ctx, args) => {
    const credential = await ctx.db.get(args.id);
    if (!credential || credential.status === "revoked") return null;

    return {
      _id: credential._id,
      _creationTime: credential._creationTime,
      organizationId: credential.organizationId,
      serviceName: credential.serviceName,
      serviceLabel: credential.serviceLabel,
      lastUsedAt: credential.lastUsedAt,
      status: credential.status,
    };
  },
});

/** Internal query to get encrypted values — only callable server-side */
export const getEncrypted = internalQuery({
  args: { id: v.id("credentials") },
  handler: async (ctx, args) => {
    const credential = await ctx.db.get(args.id);
    if (!credential || credential.status === "revoked") return null;
    return credential;
  },
});

// ── Mutations ──

/** Store a new credential (already encrypted by the API route) */
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    serviceName: v.string(),
    serviceLabel: v.string(),
    encryptedUsername: v.string(),
    encryptedPassword: v.string(),
    encryptedExtra: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("credentials", {
      ...args,
      status: "active",
    });
    return id;
  },
});

/** Soft-delete (revoke) a credential */
export const revoke = mutation({
  args: { id: v.id("credentials") },
  handler: async (ctx, args) => {
    const credential = await ctx.db.get(args.id);
    if (!credential) throw new Error("Credential not found");

    await ctx.db.patch(args.id, { status: "revoked" });
    return { success: true };
  },
});

/** Update lastUsedAt timestamp when a credential is used */
export const markUsed = mutation({
  args: { id: v.id("credentials") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastUsedAt: Date.now() });
  },
});
