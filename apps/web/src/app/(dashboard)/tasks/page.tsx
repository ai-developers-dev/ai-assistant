"use client";

import { useQuery, useMutation } from "convex/react";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  RefreshCw,
  GripVertical,
  ChevronRight,
  X,
  Clock,
  AlertCircle,
  Bot,
  Loader2,
} from "lucide-react";
import { useState, useCallback } from "react";

type Stage = "inbox" | "assigned" | "in_progress" | "review" | "quality_review" | "done";

const STAGES: { id: Stage; label: string; color: string; borderColor: string }[] = [
  { id: "inbox", label: "Inbox", color: "bg-zinc-500", borderColor: "border-zinc-500" },
  { id: "assigned", label: "Assigned", color: "bg-blue-500", borderColor: "border-blue-500" },
  { id: "in_progress", label: "In Progress", color: "bg-amber-500", borderColor: "border-amber-500" },
  { id: "review", label: "Review", color: "bg-rose-500", borderColor: "border-rose-500" },
  { id: "quality_review", label: "Quality Review", color: "bg-purple-500", borderColor: "border-purple-500" },
  { id: "done", label: "Done", color: "bg-emerald-500", borderColor: "border-emerald-500" },
];

const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  urgent: { color: "bg-red-500/20 text-red-600 border-red-500/30", label: "Urgent" },
  high: { color: "bg-orange-500/20 text-orange-700 border-orange-500/30", label: "High" },
  medium: { color: "bg-blue-500/20 text-blue-700 border-blue-500/30", label: "Medium" },
  low: { color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", label: "Low" },
};

const NEXT_STAGE: Record<Stage, Stage | null> = {
  inbox: "assigned",
  assigned: "in_progress",
  in_progress: "review",
  review: "quality_review",
  quality_review: "done",
  done: null,
};

