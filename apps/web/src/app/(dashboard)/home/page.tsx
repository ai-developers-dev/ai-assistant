"use client";

import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../../convex/_generated/api";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { AGENT_SPECIALTIES } from "@/lib/agents/specialties";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  Bot,
  Users,
  ListChecks,
  Play,
  Pause,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  ArrowRight,
  HelpCircle,
  Info,
  AlertTriangle,
  Lightbulb,
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
  Target,
  TrendingUp,
  Share2,
  Megaphone,
  Headphones,
  Mail,
  Linkedin,
  ClipboardList,
  Folder,
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────

const SPECIALTY_ICON_MAP: Record<string, any> = {
  Search, Code, Image, Globe, BarChart, FileText, CheckSquare, Zap,
  Video, Presentation, Sparkles, Bot, Target, TrendingUp, Share2,
  Megaphone, Headphones, Mail, Linkedin,
};

const AGENT_STATUS: Record<string, { color: string; label: string }> = {
  idle: { color: "bg-emerald-500", label: "Idle" },
  working: { color: "bg-amber-500 animate-pulse", label: "Working" },
  waiting: { color: "bg-blue-500", label: "Waiting" },
  error: { color: "bg-red-500", label: "Error" },
  delegating: { color: "bg-blue-500 animate-pulse", label: "Delegating" },
};

const MSG_TYPE_CONFIG: Record<string, { icon: any; color: string }> = {
  delegation: { icon: ArrowRight, color: "text-blue-700" },
  result: { icon: CheckCircle, color: "text-emerald-700" },
  question: { icon: HelpCircle, color: "text-amber-700" },
  info: { icon: Info, color: "text-zinc-400" },
  error: { icon: AlertTriangle, color: "text-red-600" },
};

function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return "Never";
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getSpecialtyIcon(specialty: string) {
  const spec = AGENT_SPECIALTIES.find((s) => s.id === specialty);
  if (!spec) return Bot;
  return SPECIALTY_ICON_MAP[spec.icon] || Bot;
}

