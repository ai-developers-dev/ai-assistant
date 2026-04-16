import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const ARTIFACT_TYPE = v.union(
  v.literal("code"),
  v.literal("document"),
  v.literal("spreadsheet"),
  v.literal("html"),
  v.literal("slides"),
  v.literal("diagram"),
  v.literal("other")
);

// Max inline content size (~900KB to stay under Convex 1MB doc limit)
const MAX_INLINE_BYTES = 900 * 1024;

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    sessionId: v.id("sessions"),
    createdBy: v.optional(v.id("users")),
    title: v.string(),
    type: ARTIFACT_TYPE,
    language: v.optional(v.string()),
    mimeType: v.string(),
    content: v.optional(v.string()),
    fileId: v.optional(v.id("files")),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Check org storage quota
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    const existingArtifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const existingFiles = await ctx.db
      .query("files")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const currentUsage =
      existingArtifacts.reduce((sum, a) => sum + a.sizeBytes, 0) +
      existingFiles.reduce((sum, f) => sum + f.sizeBytes, 0);

    if (currentUsage + args.sizeBytes > org.maxStorageBytes) {
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

    // Truncate content if it exceeds the safe inline limit (~900KB)
    let contentToStore = args.content;
    if (args.content && new TextEncoder().encode(args.content).length > MAX_INLINE_BYTES) {
      contentToStore = args.content.slice(0, MAX_INLINE_BYTES) + "\n\n... [Content truncated to fit storage limit.]";
    }

    return await ctx.db.insert("artifacts", {
      organizationId: args.organizationId,
      projectId: args.projectId,
      sessionId: args.sessionId,
      createdBy: args.createdBy,
      title: args.title,
      type: args.type,
      language: args.language,
      mimeType: args.mimeType,
      content: contentToStore,
      fileId: args.fileId,
      sizeBytes: args.sizeBytes,
      version: 1,
    });
  },
});

// Server-side artifact creation — called from the API route's onFinish
// callback via ConvexHttpClient (which has no user auth).
// Validates by checking that the referenced org/project/session exist.
export const createFromServer = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    sessionId: v.id("sessions"),
    title: v.string(),
    type: ARTIFACT_TYPE,
    language: v.optional(v.string()),
    mimeType: v.string(),
    content: v.optional(v.string()),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    // Validate that the org, project, and session actually exist
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    // Storage quota check
    const existingArtifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const existingFiles = await ctx.db
      .query("files")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const currentUsage =
      existingArtifacts.reduce((sum, a) => sum + a.sizeBytes, 0) +
      existingFiles.reduce((sum, f) => sum + f.sizeBytes, 0);

    if (currentUsage + args.sizeBytes > org.maxStorageBytes) {
      throw new Error("Storage limit reached");
    }

    let contentToStore = args.content;
    if (args.content && new TextEncoder().encode(args.content).length > MAX_INLINE_BYTES) {
      contentToStore = args.content.slice(0, MAX_INLINE_BYTES) + "\n\n... [Content truncated to fit storage limit.]";
    }

    return await ctx.db.insert("artifacts", {
      organizationId: args.organizationId,
      projectId: args.projectId,
      sessionId: args.sessionId,
      title: args.title,
      type: args.type,
      language: args.language,
      mimeType: args.mimeType,
      content: contentToStore,
      sizeBytes: args.sizeBytes,
      version: 1,
    });
  },
});

export const linkToMessage = mutation({
  args: {
    artifactId: v.id("artifacts"),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    await ctx.db.patch(args.artifactId, { messageId: args.messageId });
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("artifacts")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("artifacts")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) return null;

    // If content was stored in _storage, get the URL
    let storageUrl: string | null = null;
    if (artifact.storageId) {
      storageUrl = await ctx.storage.getUrl(artifact.storageId);
    }

    return { ...artifact, storageUrl };
  },
});

export const remove = mutation({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) throw new Error("Artifact not found");

    // Delete linked storage blob if exists
    if (artifact.storageId) {
      await ctx.storage.delete(artifact.storageId);
    }

    // Delete linked file record + storage if exists
    if (artifact.fileId) {
      const file = await ctx.db.get(artifact.fileId);
      if (file) {
        await ctx.storage.delete(file.storageId);
        await ctx.db.delete(file._id);
      }
    }

    await ctx.db.delete(args.artifactId);
  },
});
