// ════════════════════════════════════════════════════════════════════════
// Lead-Gen Pipeline — deterministic orchestration in Convex
// ════════════════════════════════════════════════════════════════════════
//
// Replaces the old "Nexus LLM orchestrator" pattern. Instead of one big
// /api/chat call trying to run 7 sub-agents in 300s, each pipeline step
// is a Convex internal action that:
//   1. Marks its step as "running" in scheduledTasks.pipelineSteps
//   2. Calls a short-lived /api/lead-gen/* endpoint (well under Vercel's 300s)
//   3. Marks the step "done" or "failed"
//   4. Schedules the next step via ctx.scheduler.runAfter(0, ...)
//
// State lives in Convex. The LLM is only invoked for text authoring
// (email copy, outreach messages, report) — never for orchestration.

import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ── Step registry ────────────────────────────────────────────────────
// Each step has an action name + display name. Order matters.

const STEPS = [
  { step: 0, agentName: "Scraping Agent", action: "runStep0Scrape" },
  { step: 1, agentName: "Research Agent", action: "runStep1Enrich" },
  { step: 2, agentName: "Cold Email Agent", action: "runStep2ColdEmail" },
  { step: 3, agentName: "Meta Outreach Agent", action: "runStep3Meta" },
  {
    step: 4,
    agentName: "LinkedIn Outreach Agent",
    action: "runStep4Linkedin",
  },
  { step: 5, agentName: "Social Presence Agent", action: "runStep5Social" },
  { step: 6, agentName: "Marketing Manager", action: "runStep6Report" },
] as const;

const OUTREACH_CHANNEL_BY_STEP: Record<number, string | null> = {
  0: null,
  1: null,
  2: "email",
  3: "meta",
  4: "linkedin",
  5: null, // always run (gated internally by whether any social channel is enabled)
  6: null, // always run
};

// ── Internal queries ─────────────────────────────────────────────────

export const getTask = internalQuery({
  args: { taskId: v.id("scheduledTasks") },
  handler: async (ctx, { taskId }) => {
    return await ctx.db.get(taskId);
  },
});

// ── Step-execution logging ───────────────────────────────────────────
// Every step writes a taskExecutionResults row so ExecutionHistory shows
// a full timeline: one row per step instead of one row per pipeline.

export const logStepExecution = internalMutation({
  args: {
    taskId: v.id("scheduledTasks"),
    organizationId: v.id("organizations"),
    stepName: v.string(),
    status: v.union(v.literal("success"), v.literal("failed")),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    durationMs: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("taskExecutionResults", {
      taskId: args.taskId,
      organizationId: args.organizationId,
      status: args.status,
      result: args.result ? `[${args.stepName}] ${args.result}` : undefined,
      error: args.error ? `[${args.stepName}] ${args.error}` : undefined,
      executedAt: Date.now(),
      durationMs: args.durationMs,
    });
  },
});

// ── Pipeline lifecycle ───────────────────────────────────────────────

export const start = internalAction({
  args: { taskId: v.id("scheduledTasks") },
  handler: async (ctx, { taskId }): Promise<void> => {
    const task = await ctx.runQuery(internal.leadGenPipeline.getTask, {
      taskId,
    });
    if (!task) {
      console.error(`[leadGen] Task ${taskId} not found`);
      return;
    }

    // Initialize every step as pending and currentPipelineStep = -1
    await ctx.runMutation(internal.leadGenPipeline.initPipelineSteps, {
      taskId,
    });

    // Schedule step 0
    await ctx.scheduler.runAfter(
      0,
      internal.leadGenPipeline.runStep0Scrape,
      { taskId, pipelineStartedAt: Date.now() }
    );
  },
});

