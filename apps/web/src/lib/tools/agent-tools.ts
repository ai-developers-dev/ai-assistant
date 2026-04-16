import { tool } from "ai";
import { z } from "zod";

// ─── Plan State (in-memory, per Vercel invocation) ──────────────────
// Same pattern as CONTENT_CACHE in save-artifact.ts — each serverless
// invocation is isolated so there's no cross-request leakage.

interface PlanStep {
  id: string;
  description: string;
  toolToUse?: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  result?: string;
  retryCount: number;
}

interface PlanState {
  planId: string;
  goal: string;
  reasoning: string;
  steps: PlanStep[];
  status: "active" | "completed" | "revised";
  reflections: string[];
  revisionCount: number;
  createdAt: number;
}

const PLAN_CACHE = new Map<string, PlanState>();
let planCounter = 0;

export function getPlanState(planId: string): PlanState | undefined {
  return PLAN_CACHE.get(planId);
}

export function clearPlanState(planId: string): void {
  PLAN_CACHE.delete(planId);
}

// ─── agent_plan ─────────────────────────────────────────────────────
// Creates a structured step-by-step plan before executing complex tasks.

export function createAgentPlanTool() {
  return tool({
    description:
      "Create a structured step-by-step plan before executing a complex task. Use this when a task requires 3+ tool calls, multi-source research, or multi-step workflows. Do NOT use for simple questions or single tool calls.",
    parameters: z.object({
      goal: z
        .string()
        .describe("The overall goal to accomplish"),
      steps: z
        .array(
          z.object({
            description: z.string().describe("What this step will do"),
            toolToUse: z
              .string()
              .optional()
              .describe("Which tool to use for this step (e.g. web_search, deep_search, read_webpage, calculator)"),
          })
        )
        .min(2)
        .max(8)
        .describe("The ordered steps to accomplish the goal (2-8 steps)"),
      reasoning: z
        .string()
        .describe("Brief explanation of why this plan structure was chosen"),
    }),
    execute: async ({ goal, steps, reasoning }) => {
      const planId = `plan_${++planCounter}_${Date.now()}`;

      const planSteps: PlanStep[] = steps.map((s, i) => ({
        id: `step_${i + 1}`,
        description: s.description,
        toolToUse: s.toolToUse,
        status: "pending" as const,
        retryCount: 0,
      }));

      const state: PlanState = {
        planId,
        goal,
        reasoning,
        steps: planSteps,
        status: "active",
        reflections: [],
        revisionCount: 0,
        createdAt: Date.now(),
      };

      PLAN_CACHE.set(planId, state);

      return {
        __agentPlan: true,
        planId,
        goal,
        steps: planSteps.map((s) => ({
          id: s.id,
          description: s.description,
          toolToUse: s.toolToUse,
          status: s.status,
        })),
        instruction:
          "Plan created. Now execute each step in order. After each tool call, use update_plan to track progress. When all steps are done, use agent_reflect to evaluate results.",
      };
    },
  });
}

// ─── update_plan ────────────────────────────────────────────────────
// Updates step status after each tool execution during the plan.

