import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();
  },
});

export const send = mutation({
  args: {
    sessionId: v.id("sessions"),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
      v.literal("tool")
    ),
    content: v.string(),
    toolCalls: v.optional(
      v.array(
        v.object({
          id: v.string(),
          toolName: v.string(),
          args: v.string(),
          result: v.optional(v.string()),
          status: v.optional(
            v.union(
              v.literal("pending"),
              v.literal("success"),
              v.literal("error")
            )
          ),
        })
      )
    ),
    attachments: v.optional(
      v.array(
        v.object({
          fileId: v.id("files"),
          name: v.string(),
          mimeType: v.string(),
        })
      )
    ),
    artifactIds: v.optional(v.array(v.id("artifacts"))),
    tokenUsage: v.optional(
      v.object({
        promptTokens: v.number(),
        completionTokens: v.number(),
        totalTokens: v.number(),
      })
    ),
    model: v.optional(v.string()),
    creditCost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("messages", args);

    // Update session counters
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.patch(args.sessionId, {
        messageCount: session.messageCount + 1,
        lastMessageAt: Date.now(),
      });
    }

    // Update project counters
    const project = await ctx.db.get(args.projectId);
    if (project) {
      await ctx.db.patch(args.projectId, {
        messageCount: project.messageCount + 1,
        lastActivityAt: Date.now(),
      });
    }

    return messageId;
  },
});

export const saveAssistantMessage = mutation({
  args: {
    sessionId: v.id("sessions"),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    content: v.string(),
    toolCalls: v.optional(
      v.array(
        v.object({
          id: v.string(),
          toolName: v.string(),
          args: v.string(),
          result: v.optional(v.string()),
          status: v.optional(
            v.union(
              v.literal("pending"),
              v.literal("success"),
              v.literal("error")
            )
          ),
        })
      )
    ),
    artifactIds: v.optional(v.array(v.id("artifacts"))),
    tokenUsage: v.optional(
      v.object({
        promptTokens: v.number(),
        completionTokens: v.number(),
        totalTokens: v.number(),
      })
    ),
    model: v.optional(v.string()),
    creditCost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("messages", {
      ...args,
      role: "assistant",
    });

    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.patch(args.sessionId, {
        messageCount: session.messageCount + 1,
        lastMessageAt: Date.now(),
      });
    }

    const project = await ctx.db.get(args.projectId);
    if (project) {
      await ctx.db.patch(args.projectId, {
        messageCount: project.messageCount + 1,
        lastActivityAt: Date.now(),
      });
    }

    return messageId;
  },
});

// Server-side message saving — called from the API route's onFinish
// via ConvexHttpClient (no user auth context).
export const saveFromServer = mutation({
  args: {
    sessionId: v.id("sessions"),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
    ),
    content: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate that the session exists
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const messageId = await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      projectId: args.projectId,
      organizationId: args.organizationId,
      role: args.role,
      content: args.content,
      model: args.model,
    });

    await ctx.db.patch(args.sessionId, {
      messageCount: session.messageCount + 1,
      lastMessageAt: Date.now(),
    });

    const project = await ctx.db.get(args.projectId);
    if (project) {
      await ctx.db.patch(args.projectId, {
        messageCount: project.messageCount + 1,
        lastActivityAt: Date.now(),
      });
    }

    return messageId;
  },
});