export const initPipelineSteps = internalMutation({
  args: { taskId: v.id("scheduledTasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return;
    await ctx.db.patch(taskId, {
      currentPipelineStep: -1,
      pipelineSteps: STEPS.map((s) => ({
        step: s.step,
        agentName: s.agentName,
        status: "pending" as const,
      })),
    });
  },
});

export const finish = internalMutation({
  args: {
    taskId: v.id("scheduledTasks"),
    organizationId: v.id("organizations"),
    summary: v.string(),
    pipelineStartedAt: v.number(),
    failed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const durationMs = Date.now() - args.pipelineStartedAt;
    await ctx.db.insert("taskExecutionResults", {
      taskId: args.taskId,
      organizationId: args.organizationId,
      status: args.failed ? "failed" : "success",
      result: args.failed ? undefined : args.summary.slice(0, 5000),
      error: args.failed ? args.summary.slice(0, 5000) : undefined,
      executedAt: Date.now(),
      durationMs,
    });

    const task = await ctx.db.get(args.taskId);
    if (!task) return;

    // Recompute nextRunAt for cron schedules (reuse existing logic via task fields)
    const patch: Record<string, any> = {
      isRunning: false,
      lastRunAt: Date.now(),
      runCount: (task.runCount ?? 0) + 1,
    };

    if (task.schedule.type === "once") {
      patch.status = "completed";
    }

    await ctx.db.patch(args.taskId, patch);
  },
});

// ── Step helpers ─────────────────────────────────────────────────────

async function callLeadGenRoute(
  path: string,
  body: Record<string, any>
): Promise<{ ok: boolean; status: number; data: any; text: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const secret = process.env.SCHEDULER_INTERNAL_SECRET || "";
  const res = await fetch(`${appUrl}/api/lead-gen/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Scheduler-Secret": secret,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    // leave as null
  }
  return { ok: res.ok, status: res.status, data, text };
}

function channelEnabled(
  campaignConfig: any,
  channelKey: string
): boolean {
  if (!campaignConfig) return false;
  const channels: string[] = campaignConfig.outreachChannels ?? [];
  if (!channels.includes(channelKey)) return false;
  const cc = campaignConfig.channelConfig?.[channelKey];
  if (cc && cc.enabled === false) return false;
  return true;
}

// Generic step runner — handles try/catch, pipeline step updates,
// per-step execution logging, and chaining to the next step.
async function runStepWrapper(
  ctx: any,
  {
    taskId,
    stepNum,
    channelKey,
    pipelineStartedAt,
    work,
  }: {
    taskId: Id<"scheduledTasks">;
    stepNum: number;
    channelKey: string | null;
    pipelineStartedAt: number;
    work: (task: any) => Promise<string>;
  }
): Promise<void> {
  const stepDef = STEPS.find((s) => s.step === stepNum)!;
  const task = await ctx.runQuery(internal.leadGenPipeline.getTask, { taskId });
  if (!task) {
    console.error(`[leadGen] step ${stepNum}: task ${taskId} not found`);
    return;
  }

  // Skip step if its channel is not enabled
  if (channelKey && !channelEnabled(task.campaignConfig, channelKey)) {
    await ctx.runMutation(api.scheduledTaskRunner.updatePipelineStep, {
      taskId,
      step: stepNum,
      agentName: stepDef.agentName,
      status: "skipped",
      result: `${channelKey} channel disabled`,
    });
    await scheduleNext(ctx, taskId, stepNum, pipelineStartedAt);
    return;
  }

  const stepStart = Date.now();
  await ctx.runMutation(api.scheduledTaskRunner.updatePipelineStep, {
    taskId,
    step: stepNum,
    agentName: stepDef.agentName,
    status: "running",
  });

  try {
    const summary = await work(task);
    await ctx.runMutation(api.scheduledTaskRunner.updatePipelineStep, {
      taskId,
      step: stepNum,
      agentName: stepDef.agentName,
      status: "done",
      result: summary.slice(0, 500),
    });
    await ctx.runMutation(internal.leadGenPipeline.logStepExecution, {
      taskId,
      organizationId: task.organizationId,
      stepName: stepDef.agentName,
      status: "success",
      result: summary,
      durationMs: Date.now() - stepStart,
    });
  } catch (err: any) {
    const msg = (err?.message || String(err)).slice(0, 500);
    console.error(`[leadGen] step ${stepNum} failed:`, err);
    await ctx.runMutation(api.scheduledTaskRunner.updatePipelineStep, {
      taskId,
      step: stepNum,
      agentName: stepDef.agentName,
      status: "failed",
      result: msg,
    });
    await ctx.runMutation(internal.leadGenPipeline.logStepExecution, {
      taskId,
      organizationId: task.organizationId,
      stepName: stepDef.agentName,
      status: "failed",
      error: msg,
      durationMs: Date.now() - stepStart,
    });
    // Continue pipeline on failure — other steps may still produce value
  }

  await scheduleNext(ctx, taskId, stepNum, pipelineStartedAt);
}

async function scheduleNext(
  ctx: any,
  taskId: Id<"scheduledTasks">,
  stepNum: number,
  pipelineStartedAt: number
): Promise<void> {
  const nextStep = stepNum + 1;
  if (nextStep > 6) {
    // Pipeline complete — finalize
    const task = await ctx.runQuery(internal.leadGenPipeline.getTask, {
      taskId,
    });
    if (!task) return;
    await ctx.runMutation(internal.leadGenPipeline.finish, {
      taskId,
      organizationId: task.organizationId,
      summary: `Pipeline complete — ${(task.pipelineSteps ?? [])
        .map((s: any) => `${s.agentName}: ${s.status}`)
        .join("; ")}`,
      pipelineStartedAt,
    });
    return;
  }

  const nextActionName = STEPS.find((s) => s.step === nextStep)!.action;
  const nextAction = (internal.leadGenPipeline as any)[nextActionName];
  await ctx.scheduler.runAfter(0, nextAction, { taskId, pipelineStartedAt });
}

// ── Step 0 — Scrape ──────────────────────────────────────────────────

export const runStep0Scrape = internalAction({
  args: {
    taskId: v.id("scheduledTasks"),
    pipelineStartedAt: v.number(),
  },
  handler: async (ctx, { taskId, pipelineStartedAt }): Promise<void> => {
    await runStepWrapper(ctx, {
      taskId,
      stepNum: 0,
      channelKey: null,
      pipelineStartedAt,
      work: async (task) => {
        const res = await callLeadGenRoute("scrape", {
          organizationId: task.organizationId,
          taskId,
          campaignConfig: task.campaignConfig,
        });
        if (!res.ok) {
          throw new Error(
            `HTTP ${res.status}: ${res.text.slice(0, 200)}`
          );
        }
        const d = res.data || {};
        return `Scraped ${d.totalSaved ?? 0} businesses across ${d.citiesProcessed ?? 0} cities.`;
      },
    });
  },
});

// ── Step 1 — Enrich ──────────────────────────────────────────────────

export const runStep1Enrich = internalAction({
  args: {
    taskId: v.id("scheduledTasks"),
    pipelineStartedAt: v.number(),
  },
  handler: async (ctx, { taskId, pipelineStartedAt }): Promise<void> => {
    await runStepWrapper(ctx, {
      taskId,
      stepNum: 1,
      channelKey: null,
      pipelineStartedAt,
      work: async (task) => {
        const res = await callLeadGenRoute("enrich", {
          organizationId: task.organizationId,
          taskId,
          campaignConfig: task.campaignConfig,
        });
        if (!res.ok) {
          throw new Error(
            `HTTP ${res.status}: ${res.text.slice(0, 200)}`
          );
        }
        const d = res.data || {};
        return `Enriched ${d.enriched ?? 0} / ${d.attempted ?? 0} businesses.`;
      },
    });
  },
});

// ── Step 2 — Cold Email ──────────────────────────────────────────────

export const runStep2ColdEmail = internalAction({
  args: {
    taskId: v.id("scheduledTasks"),
    pipelineStartedAt: v.number(),
  },
  handler: async (ctx, { taskId, pipelineStartedAt }): Promise<void> => {
    await runStepWrapper(ctx, {
      taskId,
      stepNum: 2,
      channelKey: "email",
      pipelineStartedAt,
      work: async (task) => {
        const res = await callLeadGenRoute("cold-email", {
          organizationId: task.organizationId,
          taskId,
          campaignConfig: task.campaignConfig,
        });
        if (!res.ok) {
          throw new Error(
            `HTTP ${res.status}: ${res.text.slice(0, 200)}`
          );
        }
        const d = res.data || {};
        return `Emails sent: ${d.sent ?? 0}, skipped: ${d.skipped ?? 0}.`;
      },
    });
  },
});

// ── Step 3 — Meta ────────────────────────────────────────────────────

export const runStep3Meta = internalAction({
  args: {
    taskId: v.id("scheduledTasks"),
    pipelineStartedAt: v.number(),
  },
  handler: async (ctx, { taskId, pipelineStartedAt }): Promise<void> => {
    await runStepWrapper(ctx, {
      taskId,
      stepNum: 3,
      channelKey: "meta",
      pipelineStartedAt,
      work: async (task) => {
        const res = await callLeadGenRoute("outreach", {
          organizationId: task.organizationId,
          taskId,
          channel: "meta",
          campaignConfig: task.campaignConfig,
        });
        if (!res.ok) {
          throw new Error(
            `HTTP ${res.status}: ${res.text.slice(0, 200)}`
          );
        }
        const d = res.data || {};
        return `Meta DMs sent: ${d.sent ?? 0}, skipped: ${d.skipped ?? 0}.`;
      },
    });
  },
});

// ── Step 4 — LinkedIn ────────────────────────────────────────────────

export const runStep4Linkedin = internalAction({
  args: {
    taskId: v.id("scheduledTasks"),
    pipelineStartedAt: v.number(),
  },
  handler: async (ctx, { taskId, pipelineStartedAt }): Promise<void> => {
    await runStepWrapper(ctx, {
      taskId,
      stepNum: 4,
      channelKey: "linkedin",
      pipelineStartedAt,
      work: async (task) => {
        const res = await callLeadGenRoute("outreach", {
          organizationId: task.organizationId,
          taskId,
          channel: "linkedin",
          campaignConfig: task.campaignConfig,
        });
        if (!res.ok) {
          throw new Error(
            `HTTP ${res.status}: ${res.text.slice(0, 200)}`
          );
        }
        const d = res.data || {};
        return `LinkedIn connects sent: ${d.sent ?? 0}, skipped: ${d.skipped ?? 0}.`;
      },
    });
  },
});

// ── Step 5 — Social Posting ──────────────────────────────────────────

export const runStep5Social = internalAction({
  args: {
    taskId: v.id("scheduledTasks"),
    pipelineStartedAt: v.number(),
  },
  handler: async (ctx, { taskId, pipelineStartedAt }): Promise<void> => {
    await runStepWrapper(ctx, {
      taskId,
      stepNum: 5,
      channelKey: null,
      pipelineStartedAt,
      work: async (task) => {
        const res = await callLeadGenRoute("social", {
          organizationId: task.organizationId,
          taskId,
          campaignConfig: task.campaignConfig,
        });
        if (!res.ok) {
          throw new Error(
            `HTTP ${res.status}: ${res.text.slice(0, 200)}`
          );
        }
        const d = res.data || {};
        return `Social posts: ${d.posted ?? 0}, skipped: ${d.skipped ?? 0}.`;
      },
    });
  },
});

// ── Step 6 — Report ──────────────────────────────────────────────────

export const runStep6Report = internalAction({
  args: {
    taskId: v.id("scheduledTasks"),
    pipelineStartedAt: v.number(),
  },
  handler: async (ctx, { taskId, pipelineStartedAt }): Promise<void> => {
    await runStepWrapper(ctx, {
      taskId,
      stepNum: 6,
      channelKey: null,
      pipelineStartedAt,
      work: async (task) => {
        const res = await callLeadGenRoute("report", {
          organizationId: task.organizationId,
          taskId,
        });
        if (!res.ok) {
          throw new Error(
            `HTTP ${res.status}: ${res.text.slice(0, 200)}`
          );
        }
        const d = res.data || {};
        return (d.summary ?? "Report generated.").slice(0, 500);
      },
    });
  },
});