export default function TasksPage() {
  const { org } = useEffectiveOrg();
  const tasks = useQuery(
    api.tasks.listByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );
  const agents = useQuery(
    api.teamAgents.listByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const team = useQuery(
    api.agentTeams.getByOrganizationForSettings,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const createTask = useMutation(api.tasks.create);
  const updateStage = useMutation(api.tasks.updateStage);
  const removeTask = useMutation(api.tasks.remove);
  const ensurePromptEngineer = useMutation(api.agentTeams.ensurePromptEngineer);

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [expandedTask, setExpandedTask] = useState<Id<"tasks"> | null>(null);

  const handleCreate = useCallback(async () => {
    if (!org?._id || !newTitle.trim()) return;
    await createTask({
      organizationId: org._id,
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      priority: newPriority,
      createdBy: "user",
    });
    // Ensure Prompt Engineer system agent exists whenever a task is created
    if (team) {
      ensurePromptEngineer({ organizationId: org._id, modelId: team.modelId }).catch(() => {});
    }
    setNewTitle("");
    setNewDescription("");
    setNewPriority("medium");
    setShowNewTask(false);
  }, [org?._id, newTitle, newDescription, newPriority, createTask, team, ensurePromptEngineer]);

  const handleAdvance = useCallback(
    async (taskId: Id<"tasks">, currentStage: Stage) => {
      const next = NEXT_STAGE[currentStage];
      if (!next) return;
      await updateStage({ taskId, stage: next });
    },
    [updateStage]
  );

  const handleMoveToStage = useCallback(
    async (taskId: Id<"tasks">, stage: Stage) => {
      await updateStage({ taskId, stage });
    },
    [updateStage]
  );

  if (!org) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tasksByStage = (stage: Stage) =>
    (tasks ?? [])
      .filter((t) => t.stage === stage)
      .sort((a, b) => {
        const pOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
      });

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Task Board</h1>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowNewTask(true)}
            size="sm"
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        </div>
      </div>

      {/* New Task Modal */}
      {showNewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Task</h2>
              <button
                onClick={() => setShowNewTask(false)}
                className="p-1 rounded-lg hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Task title..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <textarea
                placeholder="Description (optional)..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Priority:</span>
                {(["low", "medium", "high", "urgent"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setNewPriority(p)}
                    className={cn(
                      "px-2 py-1 rounded-md text-xs border transition-all",
                      newPriority === p
                        ? PRIORITY_CONFIG[p].color
                        : "border-border text-muted-foreground hover:border-muted-foreground/50"
                    )}
                  >
                    {PRIORITY_CONFIG[p].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNewTask(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!newTitle.trim()}
              >
                Create Task
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 h-full min-w-max pb-4">
          {STAGES.map((stage) => {
            const stageTasks = tasksByStage(stage.id);
            return (
              <div
                key={stage.id}
                className="flex flex-col w-[280px] shrink-0"
              >
                {/* Column Header */}
                <div
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-t-xl border-t-2",
                    stage.borderColor,
                    "bg-card/80 border border-border border-t-0"
                  )}
                  style={{ borderTopWidth: "3px", borderTopStyle: "solid" }}
                >
                  <span className="font-semibold text-sm">{stage.label}</span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 min-w-[20px] justify-center"
                  >
                    {stageTasks.length}
                  </Badge>
                </div>

                {/* Column Body */}
                <ScrollArea className="flex-1 border border-border border-t-0 rounded-b-xl bg-card/40">
                  <div className="p-2 space-y-2 min-h-[200px]">
                    {stageTasks.length === 0 ? (
                      <p className="text-xs text-muted-foreground/50 text-center py-8">
                        No tasks in {stage.label.toLowerCase()}
                      </p>
                    ) : (
                      stageTasks.map((task) => (
                        <TaskCard
                          key={task._id}
                          task={task}
                          isExpanded={expandedTask === task._id}
                          onToggle={() =>
                            setExpandedTask(
                              expandedTask === task._id ? null : task._id
                            )
                          }
                          onAdvance={() =>
                            handleAdvance(task._id, task.stage as Stage)
                          }
                          onMoveToStage={(s) => handleMoveToStage(task._id, s)}
                          onDelete={() => removeTask({ taskId: task._id })}
                          canAdvance={NEXT_STAGE[task.stage as Stage] !== null}
                          agents={agents ?? []}
                        />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  isExpanded,
  onToggle,
  onAdvance,
  onMoveToStage,
  onDelete,
  canAdvance,
  agents,
}: {
  task: Doc<"tasks">;
  isExpanded: boolean;
  onToggle: () => void;
  onAdvance: () => void;
  onMoveToStage: (stage: Stage) => void;
  onDelete: () => void;
  canAdvance: boolean;
  agents: Doc<"teamAgents">[];
}) {
  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
  const age = formatAge(task.createdAt);

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-background/80 transition-all hover:border-muted-foreground/30",
        isExpanded && "ring-1 ring-primary/20"
      )}
    >
      {/* Card Header */}
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium leading-tight line-clamp-2">
            {task.title}
          </span>
          <Badge
            variant="outline"
            className={cn("text-[9px] shrink-0 border", priority.color)}
          >
            {priority.label}
          </Badge>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-2">
          {task.assignedAgentName && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Bot className="h-3 w-3" />
              <span className="truncate max-w-[100px]">
                {task.assignedAgentName}
              </span>
            </div>
          )}
          <span className="text-[10px] text-muted-foreground/50 ml-auto">
            {age}
          </span>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-2">
          {task.description && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {task.description}
            </p>
          )}

          {task.tags && task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-[9px]"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Move to stage */}
          <div className="flex flex-wrap gap-1 pt-1">
            {STAGES.filter((s) => s.id !== task.stage).map((s) => (
              <button
                key={s.id}
                onClick={() => onMoveToStage(s.id)}
                className={cn(
                  "px-2 py-0.5 rounded text-[9px] border transition-colors hover:opacity-80",
                  s.borderColor,
                  "bg-transparent text-muted-foreground"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={onDelete}
              className="text-[10px] text-red-600 hover:text-red-300 transition-colors"
            >
              Delete
            </button>
            {canAdvance && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onAdvance}
                className="h-6 px-2 text-xs gap-1"
              >
                Advance
                <ChevronRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatAge(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
