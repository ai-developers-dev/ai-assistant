import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import type { AgentType } from "@/lib/agents/registry";

interface DelegationConfig {
  organizationId: Id<"organizations">;
  projectId: Id<"projects">;
  sessionId?: Id<"sessions">;
  currentAgentType: AgentType;
  delegationDepth: number;
  maxDepth?: number; // configurable: proMode = 3, default = 1
}

/**
 * Factory: creates the delegate_to_agent tool.
 * Depth limit is configurable (default 1, proMode allows 3).
 * Tracks delegation runs via subagentRuns table for accountability.
 */
export function createDelegationTool(
  convex: ConvexHttpClient,
  config: DelegationConfig
) {
  const maxDepth = config.maxDepth ?? 1;

  return tool({
    description: `Delegate a sub-task to a specialist agent. The specialist will execute the task and return results to you. You are currently the "${config.currentAgentType}" agent (depth ${config.delegationDepth}/${maxDepth}). Use this when a sub-task clearly falls within another agent's domain.

Available specialists:
- documents: Writing reports, proposals, articles, detailed documents
- websites: Building HTML/CSS websites and web pages
- sheets: Data analysis, spreadsheet operations, calculations
- slides: Creating presentations and slide decks
- tools: Complex automation with browser control and booking
- images: Image generation and visual content
- videos: Video scripting and production planning

Do NOT delegate if you can handle the task yourself. Provide clear, specific instructions.`,
    parameters: z.object({
      targetAgent: z
        .enum([
          "general",
          "documents",
          "websites",
          "sheets",
          "slides",
          "tools",
          "images",
          "videos",
          "chat",
        ])
        .describe("The specialist agent type to delegate to"),
      task: z
        .string()
        .describe(
          "Clear, specific instructions for what the specialist should do"
        ),
      context: z
        .string()
        .optional()
        .describe(
          "Additional context from your current conversation to help the specialist"
        ),
    }),
    execute: async ({ targetAgent, task, context }) => {
      // Guard: prevent deep delegation chains
      if (config.delegationDepth >= maxDepth) {
        return {
          __delegation: false,
          error:
            `Cannot delegate further — maximum delegation depth (${maxDepth}) reached. Complete this task directly.`,
        };
      }

      // Don't delegate to yourself
      if (targetAgent === config.currentAgentType) {
        return {
          __delegation: false,
          error: `You are already the "${config.currentAgentType}" agent. Handle this task directly instead of delegating to yourself.`,
        };
      }

      // Track the delegation run
      let runId: Id<"subagentRuns"> | undefined;
      try {
        runId = await convex.mutation(api.subagentRuns.startRun, {
          organizationId: config.organizationId,
          projectId: config.projectId,
          sessionId: config.sessionId,
          parentAgentType: config.currentAgentType,
          childAgentType: targetAgent,
          depth: config.delegationDepth + 1,
          task,
        });
      } catch (err) {
        console.error("[delegation] Failed to record run start:", err);
        // Non-fatal — continue with delegation even if tracking fails
      }

      try {
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

        const fullPrompt = context
          ? `${task}\n\n## Additional Context\n${context}`
          : task;

        const response = await fetch(`${appUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: fullPrompt }],
            agentType: targetAgent,
            organizationId: config.organizationId,
            projectId: config.projectId,
            sessionId: config.sessionId,
            _delegationDepth: config.delegationDepth + 1,
          }),
        });

        if (!response.ok) {
          const errorText = await response
            .text()
            .catch(() => "Unknown error");

          // Track failure
          if (runId) {
            await convex.mutation(api.subagentRuns.completeRun, {
              runId,
              status: "failed",
              error: `HTTP ${response.status}: ${errorText.slice(0, 300)}`,
            }).catch(() => {});
          }

          return {
            __delegation: false,
            error: `Delegation failed (HTTP ${response.status}): ${errorText.slice(0, 300)}`,
          };
        }

        // Read the streamed response
        const reader = response.body?.getReader();
        if (!reader) {
          if (runId) {
            await convex.mutation(api.subagentRuns.completeRun, {
              runId,
              status: "failed",
              error: "No response body from delegated agent",
            }).catch(() => {});
          }
          return {
            __delegation: false,
            error: "No response body from delegated agent",
          };
        }

        // Collect the full streamed response
        const decoder = new TextDecoder();
        let resultText = "";
        const maxLength = 10000; // Cap to prevent token overflow

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          resultText += decoder.decode(value, { stream: true });
          if (resultText.length > maxLength) {
            resultText = resultText.slice(0, maxLength);
            reader.cancel();
            break;
          }
        }

        // Extract just the text content from the data stream format
        // Data stream format: lines like "0:text", "2:tool_call", etc.
        const textParts: string[] = [];
        for (const line of resultText.split("\n")) {
          if (line.startsWith("0:")) {
            try {
              // Format is 0:"quoted text"
              const parsed = JSON.parse(line.slice(2));
              if (typeof parsed === "string") textParts.push(parsed);
            } catch {
              // Not valid JSON, skip
            }
          }
        }

        const cleanResult = textParts.join("") || resultText.slice(0, 3000);

        // Track success
        if (runId) {
          await convex.mutation(api.subagentRuns.completeRun, {
            runId,
            status: "completed",
            result: cleanResult.slice(0, 5000),
          }).catch((err) => {
            console.error("[delegation] Failed to record run completion:", err);
          });
        }

        return {
          __delegation: true,
          fromAgent: config.currentAgentType,
          toAgent: targetAgent,
          depth: config.delegationDepth + 1,
          result: cleanResult,
        };
      } catch (err: any) {
        // Track failure
        if (runId) {
          await convex.mutation(api.subagentRuns.completeRun, {
            runId,
            status: "failed",
            error: err.message?.slice(0, 300),
          }).catch(() => {});
        }

        return {
          __delegation: false,
          error: `Delegation failed: ${err.message?.slice(0, 300)}`,
        };
      }
    },
  });
}