export function createUpdatePlanTool() {
  return tool({
    description:
      "Update the status of a plan step after executing it. Call this after each tool call during a plan to track progress. Can also add new steps for self-correction.",
    parameters: z.object({
      planId: z.string().describe("The plan ID from agent_plan"),
      stepId: z.string().describe("The step ID to update (e.g. step_1)"),
      status: z
        .enum(["completed", "failed", "skipped"])
        .describe("The new status for this step"),
      result: z
        .string()
        .optional()
        .describe("Brief summary of what this step produced or why it failed"),
      addSteps: z
        .array(
          z.object({
            description: z.string(),
            toolToUse: z.string().optional(),
            insertAfter: z
              .string()
              .optional()
              .describe("Step ID to insert after (defaults to end)"),
          })
        )
        .optional()
        .describe(
          "New steps to add for self-correction or plan revision"
        ),
    }),
    execute: async ({ planId, stepId, status, result, addSteps }) => {
      const state = PLAN_CACHE.get(planId);
      if (!state) {
        return {
          __planUpdate: true,
          error: "Plan not found. Create a plan first with agent_plan.",
        };
      }

      // Update the target step
      const stepIndex = state.steps.findIndex((s) => s.id === stepId);
      if (stepIndex === -1) {
        return {
          __planUpdate: true,
          error: `Step ${stepId} not found in plan.`,
        };
      }

      state.steps[stepIndex].status = status;
      if (result) state.steps[stepIndex].result = result;
      if (status === "failed") {
        state.steps[stepIndex].retryCount++;
      }

      // Insert new steps if provided (self-correction)
      if (addSteps && addSteps.length > 0) {
        state.revisionCount++;
        for (const newStep of addSteps) {
          const newId = `step_${state.steps.length + 1}`;
          const insertIdx = newStep.insertAfter
            ? state.steps.findIndex((s) => s.id === newStep.insertAfter) + 1
            : state.steps.length;

          state.steps.splice(insertIdx, 0, {
            id: newId,
            description: newStep.description,
            toolToUse: newStep.toolToUse,
            status: "pending",
            retryCount: 0,
          });
        }
      }

      // Calculate progress
      const completed = state.steps.filter(
        (s) => s.status === "completed" || s.status === "skipped"
      ).length;
      const failed = state.steps.filter((s) => s.status === "failed").length;
      const total = state.steps.length;

      // Find next pending step
      const nextStep = state.steps.find((s) => s.status === "pending");

      // Check if plan is done
      if (!nextStep && failed === 0) {
        state.status = "completed";
      }

      return {
        __planUpdate: true,
        planId,
        progress: { completed, failed, total },
        steps: state.steps.map((s) => ({
          id: s.id,
          description: s.description,
          status: s.status,
          result: s.result,
        })),
        nextStep: nextStep
          ? { id: nextStep.id, description: nextStep.description }
          : null,
        instruction: nextStep
          ? `Step updated. Next: ${nextStep.description}. Execute it now, then update_plan again.`
          : "All steps complete. Use agent_reflect to evaluate the results.",
      };
    },
  });
}

// ─── agent_reflect ──────────────────────────────────────────────────
// Evaluates results after plan execution to decide if revision is needed.

export function createAgentReflectTool() {
  return tool({
    description:
      "Evaluate the results after completing a plan. Assess whether the goal was achieved and whether revision is needed. Use this after all plan steps are done.",
    parameters: z.object({
      planId: z.string().describe("The plan ID from agent_plan"),
      assessment: z.object({
        goalAchieved: z
          .boolean()
          .describe("Whether the original goal was fully achieved"),
        confidenceLevel: z
          .enum(["high", "medium", "low"])
          .describe("How confident you are in the results"),
        keyFindings: z
          .array(z.string())
          .describe("The most important findings or results (2-5 items)"),
        gaps: z
          .array(z.string())
          .optional()
          .describe("Any gaps or missing information identified"),
        shouldRevise: z
          .boolean()
          .describe(
            "Whether the plan needs revision to fill gaps. Only true if critical information is missing."
          ),
        revisionReason: z
          .string()
          .optional()
          .describe("Why revision is needed (if shouldRevise is true)"),
      }),
    }),
    execute: async ({ planId, assessment }) => {
      const state = PLAN_CACHE.get(planId);
      if (!state) {
        return {
          __agentReflection: true,
          error: "Plan not found.",
        };
      }

      // Record the reflection
      const reflectionSummary = `[${assessment.confidenceLevel}] Goal ${assessment.goalAchieved ? "achieved" : "not fully achieved"}. Findings: ${assessment.keyFindings.join("; ")}${assessment.gaps?.length ? `. Gaps: ${assessment.gaps.join("; ")}` : ""}`;
      state.reflections.push(reflectionSummary);

      // Cap revisions at 2 to prevent infinite loops
      const canRevise =
        assessment.shouldRevise && state.revisionCount < 2;

      if (canRevise) {
        state.status = "revised";
      } else if (!assessment.shouldRevise) {
        state.status = "completed";
      }

      return {
        __agentReflection: true,
        planId,
        status: state.status,
        assessment: {
          goalAchieved: assessment.goalAchieved,
          confidenceLevel: assessment.confidenceLevel,
          keyFindings: assessment.keyFindings,
          gaps: assessment.gaps || [],
        },
        instruction: canRevise
          ? `Reflection indicates gaps. Use update_plan to add new steps addressing: ${assessment.revisionReason}. Then execute those steps and reflect again.`
          : "Reflection complete. Now write your final comprehensive response to the user, synthesizing all findings.",
      };
    },
  });
}
