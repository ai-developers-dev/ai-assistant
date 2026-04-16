import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { generateEmbedding } from "@/lib/memory/embeddings";

interface MemoryToolsConfig {
  organizationId: Id<"organizations">;
  projectId: Id<"projects">;
  sessionId?: Id<"sessions">;
}

/**
 * Factory: creates memory_save and memory_search tools bound to a Convex client and IDs.
 * Pattern matches createSaveArtifactTool in save-artifact.ts.
 */
export function createMemoryTools(
  convex: ConvexHttpClient,
  config: MemoryToolsConfig
) {
  const memorySaveTool = tool({
    description:
      "Save important information to persistent memory for cross-session recall. Use this to store user preferences, key decisions, important findings, project context, and anything worth remembering across conversations. Memories persist within the same project.",
    parameters: z.object({
      content: z
        .string()
        .describe(
          "The information to remember. Be specific and include context (e.g. 'User prefers dark mode and minimal animations' not just 'dark mode')."
        ),
      topic: z
        .string()
        .describe(
          "Category for this memory (e.g. 'user_preference', 'project_decision', 'key_finding', 'technical_context')"
        ),
      importance: z
        .enum(["high", "medium", "low"])
        .describe("How important this memory is for future recall"),
    }),
    execute: async ({ content, topic, importance }) => {
      const embedding = await generateEmbedding(content);
      if (!embedding) {
        return {
          __memorySaved: false,
          error:
            "Embedding generation unavailable — memory not saved. OPENAI_API_KEY may not be configured.",
        };
      }

      try {
        await convex.mutation(api.embeddings.insertMemory, {
          organizationId: config.organizationId,
          projectId: config.projectId,
          sessionId: config.sessionId,
          content: `[${importance}] [${topic}] ${content}`,
          embedding,
          metadata: { source: "agent", type: topic },
          importance,
        });

        return {
          __memorySaved: true,
          topic,
          importance,
          preview: content.slice(0, 200),
        };
      } catch (err: any) {
        console.error("[memory_save] Failed:", err);
        return {
          __memorySaved: false,
          error: `Failed to save memory: ${err.message?.slice(0, 200)}`,
        };
      }
    },
  });

  const memorySearchTool = tool({
    description:
      "Search persistent memory for relevant information from previous conversations. Use this to recall user preferences, past decisions, project context, or any previously saved information.",
    parameters: z.object({
      query: z
        .string()
        .describe(
          "What to search for in memory (e.g. 'user color preferences', 'database architecture decisions')"
        ),
      scope: z
        .enum(["project", "organization"])
        .default("project")
        .describe(
          "Search scope: 'project' searches within the current project, 'organization' searches across all projects"
        ),
    }),
    execute: async ({ query: searchQuery, scope }) => {
      const embedding = await generateEmbedding(searchQuery);
      if (!embedding) {
        return {
          __memoryResults: false,
          error:
            "Embedding generation unavailable — cannot search memories. OPENAI_API_KEY may not be configured.",
          results: [],
        };
      }

      try {
        const results = await convex.action(api.embeddings.hybridSearchMemories, {
          organizationId: config.organizationId,
          projectId: scope === "project" ? config.projectId : undefined,
          embedding,
          query: searchQuery,
          limit: 5,
        });

        return {
          __memoryResults: true,
          count: results.length,
          results: results.map((r: any) => ({
            content: r.content,
            score: r._score,
            metadata: r.metadata,
          })),
        };
      } catch (err: any) {
        console.error("[memory_search] Failed:", err);
        return {
          __memoryResults: false,
          error: `Failed to search memories: ${err.message?.slice(0, 200)}`,
          results: [],
        };
      }
    },
  });

  return { memory_save: memorySaveTool, memory_search: memorySearchTool };
}
