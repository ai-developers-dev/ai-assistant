import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { getSpecialty } from "@/lib/agents/specialties";
import { buildSubAgentPrompt } from "@/lib/agents/team-prompts";
import { resolveTools } from "@/lib/tools/catalog";
import { getModelConfig } from "@/lib/agents/models";
import { executeWithResilience } from "@/lib/agents/execution";
import { decryptProviderKeys } from "@/lib/credentials/provider-keys";
import type { DecryptedProviderKeys } from "@/lib/credentials/provider-keys";
import type { ToolProfile } from "@/lib/tools/catalog";


interface TeamDelegationConfig {
  organizationId: Id<"organizations">;
  projectId?: Id<"projects">;
  sessionId?: Id<"sessions">;
  taskId?: Id<"scheduledTasks">;
  agentTeamId: Id<"agentTeams">;
  mainAgentName: string;
  parentDynamicTools: Record<string, any>;
  subAgents: Array<{
    _id: Id<"teamAgents">;
    name: string;
    specialty: string;
    modelId: string;
    toolProfile: string;
    customPrompt?: string;
    isEnabled: boolean;
  }>;
}

/**
 * Factory: creates the delegate_to_team_agent tool.
 * Targets sub-agents by name (not hardcoded agent type).
 * Sub-agents CANNOT delegate further.
 */
