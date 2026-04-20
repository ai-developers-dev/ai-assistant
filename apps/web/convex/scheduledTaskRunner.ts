import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { authorizeOrgMember } from "./lib/auth";

const DAILY_RESULTS_TARGET_OPTIONS = [25, 50, 100, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000] as const;
const DAILY_RESULTS_TARGET_SET = new Set<number>(DAILY_RESULTS_TARGET_OPTIONS);

// ── parseDataStreamText ──────────────────────────────────────────────
// Extracts plain text from Vercel AI SDK data stream format.
// Stream lines look like: 0:"text chunk"\n
function parseDataStreamText(raw: string): string {
  return raw
    .split("\n")
    .filter((line) => line.startsWith("0:"))
    .map((line) => {
      try {
        return JSON.parse(line.slice(2));
      } catch {
        return "";
      }
    })
    .filter((t) => typeof t === "string")
    .join("");
}

// ── processDueTasks ──────────────────────────────────────────────────
// Called by cron every 5 minutes. Finds active tasks whose nextRunAt <= now
// and schedules them for execution.

export const processDueTasks = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    const dueTasks = await ctx.db
      .query("scheduledTasks")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // Filter to tasks that are actually due AND not already running
    const tasksToRun = dueTasks.filter(
      (t) => t.nextRunAt && t.nextRunAt <= now && !t.isRunning
    );

    for (const task of tasksToRun) {
      // Atomic single patch: set isRunning, update counts, and schedule execution
      const nextRunAt = calculateNextRun(task.schedule);
      await ctx.db.patch(task._id, {
        isRunning: true,
        lastRunAt: now,
        nextRunAt,
        runCount: task.runCount + 1,
        ...(task.schedule.type === "once"
          ? { status: "completed" as const }
          : {}),
      });

      // Schedule async execution after the guard is set
      await ctx.scheduler.runAfter(
        0,
        internal.scheduledTaskRunner.executeTask,
        { taskId: task._id }
      );
    }

    if (tasksToRun.length > 0) {
      console.log(
        `[scheduler] Dispatched ${tasksToRun.length} due task(s)`
      );
    }
  },
});

// ── executeTask ──────────────────────────────────────────────────────
// Executes a single scheduled task by calling our /api/chat endpoint.

