import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { decryptProviderKeys, getProviderStatuses } from "@/lib/credentials/provider-keys";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Required credentials per agent type
const AGENT_REQUIRED_KEYS: Record<string, Array<{ name: string; key: string; required: boolean }>> = {
  lead_gen_agent: [
    { name: "Outscraper (Google Maps)", key: "outscraper", required: true },
    { name: "Firecrawl (Enrichment)", key: "firecrawl", required: true },
    { name: "Email (Gmail or Resend)", key: "warmed_email", required: false },
    { name: "Meta Login", key: "meta", required: false },
    { name: "LinkedIn Login", key: "linkedin", required: false },
  ],
};

// Model → provider mapping
const MODEL_PROVIDERS: Record<string, string> = {
  "anthropic/claude-sonnet-4-20250514": "anthropic",
  "anthropic/claude-haiku-4.5": "anthropic",
  "anthropic/claude-opus-4-20250514": "anthropic",
  "openai/gpt-4o": "openai",
  "openai/gpt-4o-mini": "openai",
  "google/gemini-2.0-flash": "google",
  "google/gemini-2.5-pro-preview-05-06": "google",
};

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warning";
  detail: string;
}

export async function POST(req: Request) {
  try {
    const { taskId, organizationId } = await req.json();

    if (!taskId || !organizationId) {
      return NextResponse.json({ error: "Missing taskId or organizationId" }, { status: 400 });
    }

    const checks: CheckResult[] = [];
    const suggestions: string[] = [];

    // ── Fetch task (via listByOrganization since no public getById) ──
    const allTasks = await convex.query(api.scheduledTaskRunner.listByOrganization, {
      organizationId: organizationId as Id<"organizations">,
    });
    const task = allTasks?.find((t: any) => t._id === taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // ── Fetch org ───────────────────────────────────────────────────
    const org = await convex.query(api.organizations.getById, {
      id: organizationId as Id<"organizations">,
    });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // ── 1. Task configuration check ────────────────────────────────
    const agentType = task.agentConfig?.agentType;
    if (!agentType) {
      checks.push({ name: "Agent Type", status: "fail", detail: "No agent type configured" });
    } else {
      checks.push({ name: "Agent Type", status: "pass", detail: agentType.replace(/_/g, " ") });
    }

    if (!task.prompt || task.prompt.trim().length < 10) {
      checks.push({ name: "Prompt", status: "warning", detail: "Prompt is very short or empty — will use default specialty prompt" });
    } else {
      checks.push({ name: "Prompt", status: "pass", detail: `${task.prompt.length} chars` });
    }

    // ── 2. Credentials check ───────────────────────────────────────
    const providerStatuses = getProviderStatuses(org.providerKeys as Record<string, any>);
    const decryptedKeys = decryptProviderKeys(org.providerKeys as Record<string, any>, organizationId);
    const requiredKeys = AGENT_REQUIRED_KEYS[agentType] || [];

    for (const req of requiredKeys) {
      const connected = providerStatuses.find(s => s.provider === req.key)?.connected;
      // Also check multi-account arrays for email
      const hasMultiAccount = req.key === "warmed_email"
        ? (decryptedKeys.gmail_smtp_accounts?.length ?? 0) > 0 || (decryptedKeys.warmed_email_accounts?.length ?? 0) > 0
        : req.key === "meta"
          ? (decryptedKeys.meta_accounts?.length ?? 0) > 0
          : req.key === "linkedin"
            ? (decryptedKeys.linkedin_accounts?.length ?? 0) > 0
            : false;

      if (connected || hasMultiAccount) {
        checks.push({ name: req.name, status: "pass", detail: "Connected" });
      } else if (req.required) {
        checks.push({ name: req.name, status: "fail", detail: "REQUIRED — not connected. Add this in Settings." });
      } else {
        checks.push({ name: req.name, status: "warning", detail: "Optional — not connected" });
        suggestions.push(`Connect ${req.name} to enable this capability`);
      }
    }

    // ── 3. Model availability ──────────────────────────────────────
    const modelId = task.agentConfig?.model || "anthropic/claude-haiku-4.5";
    const modelProvider = MODEL_PROVIDERS[modelId] || modelId.split("/")[0];
    const hasModelKey = modelProvider === "anthropic"
      ? !!decryptedKeys.anthropic
      : modelProvider === "openai"
        ? !!decryptedKeys.openai
        : modelProvider === "google"
          ? !!decryptedKeys.google
          : !!process.env.OPENROUTER_API_KEY || !!decryptedKeys.openrouter;

    if (hasModelKey) {
      checks.push({ name: "AI Model", status: "pass", detail: `${modelId} — API key available` });
    } else {
      // Check if there's a global env key
      const envKey = modelProvider === "anthropic" ? process.env.ANTHROPIC_API_KEY
        : modelProvider === "openai" ? process.env.OPENAI_API_KEY
        : modelProvider === "google" ? process.env.GOOGLE_GENERATIVE_AI_API_KEY
        : null;
      if (envKey) {
        checks.push({ name: "AI Model", status: "pass", detail: `${modelId} — using environment API key` });
      } else {
        checks.push({ name: "AI Model", status: "fail", detail: `${modelId} — no API key found for ${modelProvider}` });
      }
    }

    // ── 4. Team agent check ────────────────────────────────────────
    if (task.teamAgentId) {
      try {
        const teamAgents = await convex.query(api.teamAgents.listByOrganization, {
          organizationId: organizationId as Id<"organizations">,
        });
        const agent = teamAgents?.find((a: any) => a._id === task.teamAgentId);
        if (!agent) {
          checks.push({ name: "Team Agent", status: "fail", detail: "Assigned team agent not found" });
        } else if (!agent.isEnabled) {
          checks.push({ name: "Team Agent", status: "warning", detail: `"${agent.name}" is disabled — task will use default model` });
          suggestions.push(`Enable team agent "${agent.name}" for better performance`);
        } else {
          checks.push({ name: "Team Agent", status: "pass", detail: `"${agent.name}" — enabled` });
        }
      } catch {
        checks.push({ name: "Team Agent", status: "warning", detail: "Could not verify team agent" });
      }
    }

    // ── 5. Project check ───────────────────────────────────────────
    if (task.projectId) {
      try {
        const project = await convex.query(api.projects.getById, {
          projectId: task.projectId as Id<"projects">,
        });
        if (project) {
          checks.push({ name: "Project", status: "pass", detail: `"${project.name}" — context will be injected` });
        } else {
          checks.push({ name: "Project", status: "warning", detail: "Project not found — task will run without context" });
        }
      } catch {
        checks.push({ name: "Project", status: "warning", detail: "Could not verify project" });
      }
    }

    // ── 6. Scheduler secret check ──────────────────────────────────
    if (process.env.SCHEDULER_INTERNAL_SECRET) {
      checks.push({ name: "Scheduler Secret", status: "pass", detail: "SCHEDULER_INTERNAL_SECRET is set" });
    } else {
      checks.push({ name: "Scheduler Secret", status: "warning", detail: "SCHEDULER_INTERNAL_SECRET not set — task will count against usage quota" });
      suggestions.push("Set SCHEDULER_INTERNAL_SECRET env var so scheduled tasks don't count against your request quota");
    }

    // ── 7. Campaign config validation (lead_gen) ───────────────────
    if (agentType === "lead_gen_agent" && task.campaignConfig) {
      const cc = task.campaignConfig;
      if (!cc.verticals?.length) {
        checks.push({ name: "Verticals", status: "fail", detail: "No business verticals selected" });
      } else {
        checks.push({ name: "Verticals", status: "pass", detail: `${cc.verticals.length} vertical(s): ${cc.verticals.slice(0, 3).join(", ")}${cc.verticals.length > 3 ? "..." : ""}` });
      }

      if (!cc.states?.length) {
        checks.push({ name: "Target States", status: "warning", detail: "No states selected — will target all 50 states" });
      } else {
        checks.push({ name: "Target States", status: "pass", detail: `${cc.states.length} state(s)` });
      }

      const channels = cc.outreachChannels || [];
      if (channels.length === 0) {
        suggestions.push("Enable at least one outreach channel (email, Meta, or LinkedIn) to engage leads");
      } else {
        const channelDetails: string[] = [];
        if (channels.includes("email")) {
          const emailConfig = cc.channelConfig?.email;
          const accounts = emailConfig?.selectedAccounts?.length || 0;
          const limit = emailConfig?.dailyLimit || 50;
          channelDetails.push(`Email: ${accounts} account(s), ${limit * Math.max(accounts, 1)}/day`);
          if (accounts === 0) suggestions.push("Select email accounts in the outreach channel config");
        }
        if (channels.includes("meta")) {
          const metaConfig = cc.channelConfig?.meta;
          const accounts = metaConfig?.selectedAccounts?.length || 0;
          channelDetails.push(`Meta: ${accounts} account(s)`);
          if (accounts === 0) suggestions.push("Select Meta accounts in the outreach channel config");
        }
        if (channels.includes("linkedin")) {
          const liConfig = cc.channelConfig?.linkedin;
          const accounts = liConfig?.selectedAccounts?.length || 0;
          channelDetails.push(`LinkedIn: ${accounts} account(s)`);
          if (accounts === 0) suggestions.push("Select LinkedIn accounts in the outreach channel config");
        }
        checks.push({ name: "Outreach Channels", status: "pass", detail: channelDetails.join(" · ") });
      }
    }

    // ── 8. Execution test (sandboxed AI call) ──────────────────────
    let aiResponse: string | null = null;
    let toolsList: string[] = [];
    let executionStatus: "pass" | "fail" | "skipped" = "skipped";
    let executionError: string | null = null;

    const hasCriticalFailure = checks.some(c => c.status === "fail");

    if (!hasCriticalFailure) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const testPrompt = `[TEST MODE] This is a pre-flight test run. Do NOT execute any tools or take any real actions. Instead:
1. Confirm you understand the task described below
2. List ALL tools available to you
3. Describe step-by-step what you WOULD do in a real run
4. Flag any potential issues you see with the configuration

Task prompt:
${task.prompt.slice(0, 2000)}`;

        const response = await fetch(`${appUrl}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Scheduler-Secret": process.env.SCHEDULER_INTERNAL_SECRET || "",
            "X-Test-Mode": "true",
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: testPrompt }],
            agentType: agentType || "general",
            modelId: modelId,
            organizationId: organizationId,
            projectId: task.projectId,
            maxTokens: 800,
          }),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "Unknown");
          executionStatus = "fail";
          executionError = `HTTP ${response.status}: ${errText.slice(0, 300)}`;
          checks.push({ name: "AI Execution Test", status: "fail", detail: executionError });
        } else {
          // Parse Vercel AI SDK data stream
          const rawStream = await response.text();
          const lines = rawStream.split("\n");
          const textParts: string[] = [];
          for (const line of lines) {
            if (line.startsWith("0:")) {
              try {
                const parsed = JSON.parse(line.slice(2));
                if (typeof parsed === "string") textParts.push(parsed);
              } catch { /* skip */ }
            }
            // Extract tool call names from stream
            if (line.startsWith("9:") || line.startsWith("b:")) {
              try {
                const parsed = JSON.parse(line.slice(2));
                if (parsed?.toolName) toolsList.push(parsed.toolName);
              } catch { /* skip */ }
            }
          }
          aiResponse = textParts.join("").slice(0, 3000);
          executionStatus = "pass";
          checks.push({ name: "AI Execution Test", status: "pass", detail: `Model responded (${aiResponse.length} chars)` });
        }
      } catch (err: any) {
        executionStatus = "fail";
        executionError = err.message || "Unknown error";
        checks.push({ name: "AI Execution Test", status: "fail", detail: `Execution error: ${executionError}` });
      }
    } else {
      checks.push({ name: "AI Execution Test", status: "warning", detail: "Skipped — fix critical failures above first" });
    }

    // ── 9. Generate suggestions ────────────────────────────────────
    if (agentType === "lead_gen_agent") {
      const cc = task.campaignConfig;
      if ((cc?.dailyResults ?? 0) < 100) {
        suggestions.push("Consider increasing Daily Results Target for better data coverage");
      }
      if ((cc?.cityCount ?? 0) < 50) {
        suggestions.push("Consider increasing city count for broader geographic reach");
      }
    }

    // ── Overall status ─────────────────────────────────────────────
    const hasFail = checks.some(c => c.status === "fail");
    const hasWarning = checks.some(c => c.status === "warning");
    const overall = hasFail ? "fail" : hasWarning ? "warning" : "pass";

    return NextResponse.json({
      overall,
      checks,
      suggestions,
      execution: {
        status: executionStatus,
        aiResponse,
        toolsList,
        error: executionError,
      },
      task: {
        name: task.name,
        agentType,
        model: modelId,
        schedule: task.schedule,
      },
    });
  } catch (error: any) {
    console.error("[scheduled-tasks/test] Error:", error);
    return NextResponse.json({ error: error.message || "Test failed" }, { status: 500 });
  }
}
