import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    return await ctx.storage.generateUploadUrl();
  },
});

export const saveUploadedFile = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.optional(v.id("projects")),
    uploadedBy: v.id("users"),
    storageId: v.id("_storage"),
    name: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Check org storage quota
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    const existingFiles = await ctx.db
      .query("files")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const existingArtifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const currentUsage =
      existingFiles.reduce((sum, f) => sum + f.sizeBytes, 0) +
      existingArtifacts.reduce((sum, a) => sum + a.sizeBytes, 0);

    if (currentUsage + args.sizeBytes > org.maxStorageBytes) {
      // Clean up the uploaded blob since we're rejecting
      await ctx.storage.delete(args.storageId);
      const planLimits: Record<string, string> = {
        free: "100MB",
        pro: "5GB",
        team: "25GB",
        enterprise: "100GB",
      };
      throw new Error(
        `Storage limit reached (${planLimits[org.plan] || "unknown"} on ${org.plan} plan). Upgrade for more storage.`
      );
    }

    return await ctx.db.insert("files", {
      organizationId: args.organizationId,
      projectId: args.projectId,
      uploadedBy: args.uploadedBy,
      storageId: args.storageId,
      name: args.name,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      source: "upload",
    });
  },
});

export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const getById = query({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) return null;
    const url = await ctx.storage.getUrl(file.storageId);
    return { ...file, url };
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("files")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    return await Promise.all(
      files.map(async (file) => ({
        ...file,
        url: await ctx.storage.getUrl(file.storageId),
      }))
    );
  },
});

export const getStorageUsage = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) return null;

    const files = await ctx.db
      .query("files")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const usedBytes =
      files.reduce((sum, f) => sum + f.sizeBytes, 0) +
      artifacts.reduce((sum, a) => sum + a.sizeBytes, 0);

    return {
      usedBytes,
      maxBytes: org.maxStorageBytes,
      fileCount: files.length,
      artifactCount: artifacts.length,
    };
  },
});

export const remove = mutation({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("File not found");

    await ctx.storage.delete(file.storageId);
    await ctx.db.delete(file._id);
  },
});