export function createTeamDelegationTool(
  convex: ConvexHttpClient,
  config: TeamDelegationConfig
) {
  const enabledAgents = config.subAgents.filter((a) => a.isEnabled);
  const agentNames = enabledAgents.map((a) => a.name);

  const agentListDescription = enabledAgents
    .map((a) => `- **${a.name}** (${a.specialty})`)
    .join("\n");

  return tool({
    description: `Delegate a task to one of your team members. The sub-agent will execute the task using their specialized tools and model, then return results to you.

Available team members:
${agentListDescription}

Provide clear, specific instructions. You are the lead agent — only you can delegate.`,
    parameters: z.object({
      agentName: z
        .string()
        .describe(
          `The name of the team member to delegate to. Must be one of: ${agentNames.join(", ")}`
        ),
      task: z
        .string()
        .describe(
          "Clear, specific instructions for what the sub-agent should do"
        ),
      context: z
        .string()
        .optional()
        .describe(
          "Additional context from the conversation to help the sub-agent"
        ),
    }),
    execute: async ({ agentName, task, context }) => {
      const chainId = crypto.randomUUID();

      const targetAgent = enabledAgents.find(
        (a) => a.name.toLowerCase() === agentName.toLowerCase()
      );

      if (!targetAgent) {
        return {
          __teamDelegation: false,
          error: `No team member named "${agentName}". Available: ${agentNames.join(", ")}`,
        };
      }

      // Log delegation communication
      try {
        await convex.mutation(api.agentCommunications.create, {
          organizationId: config.organizationId,
          agentTeamId: config.agentTeamId,
          projectId: config.projectId,
          sessionId: config.sessionId,
          fromType: "main",
          fromName: config.mainAgentName,
          toType: "sub",
          toAgentId: targetAgent._id,
          toName: targetAgent.name,
          messageType: "delegation",
          content: task,
          metadata: context ? { context } : undefined,
          delegationChainId: chainId,
        });
      } catch (err) {
        console.error("[team-delegation] Failed to log delegation:", err);
      }

      // Update sub-agent status to "working"
      try {
        await convex.mutation(api.teamAgents.updateStatus, {
          agentId: targetAgent._id,
          status: "working",
          currentTask: task.slice(0, 200),
          currentProjectId: config.projectId,
        });
      } catch (err) {
        console.error("[team-delegation] Failed to update status:", err);
      }

      // Update main agent status to "delegating"
      try {
        await convex.mutation(api.agentTeams.updateStatus, {
          teamId: config.agentTeamId,
          status: "delegating",
          currentTask: `Delegating to ${targetAgent.name}: ${task.slice(0, 100)}`,
        });
      } catch (err) {
        console.error("[team-delegation] Failed to update main status:", err);
      }

      // ── Pipeline step tracking: mark step as "running" ──────────────
      const stepMap: Record<string, number> = {
        "Scraping Agent": 0, "Research Agent": 1, "Cold Email Agent": 2,
        "Meta Outreach Agent": 3, "LinkedIn Outreach Agent": 4,
        "Social Presence Agent": 5, "Marketing Manager": 6,
      };
      const stepNum = stepMap[agentName];
      if (stepNum !== undefined && config.taskId) {
        try {
          await convex.mutation(api.scheduledTaskRunner.updatePipelineStep, {
            taskId: config.taskId,
            step: stepNum,
            agentName,
            status: "running",
          });
        } catch (err) {
          console.error("[team-delegation] updatePipelineStep(running) failed:", err);
        }
      }

      try {
        // Fetch credentials FIRST — needed for dynamic tool injection below
        let credentials: DecryptedProviderKeys = {};
        try {
          const orgData = await convex.query(api.organizations.getById, {
            id: config.organizationId,
          });
          if (orgData?.providerKeys) {
            credentials = decryptProviderKeys(
              orgData.providerKeys as Record<string, any>,
              config.organizationId as string
            );
          }
        } catch (err) {
          console.error("[team-delegation] Failed to fetch credentials:", err);
        }

        // Build sub-agent system prompt
        const specialty = getSpecialty(targetAgent.specialty);
        const systemPrompt = buildSubAgentPrompt(
          targetAgent.name,
          specialty?.promptSnippet ?? "You are a specialist AI agent.",
          targetAgent.customPrompt,
          config.mainAgentName
        );

        // Build sub-agent tools — inherit credential-based dynamic tools from parent
        const textAccumulator = { current: "" };
        const subDynamicTools: Record<string, any> = { ...config.parentDynamicTools };
        // Remove delegation tools — sub-agents cannot delegate further
        delete subDynamicTools.delegate_to_agent;
        delete subDynamicTools.delegate_to_team_agent;

        const subAgentTools = resolveTools(
          (targetAgent.toolProfile as ToolProfile) || "standard",
          undefined,
          { textAccumulator, dynamicTools: subDynamicTools }
        );

        // Get model config for the sub-agent
        const subModelConfig = getModelConfig(targetAgent.modelId);

        const fullPrompt = context
          ? `${task}\n\n## Context from lead agent\n${context}`
          : task;

        // Execute with the sub-agent's configured model
        const result = await executeWithResilience(
          {
            model: targetAgent.modelId,
            fallbackModels: subModelConfig?.fallbackChain ?? [],
            maxRetries: 1,
            credentials,
          },
          {
            system: systemPrompt,
            messages: [{ role: "user" as const, content: fullPrompt }],
            tools: subAgentTools,
            maxSteps: 15,
            maxTokens: subModelConfig?.maxOutputTokens ?? 8192,
            temperature: 0.7,
            toolCallStreaming: true,
          }
        );

        // Collect the text result
        let resultText = "";
        for await (const chunk of result.textStream) {
          resultText += chunk;
          if (resultText.length > 10000) break;
        }

        // ── Pipeline step tracking: mark step as "done" ───────────────
        if (stepNum !== undefined && config.taskId) {
          try {
            await convex.mutation(api.scheduledTaskRunner.updatePipelineStep, {
              taskId: config.taskId,
              step: stepNum,
              agentName,
              status: "done",
              result: resultText.slice(0, 500),
            });
          } catch (err) {
            console.error("[team-delegation] updatePipelineStep(done) failed:", err);
          }
        }

        // Log result communication
        try {
          await convex.mutation(api.agentCommunications.create, {
            organizationId: config.organizationId,
            agentTeamId: config.agentTeamId,
            projectId: config.projectId,
            sessionId: config.sessionId,
            fromType: "sub",
            fromAgentId: targetAgent._id,
            fromName: targetAgent.name,
            toType: "main",
            toName: config.mainAgentName,
            messageType: "result",
            content: resultText.slice(0, 5000),
            delegationChainId: chainId,
          });
        } catch (err) {
          console.error("[team-delegation] Failed to log result:", err);
        }

        // Reset sub-agent status to idle
        try {
          await convex.mutation(api.teamAgents.updateStatus, {
            agentId: targetAgent._id,
            status: "idle",
          });
        } catch (err) {
          console.error("[team-delegation] Failed to reset status:", err);
        }

        return {
          __teamDelegation: true,
          fromAgent: config.mainAgentName,
          toAgent: targetAgent.name,
          specialty: targetAgent.specialty,
          result: resultText || "Sub-agent completed but returned no text.",
        };
      } catch (err: any) {
        // ── Pipeline step tracking: mark step as "failed" ──────────────
        if (stepNum !== undefined && config.taskId) {
          try {
            await convex.mutation(api.scheduledTaskRunner.updatePipelineStep, {
              taskId: config.taskId,
              step: stepNum,
              agentName,
              status: "failed",
              result: err.message?.slice(0, 500),
            });
          } catch (patchErr) {
            console.error("[team-delegation] updatePipelineStep(failed) failed:", patchErr);
          }
        }

        // Log error communication
        try {
          await convex.mutation(api.agentCommunications.create, {
            organizationId: config.organizationId,
            agentTeamId: config.agentTeamId,
            projectId: config.projectId,
            sessionId: config.sessionId,
            fromType: "sub",
            fromAgentId: targetAgent._id,
            fromName: targetAgent.name,
            toType: "main",
            toName: config.mainAgentName,
            messageType: "error",
            content: err.message?.slice(0, 500) || "Unknown error",
          });
        } catch {
          // Non-fatal
        }

        // Reset sub-agent status to error
        try {
          await convex.mutation(api.teamAgents.updateStatus, {
            agentId: targetAgent._id,
            status: "error",
            currentTask: err.message?.slice(0, 200),
          });
        } catch {
          // Non-fatal
        }

        return {
          __teamDelegation: false,
          error: `Delegation to ${targetAgent.name} failed: ${err.message?.slice(0, 300)}`,
        };
      }
    },
  });
}
