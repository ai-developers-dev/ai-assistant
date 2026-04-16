"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  X,
  Loader2,
  Circle,
  ChevronDown,
  ChevronRight,
  Target,
  Brain,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";

// ─── Types matching the tool result shapes ──────────────────────────

interface PlanStep {
  id: string;
  description: string;
  toolToUse?: string;
  status: string;
  result?: string;
}

interface AgentPlanData {
  __agentPlan: boolean;
  planId: string;
  goal: string;
  steps: PlanStep[];
  instruction?: string;
}

interface PlanUpdateData {
  __planUpdate: boolean;
  planId: string;
  progress: { completed: number; failed: number; total: number };
  steps: PlanStep[];
  nextStep?: { id: string; description: string } | null;
}

interface AgentReflectionData {
  __agentReflection: boolean;
  planId: string;
  status: string;
  assessment: {
    goalAchieved: boolean;
    confidenceLevel: "high" | "medium" | "low";
    keyFindings: string[];
    gaps: string[];
  };
  instruction?: string;
}

// ─── Helper: merge plan + all update invocations ────────────────────

function getLatestSteps(
  planData: AgentPlanData,
  updates: PlanUpdateData[]
): PlanStep[] {
  if (updates.length === 0) return planData.steps;
  // The last update_plan result has the most current step state
  return updates[updates.length - 1].steps;
}

function getProgress(
  steps: PlanStep[]
): { completed: number; failed: number; total: number } {
  return {
    completed: steps.filter(
      (s) => s.status === "completed" || s.status === "skipped"
    ).length,
    failed: steps.filter((s) => s.status === "failed").length,
    total: steps.length,
  };
}

// ─── Step status icon ───────────────────────────────────────────────

function StepIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <Check className="h-3.5 w-3.5 text-green-500" />;
    case "failed":
      return <X className="h-3.5 w-3.5 text-destructive" />;
    case "skipped":
      return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
    case "in_progress":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    default:
      return <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />;
  }
}

// ─── AgentPlanDisplay ───────────────────────────────────────────────

export function AgentPlanDisplay({
  planData,
  updates,
  isStreaming,
}: {
  planData: AgentPlanData;
  updates: PlanUpdateData[];
  isStreaming?: boolean;
}) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const steps = getLatestSteps(planData, updates);
  const progress = getProgress(steps);
  const progressPercent =
    steps.length > 0 ? Math.round((progress.completed / steps.length) * 100) : 0;
  const isActive =
    isStreaming && progress.completed + progress.failed < steps.length;

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  return (
    <div className="my-2 rounded-lg border border-border bg-muted/30 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        <Target className="h-4 w-4 text-primary shrink-0" />
        <span className="text-xs font-medium flex-1 truncate">
          {planData.goal}
        </span>
        {isActive ? (
          <Badge variant="secondary" className="text-[10px] gap-1 px-1.5">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            In progress
          </Badge>
        ) : progress.completed === steps.length && steps.length > 0 ? (
          <Badge
            variant="secondary"
            className="text-[10px] gap-1 px-1.5 bg-green-500/10 text-green-500"
          >
            <Check className="h-2.5 w-2.5" />
            Complete
          </Badge>
        ) : null}
      </div>

      {/* Progress bar */}
      <div className="px-3 pb-2">
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              progress.failed > 0
                ? "bg-amber-500"
                : "bg-primary"
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-muted-foreground">
            {progress.completed}/{steps.length} steps
          </span>
          {progress.failed > 0 && (
            <span className="text-[10px] text-destructive">
              {progress.failed} failed
            </span>
          )}
        </div>
      </div>

      {/* Steps checklist */}
      <div className="border-t border-border">
        {steps.map((step) => {
          const isExpanded = expandedSteps.has(step.id);
          const hasResult = !!step.result;

          return (
            <div key={step.id} className="border-b border-border last:border-b-0">
              <button
                onClick={() => hasResult && toggleStep(step.id)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-left",
                  hasResult && "hover:bg-muted/50 cursor-pointer",
                  !hasResult && "cursor-default"
                )}
              >
                <StepIcon status={step.status} />
                <span
                  className={cn(
                    "text-xs flex-1",
                    step.status === "completed"
                      ? "text-muted-foreground"
                      : step.status === "failed"
                        ? "text-destructive"
                        : step.status === "pending"
                          ? "text-muted-foreground/60"
                          : "text-foreground font-medium"
                  )}
                >
                  {step.description}
                </span>
                {hasResult && (
                  <span className="shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </span>
                )}
              </button>
              {isExpanded && step.result && (
                <div className="px-3 pb-2 pl-8">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {step.result}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AgentReflectionDisplay ─────────────────────────────────────────

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-green-500/10 text-green-500",
  medium: "bg-amber-500/10 text-amber-500",
  low: "bg-destructive/10 text-destructive",
};

export function AgentReflectionDisplay({
  reflectionData,
}: {
  reflectionData: AgentReflectionData;
}) {
  const { assessment } = reflectionData;

  return (
    <div className="my-2 rounded-lg border border-border bg-muted/30 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        <Brain className="h-4 w-4 text-violet-400 shrink-0" />
        <span className="text-xs font-medium">Reflection</span>
        <Badge
          variant="secondary"
          className={cn(
            "text-[10px] px-1.5 ml-auto",
            CONFIDENCE_STYLES[assessment.confidenceLevel] || ""
          )}
        >
          {assessment.confidenceLevel} confidence
        </Badge>
      </div>

      <div className="border-t border-border px-3 py-2 space-y-2">
        {/* Key findings */}
        {assessment.keyFindings.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Key Findings
            </p>
            <ul className="space-y-0.5">
              {assessment.keyFindings.map((finding, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Check className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                  <span className="text-xs text-foreground">{finding}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Gaps */}
        {assessment.gaps.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Gaps Identified
            </p>
            <ul className="space-y-0.5">
              {assessment.gaps.map((gap, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                  <span className="text-xs text-muted-foreground">{gap}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