export const executeTask = internalAction({
  args: { taskId: v.id("scheduledTasks") },
  handler: async (ctx, args) => {
    const task = await ctx.runQuery(
      internal.scheduledTaskRunner.getTaskInternal,
      { taskId: args.taskId }
    );
    if (!task) {
      console.error(`[scheduler] Task ${args.taskId} not found`);
      return;
    }

    // Lead-gen tasks use the new deterministic pipeline instead of the
    // LLM-orchestrator /api/chat path. See apps/web/convex/leadGenPipeline.ts.
    if (task.agentConfig?.agentType === "lead_gen_agent") {
      await ctx.scheduler.runAfter(
        0,
        internal.leadGenPipeline.start,
        { taskId: args.taskId }
      );
      return;
    }

    const startTime = Date.now();

    try {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      // ── Build context-enriched messages ───────────────────────────────
      const chatMessages: Array<{ role: string; content: string }> = [];

      // 1. Inject session summary (if available) as system context
      if (task.projectId) {
        try {
          const session = await ctx.runQuery(
            internal.scheduledTaskRunner.getLatestSession,
            { projectId: task.projectId }
          );
          if (session?.summary) {
            chatMessages.push({
              role: "system",
              content: `[Session Context] ${session.summary}`,
            });
          }
        } catch {
          // Non-fatal
        }

        // 2. Inject last execution result (if available) for continuity
        try {
          const lastResult = await ctx.runQuery(
            internal.scheduledTaskRunner.getLastExecutionResult,
            { taskId: args.taskId }
          );
          if (lastResult) {
            const statusLabel =
              lastResult.status === "success"
                ? "completed successfully"
                : "failed";
            const resultSnippet =
              lastResult.result?.slice(0, 500) ||
              lastResult.error?.slice(0, 500) ||
              "No details";
            chatMessages.push({
              role: "system",
              content: `[Previous Execution] Last run ${statusLabel} at ${new Date(lastResult.executedAt).toISOString()}. Result: ${resultSnippet}`,
            });
          }
        } catch {
          // Non-fatal
        }

        // 3. Inject recent project messages for conversational continuity
        try {
          const recentMessages = await ctx.runQuery(
            internal.scheduledTaskRunner.getRecentProjectMessages,
            { projectId: task.projectId, limit: 6 }
          );
          if (recentMessages && recentMessages.length > 0) {
            // Messages come in desc order, reverse for chronological
            const chronological = [...recentMessages].reverse();
            for (const msg of chronological) {
              chatMessages.push({
                role: msg.role as string,
                content: msg.content,
              });
            }
          }
        } catch {
          // Non-fatal
        }
      }

      // 4. Inject campaign config if present
      if (task.campaignConfig) {
        chatMessages.push({
          role: "system",
          content: `CAMPAIGN CONFIGURATION (use this data, do NOT guess):\n${JSON.stringify(task.campaignConfig, null, 2)}`,
        });
      }

      // 5. Add the task's prompt as the user message
      chatMessages.push({ role: "user", content: task.prompt });

      // ── Resolve model: task config → team agent → team → default ─────
      let resolvedModel = task.agentConfig.model || task.campaignConfig?.agentModels?.nexus || "openai/gpt-4o";
      let resolvedTools = task.agentConfig.enabledTools;

      if (task.teamAgentId) {
        try {
          const teamAgent = await ctx.runQuery(
            internal.scheduledTaskRunner.getTeamAgentInternal,
            { agentId: task.teamAgentId }
          );
          if (teamAgent && teamAgent.isEnabled) {
            resolvedModel = teamAgent.modelId;
            // Update team agent status to "working"
            await ctx.runMutation(
              internal.scheduledTaskRunner.updateTeamAgentStatus,
              {
                agentId: task.teamAgentId,
                status: "working",
                currentTask: task.name,
                currentProjectId: task.projectId,
              }
            );
          }
        } catch (err) {
          console.error("[scheduler] Failed to resolve team agent:", err);
        }
      }

      const response = await fetch(`${appUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Scheduler-Secret":
            process.env.SCHEDULER_INTERNAL_SECRET || "",
        },
        body: JSON.stringify({
          messages: chatMessages,
          agentType: task.agentConfig.agentType,
          modelId: resolvedModel,
          enabledTools: resolvedTools,
          organizationId: task.organizationId,
          projectId: task.projectId,
          campaignConfig: task.campaignConfig,
          taskId: args.taskId,
        }),
      });

      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        await ctx.runMutation(
          internal.scheduledTaskRunner.saveExecutionResult,
          {
            taskId: args.taskId,
            organizationId: task.organizationId,
            status: "failed",
            error: `HTTP ${response.status}: ${errorText.slice(0, 500)}`,
            durationMs,
          }
        );
        return;
      }

      // Parse the AI SDK data stream to extract clean text
      let resultText = "";
      try {
        const rawStream = await response.text();
        resultText = parseDataStreamText(rawStream);
        if (!resultText) {
          resultText = `[No text in stream] First 500 chars: ${rawStream.slice(0, 500)}`;
        }
      } catch (parseErr: any) {
        resultText = `[Stream parse error: ${parseErr.message?.slice(0, 200)}] Pipeline likely completed — check leads page for results.`;
      }

      const finalDurationMs = Date.now() - startTime;
      await ctx.runMutation(
        internal.scheduledTaskRunner.saveExecutionResult,
        {
          taskId: args.taskId,
          organizationId: task.organizationId,
          status: "success",
          result: resultText.slice(0, 5000),
          durationMs: finalDurationMs,
        }
      );

      // Reset team agent status to idle
      if (task.teamAgentId) {
        try {
          await ctx.runMutation(
            internal.scheduledTaskRunner.updateTeamAgentStatus,
            { agentId: task.teamAgentId, status: "idle" }
          );
        } catch {
          // Non-fatal
        }
      }
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      await ctx.runMutation(
        internal.scheduledTaskRunner.saveExecutionResult,
        {
          taskId: args.taskId,
          organizationId: task.organizationId,
          status: "failed",
          error: err.message?.slice(0, 500) || "Unknown execution error",
          durationMs,
        }
      );

      // Reset team agent status on error
      if (task.teamAgentId) {
        try {
          await ctx.runMutation(
            internal.scheduledTaskRunner.updateTeamAgentStatus,
            {
              agentId: task.teamAgentId,
              status: "error",
              currentTask: err.message?.slice(0, 200),
            }
          );
        } catch {
          // Non-fatal
        }
      }
    }
  },
});

// ── executeHeartbeat ─────────────────────────────────────────────────
// Separate action for heartbeat execution — does NOT use scheduledTasks table.

export const executeHeartbeat = internalAction({
  args: {
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    prompt: v.string(),
    agentType: v.optional(v.string()),
    modelId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();

    try {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      const chatMessages: Array<{ role: string; content: string }> = [];

      // Inject session summary
      try {
        const session = await ctx.runQuery(
          internal.scheduledTaskRunner.getLatestSession,
          { projectId: args.projectId }
        );
        if (session?.summary) {
          chatMessages.push({
            role: "system",
            content: `[Session Context] ${session.summary}`,
          });
        }
      } catch {
        // Non-fatal
      }

      // Inject recent messages
      try {
        const recentMessages = await ctx.runQuery(
          internal.scheduledTaskRunner.getRecentProjectMessages,
          { projectId: args.projectId, limit: 6 }
        );
        if (recentMessages && recentMessages.length > 0) {
          const chronological = [...recentMessages].reverse();
          for (const msg of chronological) {
            chatMessages.push({
              role: msg.role as string,
              content: msg.content,
            });
          }
        }
      } catch {
        // Non-fatal
      }

      chatMessages.push({ role: "user", content: args.prompt });

      const response = await fetch(`${appUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Scheduler-Secret":
            process.env.SCHEDULER_INTERNAL_SECRET || "",
        },
        body: JSON.stringify({
          messages: chatMessages,
          agentType: args.agentType || "general",
          modelId: args.modelId,
          organizationId: args.organizationId,
          projectId: args.projectId,
        }),
      });

      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        console.error(
          `[heartbeat] Failed for project ${args.projectId}: HTTP ${response.status}`
        );
        return;
      }

      const rawStream = await response.text();
      const resultText = parseDataStreamText(rawStream);
      console.log(
        `[heartbeat] Project ${args.projectId} completed in ${durationMs}ms: ${resultText.slice(0, 200)}`
      );
    } catch (err: any) {
      console.error(
        `[heartbeat] Error for project ${args.projectId}:`,
        err.message
      );
    }
  },
});

