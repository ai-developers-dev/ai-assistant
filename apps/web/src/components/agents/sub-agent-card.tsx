"use client";

import type { Doc } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { getSpecialtyLabel } from "@/lib/agents/specialties";
import { AGENT_SPECIALTIES } from "@/lib/agents/specialties";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Search,
  Code,
  Image,
  Globe,
  BarChart,
  FileText,
  CheckSquare,
  Zap,
  Video,
  Presentation,
  Bot,
  Target,
  TrendingUp,
  Share2,
  Megaphone,
  Headphones,
} from "lucide-react";

const ICON_MAP: Record<string, any> = {
  Search,
  Code,
  Image,
  Globe,
  BarChart,
  FileText,
  CheckSquare,
  Zap,
  Video,
  Presentation,
  Sparkles,
  Bot,
  Target,
  TrendingUp,
  Share2,
  Megaphone,
  Headphones,
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  idle: { color: "bg-emerald-500", label: "Idle" },
  working: { color: "bg-amber-500 animate-pulse", label: "Working" },
  waiting: { color: "bg-blue-500", label: "Waiting" },
  error: { color: "bg-red-500", label: "Error" },
};

interface SubAgentCardProps {
  agent: Doc<"teamAgents">;
  onClick?: () => void;
  /** Credential status: "connected" | "missing" | undefined */
  credentialStatus?: "connected" | "missing";
  /** Short description of scheduled duties, e.g. "10 messages/day" */
  taskSummary?: string;
}

export function SubAgentCard({ agent, onClick, credentialStatus, taskSummary }: SubAgentCardProps) {
  const specialty = AGENT_SPECIALTIES.find((s) => s.id === agent.specialty);
  const SpecialtyIcon = ICON_MAP[specialty?.icon || "Sparkles"] || Sparkles;
  const statusConfig = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;

  const lastActive = agent.lastActiveAt
    ? formatRelativeTime(agent.lastActiveAt)
    : null;

  // Shorten model name: "deepseek-chat-v3-0324" → "deepseek-v3"
  const modelShort = formatModelName(agent.modelId);

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col rounded-xl border p-4 text-left transition-all hover:border-primary/30 hover:bg-accent/20 w-full h-full",
        agent.isEnabled
          ? "border-border bg-card/60"
          : "border-border/50 bg-muted/10 opacity-50"
      )}
    >
      {/* Top: Name + Status */}
      <div className="flex items-center justify-between w-full mb-3">
        <span className="font-semibold text-sm truncate">{agent.name}</span>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span className={cn("h-2 w-2 rounded-full", statusConfig.color)} />
          <span className="text-[10px] text-muted-foreground">
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Middle: Icon + Specialty */}
      <div className="flex items-center gap-3 mb-auto">
        <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <SpecialtyIcon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <Badge variant="secondary" className="text-[10px] capitalize">
            {getSpecialtyLabel(agent.specialty)}
          </Badge>
          {!agent.isEnabled && (
            <Badge variant="secondary" className="text-[9px] ml-1">
              Off
            </Badge>
          )}
        </div>
      </div>

      {/* Credential status + task summary */}
      {(credentialStatus || taskSummary) && (
        <div className="mt-2.5 space-y-1 w-full">
          {credentialStatus === "missing" && (
            <p className="text-[10px] text-red-600 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
              No login configured
            </p>
          )}
          {credentialStatus === "connected" && (
            <p className="text-[10px] text-emerald-700 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
              Credentials connected
            </p>
          )}
          {taskSummary && (
            <p className="text-[10px] text-muted-foreground/70">{taskSummary}</p>
          )}
        </div>
      )}

      {/* Current task (if working) */}
      {agent.currentTask && agent.status !== "idle" && (
        <p className="text-[11px] text-muted-foreground/70 mt-3 italic truncate w-full">
          {agent.currentTask}
        </p>
      )}

      {/* Footer: model + last active — always at bottom */}
      <div className="flex items-center justify-between w-full mt-3 pt-3 border-t border-border/30">
        <span className="text-[10px] text-muted-foreground/50 truncate">
          {modelShort}
        </span>
        {lastActive && (
          <span className="text-[10px] text-muted-foreground/40 shrink-0 ml-2">
            {lastActive}
          </span>
        )}
      </div>
    </button>
  );
}

function formatModelName(modelId: string): string {
  const name = modelId.split("/").pop() || modelId;
  // Shorten common long names
  return name
    .replace("deepseek-chat-v3-0324", "deepseek-v3")
    .replace("claude-haiku-4.5", "haiku-4.5")
    .replace("claude-sonnet-4-", "sonnet-4.")
    .replace("claude-opus-4-", "opus-4.")
    .replace("gpt-4o-mini", "gpt-4o-mini")
    .replace("gpt-4o-2024", "gpt-4o");
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