// ── Page ─────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user } = useUser();
  const router = useRouter();
  const { org, isImpersonating, impersonationSettled } = useEffectiveOrg();

  // Platform admins land here after login — redirect to admin dashboard UNLESS impersonating.
  // Wait for impersonation cookie to be read on the client before deciding (SSR can't read cookies).
  const platformUser = useQuery(
    api.admin.checkAccess,
    impersonationSettled && !isImpersonating && user?.id ? { clerkUserId: user.id } : "skip"
  );

  useEffect(() => {
    if (impersonationSettled && !isImpersonating && platformUser) {
      router.replace("/admin");
    }
  }, [platformUser, router, isImpersonating, impersonationSettled]);

  const team = useQuery(
    api.agentTeams.getByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const agents = useQuery(
    api.teamAgents.listByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const tasks = useQuery(
    api.scheduledTaskRunner.listByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const communications = useQuery(
    api.agentCommunications.listByTeam,
    team?._id ? { agentTeamId: team._id, limit: 30 } : "skip"
  );

  const agentPlans = useQuery(
    api.agentPlans.listByOrganization,
    org?._id ? { organizationId: org._id, limit: 20 } : "skip"
  );

  const insightStats = useQuery(
    api.agentInsights.getStats,
    org?._id ? { organizationId: org._id } : "skip"
  );

  // Derived counts
  const activePlans = agentPlans?.filter((p) => p.status === "active").length ?? 0;
  const activeTasks = tasks?.filter((t) => t.status === "active").length ?? 0;
  const runningTasks = tasks?.filter((t) => t.isRunning).length ?? 0;
  const workingAgents =
    (agents?.filter((a) => a.status === "working").length ?? 0) +
    (team?.status === "working" ? 1 : 0);
  const newInsights = insightStats?.new ?? 0;

  // Task lanes
  const running = tasks?.filter((t) => t.isRunning) ?? [];
  const active = tasks?.filter((t) => t.status === "active" && !t.isRunning) ?? [];
  const paused = tasks?.filter((t) => t.status === "paused") ?? [];
  const completed = tasks?.filter((t) => t.status === "completed").slice(0, 5) ?? [];
  const failed = tasks?.filter((t) => t.status === "failed").slice(0, 5) ?? [];

  const lanes = [
    { label: "Running", items: running, icon: Play, accent: "border-amber-500/20 bg-amber-500/5", dotColor: "bg-amber-500 animate-pulse", badgeColor: "bg-amber-500/20 text-amber-700" },
    { label: "Active", items: active, icon: Clock, accent: "border-emerald-500/20 bg-emerald-500/5", dotColor: "bg-emerald-500", badgeColor: "bg-emerald-500/20 text-emerald-700" },
    { label: "Paused", items: paused, icon: Pause, accent: "border-blue-500/20 bg-blue-500/5", dotColor: "bg-blue-500", badgeColor: "bg-blue-500/20 text-blue-700" },
    { label: "Completed", items: completed, icon: CheckCircle, accent: "border-zinc-500/20 bg-zinc-500/5", dotColor: "bg-zinc-500", badgeColor: "bg-zinc-500/20 text-zinc-400" },
    { label: "Failed", items: failed, icon: XCircle, accent: "border-red-500/20 bg-red-500/5", dotColor: "bg-red-500", badgeColor: "bg-red-500/20 text-red-600" },
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">
      {/* ── Section 1: Header + Quick Stats ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mission Control</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time overview of all agent operations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatPill
            icon={ClipboardList}
            value={activePlans}
            label="Plans"
            pulse={activePlans > 0}
          />
          <StatPill icon={ListChecks} value={activeTasks} label="Tasks" />
          <StatPill
            icon={Play}
            value={runningTasks}
            label="Running"
            pulse={runningTasks > 0}
          />
          <StatPill icon={Users} value={workingAgents} label="Working" />
          <StatPill
            icon={Lightbulb}
            value={newInsights}
            label="Insights"
            highlight={newInsights > 0}
          />
        </div>
      </div>

      {/* ── Section 2: Agent Roster ── */}
      <div className="rounded-xl border border-border/60 bg-card/80 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Agent Roster</h2>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
            {agents
              ? `${agents.filter((a) => a.status !== "idle").length} of ${agents.length} active`
              : "Loading..."}
          </span>
        </div>

        {/* Main agent */}
        {team && (
          <div className="mb-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{team.name}</span>
                <div className={cn("h-2 w-2 rounded-full", AGENT_STATUS[team.status]?.color ?? "bg-zinc-500")} />
                <span className="text-[11px] text-muted-foreground">
                  {AGENT_STATUS[team.status]?.label ?? team.status}
                </span>
                <Badge variant="outline" className="text-[9px] ml-auto">Lead</Badge>
              </div>
              {team.currentTask && (
                <p className="text-xs text-muted-foreground/70 italic truncate mt-0.5">
                  {team.currentTask}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Sub-agents grid */}
        {agents && agents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {agents.map((agent) => {
              const status = AGENT_STATUS[agent.status] ?? AGENT_STATUS.idle;
              const SpecIcon = getSpecialtyIcon(agent.specialty);
              const spec = AGENT_SPECIALTIES.find((s) => s.id === agent.specialty);

              return (
                <div
                  key={agent._id}
                  className={cn(
                    "rounded-lg border border-border/60 bg-card p-3 transition-all",
                    !agent.isEnabled && "opacity-40"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 shrink-0">
                      <SpecIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{agent.name}</span>
                        <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", status.color)} />
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          {spec?.label ?? agent.specialty}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground/50">
                          {formatRelativeTime(agent.lastActiveAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {agent.currentTask && (
                    <p className="text-[11px] text-muted-foreground/70 italic truncate mt-2 pl-[42px]">
                      {agent.currentTask}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : agents === undefined ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-lg border border-border/60 bg-muted/10 p-3 h-20 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Bot className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground/50">No agents configured</p>
            <Link href="/agents" className="text-xs text-primary hover:underline mt-1 inline-block">
              Set up your team
            </Link>
          </div>
        )}
      </div>

      {/* ── Section 2b: Active Agent Plans (from chat interactions) ── */}
      {agentPlans && agentPlans.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Agent Plans</h2>
            </div>
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
              {activePlans} active / {agentPlans.length} total
            </span>
          </div>
          <div className="space-y-2">
            {agentPlans.map((plan) => {
              const completedSteps = plan.steps.filter(
                (s) => s.status === "completed" || s.status === "skipped"
              ).length;
              const failedSteps = plan.steps.filter((s) => s.status === "failed").length;
              const totalSteps = plan.steps.length;
              const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
              const isActive = plan.status === "active";
              const isCompleted = plan.status === "completed";

              return (
                <Link
                  key={plan._id}
                  href={`/project/${plan.projectId}`}
                  className={cn(
                    "block rounded-lg border p-3 transition-all hover:bg-accent/20",
                    isActive
                      ? "border-violet-500/20 bg-violet-500/5"
                      : isCompleted
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-border/40"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          isActive
                            ? "bg-violet-500 animate-pulse"
                            : isCompleted
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                        )}
                      />
                      <span className="text-sm font-medium truncate">{plan.goal}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        className={cn(
                          "text-[9px] px-1.5 py-0 border-0",
                          isActive
                            ? "bg-violet-500/20 text-violet-400"
                            : isCompleted
                              ? "bg-emerald-500/20 text-emerald-700"
                              : "bg-amber-500/20 text-amber-700"
                        )}
                      >
                        {plan.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          failedSteps > 0
                            ? "bg-red-500"
                            : isCompleted
                              ? "bg-emerald-500"
                              : "bg-violet-500"
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                      {completedSteps}/{totalSteps} steps
                    </span>
                  </div>

                  {/* Step details */}
                  <div className="mt-2 pl-[14px] flex flex-wrap gap-1.5">
                    {plan.steps.map((step) => (
                      <span
                        key={step.id}
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5",
                          step.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-700"
                            : step.status === "in_progress"
                              ? "bg-amber-500/10 text-amber-700"
                              : step.status === "failed"
                                ? "bg-red-500/10 text-red-600"
                                : step.status === "skipped"
                                  ? "bg-zinc-500/10 text-zinc-400"
                                  : "bg-muted/20 text-muted-foreground/50"
                        )}
                      >
                        {step.status === "completed" && <CheckCircle className="h-2.5 w-2.5" />}
                        {step.status === "in_progress" && <Play className="h-2.5 w-2.5" />}
                        {step.status === "failed" && <XCircle className="h-2.5 w-2.5" />}
                        {step.status === "pending" && <Clock className="h-2.5 w-2.5" />}
                        {step.description.length > 40
                          ? step.description.slice(0, 40) + "..."
                          : step.description}
                      </span>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section 3: Task Pipeline + Activity Feed ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Task Pipeline */}
        <div className="lg:col-span-3 rounded-xl border border-border/60 bg-card/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Task Pipeline</h2>
            </div>
            <Link
              href="/scheduled"
              className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
            >
              Manage <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <ScrollArea className="max-h-[520px]">
            {tasks === undefined ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="rounded-lg border border-border/40 bg-muted/10 p-3 h-16 animate-pulse" />
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-12">
                <ListChecks className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground/50">No scheduled tasks</p>
                <Link href="/scheduled" className="text-xs text-primary hover:underline mt-1 inline-block">
                  Create a task
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {lanes.map((lane) => {
                  if (lane.items.length === 0) return null;
                  const LaneIcon = lane.icon;
                  return (
                    <div key={lane.label}>
                      <div className="flex items-center gap-2 mb-2">
                        <LaneIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {lane.label}
                        </span>
                        <Badge className={cn("text-[10px] px-1.5 py-0 border-0", lane.badgeColor)}>
                          {lane.items.length}
                        </Badge>
                      </div>
                      <div className="space-y-1.5">
                        {lane.items.map((task) => {
                          const assignedAgent = task.teamAgentId
                            ? agents?.find((a) => a._id === task.teamAgentId)
                            : null;
                          return (
                            <div
                              key={task._id}
                              className={cn(
                                "rounded-lg border p-2.5 transition-all",
                                lane.accent
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", lane.dotColor)} />
                                  <span className="text-sm font-medium truncate">{task.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {task.schedule?.cronExpression && (
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-border/50">
                                      {task.schedule.cronExpression}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 mt-1.5 pl-[14px] text-[11px] text-muted-foreground/60">
                                {assignedAgent && (
                                  <span className="flex items-center gap-1">
                                    <Bot className="h-3 w-3" />
                                    {assignedAgent.name}
                                  </span>
                                )}
                                <span>Runs: {task.runCount}</span>
                                {task.nextRunAt && (
                                  <span>Next: {formatRelativeTime(task.nextRunAt)}</span>
                                )}
                                {task.lastRunAt && (
                                  <span>Last: {formatRelativeTime(task.lastRunAt)}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Activity Feed */}
        <div className="lg:col-span-2 rounded-xl border border-border/60 bg-card/80 p-5">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Activity Feed</h2>
          </div>

          <ScrollArea className="max-h-[520px]">
            {communications === undefined ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="rounded-lg bg-muted/10 p-3 h-14 animate-pulse" />
                ))}
              </div>
            ) : communications.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground/50">No agent activity yet</p>
                <p className="text-xs text-muted-foreground/30 mt-1">
                  Agent communications will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {communications.map((msg) => {
                  const config = MSG_TYPE_CONFIG[msg.messageType] ?? MSG_TYPE_CONFIG.info;
                  const MsgIcon = config.icon;
                  return (
                    <div
                      key={msg._id}
                      className="rounded-lg border border-border/40 bg-card p-2.5 transition-all hover:bg-accent/20"
                    >
                      <div className="flex items-center gap-2">
                        <MsgIcon className={cn("h-3.5 w-3.5 shrink-0", config.color)} />
                        <span className="text-xs font-medium truncate">
                          {msg.fromName}
                          <span className="text-muted-foreground/40 mx-1">&rarr;</span>
                          {msg.toName}
                        </span>
                        <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
                          {formatRelativeTime(msg._creationTime)}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 mt-1 pl-[22px] line-clamp-2">
                        {msg.content.slice(0, 120)}
                        {msg.content.length > 120 ? "..." : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* ── Section 4: Insights Banner ── */}
      {newInsights > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lightbulb className="h-5 w-5 text-amber-700" />
            <div>
              <p className="text-sm font-medium">
                {newInsights} new insight{newInsights !== 1 ? "s" : ""} require your attention
              </p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                AI-generated recommendations to improve your agents
              </p>
            </div>
          </div>
          <Link
            href="/insights"
            className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-500/20 transition-colors shrink-0"
          >
            View Insights
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Stat Pill ─────────────────────────────────────────────────────────

function StatPill({
  icon: Icon,
  value,
  label,
  pulse,
  highlight,
}: {
  icon: any;
  value: number;
  label: string;
  pulse?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-2",
        highlight && "border-amber-500/30 bg-amber-500/5"
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5 text-muted-foreground",
          pulse && "text-amber-700 animate-pulse",
          highlight && "text-amber-700"
        )}
      />
      <span className="text-lg font-bold leading-none">{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 leading-none">
        {label}
      </span>
    </div>
  );
}