// ── processHeartbeats ────────────────────────────────────────────────
// Called by cron every 30 minutes. Checks projects with heartbeat enabled
// and runs their heartbeat checklist through the agent.

export const processHeartbeats = internalMutation({
  handler: async (ctx) => {
    const currentHour = new Date().getUTCHours();

    // Find all active projects (we'll filter by heartbeat config in memory)
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organizationId_status")
      .collect();

    const heartbeatProjects = projects.filter((p) => {
      const config = p.agentConfig as any;
      if (!config?.heartbeatEnabled || !config?.heartbeatChecklist)
        return false;

      // Check active hours (if configured)
      if (config.heartbeatActiveHours) {
        const { start, end } = config.heartbeatActiveHours;
        if (start <= end) {
          if (currentHour < start || currentHour >= end) return false;
        } else {
          // Wraps around midnight
          if (currentHour < start && currentHour >= end) return false;
        }
      }

      return true;
    });

    for (const project of heartbeatProjects) {
      const config = project.agentConfig as any;
      const prompt = `## Heartbeat Check\n\nReview the following checklist and take action on any items that need attention:\n\n${config.heartbeatChecklist}\n\nFor each item, briefly report its current status. If any item requires action, take it.`;

      await ctx.scheduler.runAfter(
        0,
        internal.scheduledTaskRunner.executeHeartbeat,
        {
          projectId: project._id,
          organizationId: project.organizationId,
          prompt,
          agentType: config.agentType || "general",
          modelId: config.modelId,
        }
      );
    }

    if (heartbeatProjects.length > 0) {
      console.log(
        `[heartbeat] Dispatched ${heartbeatProjects.length} project(s)`
      );
    }
  },
});

// ── Internal helpers ─────────────────────────────────────────────────

export const getTaskInternal = internalQuery({
  args: { taskId: v.id("scheduledTasks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.taskId);
  },
});

// Fetch recent messages for a project (for context injection)
export const getRecentProjectMessages = internalQuery({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_projectId", (q) =>
        q.eq("projectId", args.projectId)
      )
      .order("desc")
      .take(args.limit ?? 10);
  },
});

// Fetch the latest session for a project (for summary context)
export const getLatestSession = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_projectId", (q) =>
        q.eq("projectId", args.projectId)
      )
      .order("desc")
      .take(1);
    return sessions[0] ?? null;
  },
});

// Fetch the last execution result for a task
export const getLastExecutionResult = internalQuery({
  args: { taskId: v.id("scheduledTasks") },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("taskExecutionResults")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(1);
    return results[0] ?? null;
  },
});

// Fetch a team agent by ID (for scheduled task execution)
export const getTeamAgentInternal = internalQuery({
  args: { agentId: v.id("teamAgents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.agentId);
  },
});

// Update team agent status (for scheduled task execution)
export const updateTeamAgentStatus = internalMutation({
  args: {
    agentId: v.id("teamAgents"),
    status: v.union(
      v.literal("idle"),
      v.literal("working"),
      v.literal("waiting"),
      v.literal("error")
    ),
    currentTask: v.optional(v.string()),
    currentProjectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.agentId, {
      status: args.status,
      currentTask: args.currentTask,
      currentProjectId: args.currentProjectId,
      lastActiveAt: Date.now(),
    });
  },
});

export const saveExecutionResult = internalMutation({
  args: {
    taskId: v.id("scheduledTasks"),
    organizationId: v.id("organizations"),
    status: v.union(v.literal("success"), v.literal("failed")),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return; // Task was deleted, silently skip

    await ctx.db.insert("taskExecutionResults", {
      taskId: args.taskId,
      organizationId: args.organizationId,
      status: args.status,
      result: args.result,
      error: args.error,
      executedAt: Date.now(),
      durationMs: args.durationMs,
    });

    // Clear the isRunning guard
    await ctx.db.patch(args.taskId, { isRunning: false });
  },
});

// ── Pipeline step tracking ───────────────────────────────────────────

export const updatePipelineStep = mutation({
  args: {
    taskId: v.id("scheduledTasks"),
    step: v.number(),
    agentName: v.string(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("done"), v.literal("failed"), v.literal("skipped")),
    result: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return;

    const steps = task.pipelineSteps ?? [];
    const existing = steps.findIndex((s) => s.step === args.step);
    const entry = {
      step: args.step,
      agentName: args.agentName,
      status: args.status,
      startedAt: args.status === "running" ? Date.now() : (existing >= 0 ? steps[existing].startedAt : undefined),
      completedAt: args.status === "done" || args.status === "failed" ? Date.now() : undefined,
      result: args.result,
    };

    if (existing >= 0) {
      steps[existing] = entry;
    } else {
      steps.push(entry);
    }

    await ctx.db.patch(args.taskId, {
      currentPipelineStep: args.step,
      pipelineSteps: steps,
    });
  },
});

export const initializePipeline = mutation({
  args: { taskId: v.id("scheduledTasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return; // Task was deleted, silently skip
    const STEPS = [
      { step: 0, agentName: "Scraping Agent" },
      { step: 1, agentName: "Research Agent" },
      { step: 2, agentName: "Cold Email Agent" },
      { step: 3, agentName: "Meta Outreach Agent" },
      { step: 4, agentName: "LinkedIn Outreach Agent" },
      { step: 5, agentName: "Social Presence Agent" },
      { step: 6, agentName: "Marketing Manager" },
    ];
    await ctx.db.patch(taskId, {
      currentPipelineStep: -1,
      pipelineSteps: STEPS.map((s) => ({ ...s, status: "pending" as const })),
    });
  },
});

// ── Public CRUD ──────────────────────────────────────────────────────

const campaignConfigValidator = v.optional(v.object({
  vertical: v.optional(v.string()),
  verticals: v.optional(v.array(v.string())),
  serviceOffering: v.optional(v.string()),
  serviceOfferingDetails: v.optional(v.string()),
  states: v.optional(v.array(v.string())),
  cityCount: v.optional(v.number()),
  dailyResults: v.number(),
  dataFields: v.array(v.string()),
  outreachChannels: v.array(v.string()),
  channelConfig: v.optional(v.object({
    email: v.optional(v.object({
      enabled: v.optional(v.boolean()),
      dailyLimit: v.optional(v.number()),
      selectedAccounts: v.optional(v.array(v.string())),
    })),
    meta: v.optional(v.object({
      enabled: v.optional(v.boolean()),
      dailyLimit: v.optional(v.number()),
      selectedAccounts: v.optional(v.array(v.string())),
    })),
    linkedin: v.optional(v.object({
      enabled: v.optional(v.boolean()),
      dailyLimit: v.optional(v.number()),
      selectedAccounts: v.optional(v.array(v.string())),
    })),
  })),
  agentModels: v.optional(v.any()),
  emailTemplate: v.optional(v.string()),
  socialPresence: v.optional(v.object({
    findRedditGroups: v.optional(v.boolean()),
    joinRedditGroups: v.optional(v.boolean()),
    postToReddit: v.optional(v.boolean()),
    redditPostCount: v.optional(v.number()),
    redditPostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
    findMetaGroups: v.optional(v.boolean()),
    joinMetaGroups: v.optional(v.boolean()),
    postToMetaGroups: v.optional(v.boolean()),
    metaPostCount: v.optional(v.number()),
    metaPostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
    findLinkedinGroups: v.optional(v.boolean()),
    joinLinkedinGroups: v.optional(v.boolean()),
    postToLinkedinGroups: v.optional(v.boolean()),
    linkedinPostCount: v.optional(v.number()),
    linkedinPostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
    // Nextdoor
    findNextdoor: v.optional(v.boolean()),
    joinNextdoor: v.optional(v.boolean()),
    postToNextdoor: v.optional(v.boolean()),
    nextdoorPostCount: v.optional(v.number()),
    nextdoorPostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
    // Quora
    findQuora: v.optional(v.boolean()),
    followQuora: v.optional(v.boolean()),
    postToQuora: v.optional(v.boolean()),
    quoraPostCount: v.optional(v.number()),
    quoraPostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
    // X / Twitter
    findTwitter: v.optional(v.boolean()),
    followTwitter: v.optional(v.boolean()),
    postToTwitter: v.optional(v.boolean()),
    twitterPostCount: v.optional(v.number()),
    twitterPostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
    // Discord
    findDiscord: v.optional(v.boolean()),
    joinDiscord: v.optional(v.boolean()),
    postToDiscord: v.optional(v.boolean()),
    discordPostCount: v.optional(v.number()),
    discordPostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
    // YouTube
    findYoutube: v.optional(v.boolean()),
    subscribeYoutube: v.optional(v.boolean()),
    postToYoutube: v.optional(v.boolean()),
    youtubePostCount: v.optional(v.number()),
    youtubePostFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
  })),
}));

function assertValidCampaignConfig(
  campaignConfig:
    | {
        dailyResults: number;
      }
    | undefined
) {
  if (!campaignConfig) return;
  if (DAILY_RESULTS_TARGET_SET.has(campaignConfig.dailyResults)) return;
  throw new Error(
    `Invalid daily results target: ${campaignConfig.dailyResults}. Allowed values: ${DAILY_RESULTS_TARGET_OPTIONS.join(", ")}`
  );
}

export const createTask = mutation({
  args: {
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    description: v.optional(v.string()),
    prompt: v.string(),
    agentConfig: v.object({
      agentType: v.string(),
      model: v.optional(v.string()),
      enabledTools: v.optional(v.array(v.string())),
    }),
    teamAgentId: v.optional(v.id("teamAgents")),
    schedule: v.object({
      type: v.union(v.literal("cron"), v.literal("once")),
      cronExpression: v.optional(v.string()),
      runAt: v.optional(v.number()),
    }),
    campaignConfig: campaignConfigValidator,
  },
  handler: async (ctx, args) => {
    assertValidCampaignConfig(args.campaignConfig);

    // Enforce plan limits
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    const existingTasks = await ctx.db
      .query("scheduledTasks")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const activeTasks = existingTasks.filter(
      (t) => t.status === "active" || t.status === "paused"
    );
    if (activeTasks.length >= org.maxScheduledTasks) {
      throw new Error(
        `Plan limit reached: maximum ${org.maxScheduledTasks} scheduled tasks. Upgrade your plan for more.`
      );
    }

    const nextRunAt =
      args.schedule.type === "once"
        ? args.schedule.runAt || Date.now()
        : calculateNextRun(args.schedule);

    const taskId = await ctx.db.insert("scheduledTasks", {
      organizationId: args.organizationId,
      createdBy: args.createdBy,
      projectId: args.projectId,
      name: args.name,
      description: args.description,
      prompt: args.prompt,
      agentConfig: args.agentConfig,
      teamAgentId: args.teamAgentId,
      schedule: args.schedule,
      campaignConfig: args.campaignConfig,
      status: "active",
      nextRunAt,
      runCount: 0,
    });

    // Seed city campaigns for lead gen tasks (idempotent — skips if already seeded)
    if (args.agentConfig.agentType === "lead_gen_agent") {
      await ctx.scheduler.runAfter(
        0,
        internal.cityCampaigns.initializeInternal,
        { organizationId: args.organizationId }
      );
    }

    return taskId;
  },
});

export const updateTask = mutation({
  args: {
    taskId: v.id("scheduledTasks"),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("completed"),
        v.literal("failed")
      )
    ),
    name: v.optional(v.string()),
    prompt: v.optional(v.string()),
    description: v.optional(v.string()),
    agentConfig: v.optional(
      v.object({
        agentType: v.string(),
        model: v.optional(v.string()),
        enabledTools: v.optional(v.array(v.string())),
      })
    ),
    schedule: v.optional(
      v.object({
        type: v.union(v.literal("cron"), v.literal("once")),
        cronExpression: v.optional(v.string()),
        runAt: v.optional(v.number()),
      })
    ),
    teamAgentId: v.optional(v.id("teamAgents")),
    projectId: v.optional(v.id("projects")),
    campaignConfig: campaignConfigValidator,
  },
  handler: async (ctx, args) => {
    assertValidCampaignConfig(args.campaignConfig);

    const { taskId, ...updates } = args;
    const patch: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patch[key] = value;
    }
    // Recalculate nextRunAt if schedule changed
    if (updates.schedule) {
      patch.nextRunAt = calculateNextRun(updates.schedule);
    }
    await ctx.db.patch(taskId, patch);
  },
});

export const deleteTask = mutation({
  args: { taskId: v.id("scheduledTasks") },
  handler: async (ctx, args) => {
    // Read the task before deleting so we know its type and org
    const task = await ctx.db.get(args.taskId);
    await ctx.db.delete(args.taskId);

    // If this was a lead gen task, check if any remain — if not, remove all team agents
    if (task && task.agentConfig?.agentType === "lead_gen_agent") {
      const remaining = await ctx.db
        .query("scheduledTasks")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", task.organizationId)
        )
        .collect();
      const remainingLeadGen = remaining.filter(
        (t) => t.agentConfig?.agentType === "lead_gen_agent"
      );
      if (remainingLeadGen.length === 0) {
        // Clean up all team agents for this org
        const team = await ctx.db
          .query("agentTeams")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", task.organizationId)
          )
          .first();
        if (team) {
          const agents = await ctx.db
            .query("teamAgents")
            .withIndex("by_agentTeamId", (q) =>
              q.eq("agentTeamId", team._id)
            )
            .collect();
          for (const agent of agents) {
            await ctx.db.delete(agent._id);
          }
          // Also delete the team itself so hasTeam becomes false
          await ctx.db.delete(team._id);
        }
      }
    }
  },
});

export const runNow = mutation({
  args: { taskId: v.id("scheduledTasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (task.isRunning) throw new Error("Task is already running");

    // Initialize pipeline tracking for lead gen tasks
    const PIPELINE_STEPS = [
      { step: 0, agentName: "Scraping Agent", status: "pending" as const },
      { step: 1, agentName: "Research Agent", status: "pending" as const },
      { step: 2, agentName: "Cold Email Agent", status: "pending" as const },
      { step: 3, agentName: "Meta Outreach Agent", status: "pending" as const },
      { step: 4, agentName: "LinkedIn Outreach Agent", status: "pending" as const },
      { step: 5, agentName: "Social Presence Agent", status: "pending" as const },
      { step: 6, agentName: "Marketing Manager", status: "pending" as const },
    ];

    await ctx.db.patch(args.taskId, {
      isRunning: true,
      currentPipelineStep: -1,
      pipelineSteps: task.agentConfig?.agentType === "lead_gen_agent" ? PIPELINE_STEPS : undefined,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.scheduledTaskRunner.executeTask,
      { taskId: args.taskId }
    );
  },
});

export const listByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scheduledTasks")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .collect();
  },
});

export const getExecutionHistory = query({
  args: {
    taskId: v.id("scheduledTasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskExecutionResults")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(args.limit ?? 10);
  },
});

// Return the single most-recent execution for a task — for the error banner on the card
export const getLatestExecution = query({
  args: { taskId: v.id("scheduledTasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskExecutionResults")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .first();
  },
});

// Scheduler health across the whole org: success/fail counts over last 24h, plus
// the timestamp of the last successful tick so the UI can flag a broken scheduler.
export const getSchedulerHealth = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await authorizeOrgMember(ctx, args.organizationId);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const executions = await ctx.db
      .query("taskExecutionResults")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(100);
    const recent = executions.filter((e) => e.executedAt >= since);
    const lastSuccess = executions.find((e) => e.status === "success");
    const lastFailure = executions.find((e) => e.status === "failed");
    // Consecutive failures — count from most recent until we hit a success
    let consecutiveFailures = 0;
    for (const e of executions) {
      if (e.status === "failed") consecutiveFailures++;
      else break;
    }
    return {
      totalLast24h: recent.length,
      successLast24h: recent.filter((e) => e.status === "success").length,
      failLast24h: recent.filter((e) => e.status === "failed").length,
      lastSuccessAt: lastSuccess?.executedAt ?? null,
      lastFailureAt: lastFailure?.executedAt ?? null,
      lastFailureError: lastFailure?.error?.slice(0, 500) ?? null,
      consecutiveFailures,
    };
  },
});

// ── Helpers ──────────────────────────────────────────────────────────

const DAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Calculate the next run time from a schedule config.
 * Supports:
 *   - Simple intervals: "every_5m", "every_15m", "every_30m", "every_1h", "every_6h", "every_12h", "every_24h"
 *   - Day-of-week: "daily_9am", "weekdays_9am", "monday_10am", "friday_17pm"
 */
function calculateNextRun(
  schedule: { type: string; cronExpression?: string; runAt?: number }
): number | undefined {
  if (schedule.type === "once") return undefined;

  const expr = schedule.cronExpression || "every_1h";

  // Simple interval parsing
  const intervalMap: Record<string, number> = {
    every_5m: 5 * 60 * 1000,
    every_15m: 15 * 60 * 1000,
    every_30m: 30 * 60 * 1000,
    every_1h: 60 * 60 * 1000,
    every_6h: 6 * 60 * 60 * 1000,
    every_12h: 12 * 60 * 60 * 1000,
    every_24h: 24 * 60 * 60 * 1000,
  };

  if (intervalMap[expr]) {
    return Date.now() + intervalMap[expr];
  }

  // Day-of-week patterns: "weekdays_9am", "monday_10am", "daily_14pm"
  const dayTimeMatch = expr.match(
    /^(weekdays|daily|monday|tuesday|wednesday|thursday|friday|saturday|sunday)_(\d{1,2})(am|pm)?$/i
  );
  if (dayTimeMatch) {
    const [, daySpec, hourStr, ampm] = dayTimeMatch;
    let hour = parseInt(hourStr);
    if (ampm?.toLowerCase() === "pm" && hour < 12) hour += 12;
    if (ampm?.toLowerCase() === "am" && hour === 12) hour = 0;

    const now = new Date();
    const target = new Date(now);
    target.setUTCHours(hour, 0, 0, 0);

    const spec = daySpec.toLowerCase();

    if (spec === "daily") {
      if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
    } else if (spec === "weekdays") {
      // Advance to next occurrence that is Mon-Fri
      if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
      while (target.getUTCDay() === 0 || target.getUTCDay() === 6) {
        target.setUTCDate(target.getUTCDate() + 1);
      }
    } else if (DAYS[spec] !== undefined) {
      const targetDay = DAYS[spec];
      if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
      while (target.getUTCDay() !== targetDay) {
        target.setUTCDate(target.getUTCDate() + 1);
      }
    }

    return target.getTime();
  }

  // Fallback: 1 hour
  return Date.now() + 60 * 60 * 1000;
}
