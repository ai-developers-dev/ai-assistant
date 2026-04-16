"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Bot,
  Folder,
  Clock,
  CheckSquare,
  Users,
  Zap,
  Play,
  Pause,
  Circle,
  CheckCircle2,
  AlertCircle,
  Calendar,
} from "lucide-react";
import Link from "next/link";

const PLAN_COLORS: Record<string, string> = {
  free: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
  starter: "bg-blue-500/15 text-blue-700 border-blue-500/20",
  pro: "bg-purple-500/15 text-purple-700 border-purple-500/20",
  enterprise: "bg-amber-500/15 text-amber-700 border-amber-500/20",
};

const TASK_STAGE_COLORS: Record<string, string> = {
  inbox: "bg-zinc-500/20 text-zinc-400",
  assigned: "bg-blue-500/20 text-blue-700",
  in_progress: "bg-amber-500/20 text-amber-700",
  review: "bg-purple-500/20 text-purple-700",
  quality_review: "bg-orange-500/20 text-orange-700",
  done: "bg-green-500/20 text-green-700",
};

function StatCard({ icon: Icon, value, label, color }: { icon: any; value: string | number; label: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg mb-3 ${color ?? "bg-primary/10"}`}>
        <Icon className={`h-4 w-4 ${color ? "text-current" : "text-primary"}`} />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

export default function TenantViewPage() {
  const { user } = useUser();
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as Id<"organizations">;

  const data = useQuery(
    api.admin.getTenantFullData,
    user?.id && orgId ? { clerkUserId: user.id, organizationId: orgId } : "skip"
  );

  if (!data) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Loading tenant data...</p>
      </div>
    );
  }

  const { org, agentTeam, agents, scheduledTasks, tasks, projects, users } = data;

  const activeScheduled = scheduledTasks.filter((t) => t.status === "active");
  const activeTasks = tasks.filter((t) => t.stage !== "done");
  const activeProjects = projects.filter((p) => p.status === "active");

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/admin/organizations/${orgId}`)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{org.name}</h1>
              <Badge variant="outline" className={`capitalize text-[10px] ${PLAN_COLORS[org.plan] ?? ""}`}>
                {org.plan}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Tenant Dashboard View</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/organizations/${orgId}`}
            className="rounded-md border border-border/60 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
          >
            Org Settings
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} value={users.length} label="Team Members" color="bg-blue-500/10 text-blue-700" />
        <StatCard icon={Folder} value={activeProjects.length} label="Active Projects" color="bg-purple-500/10 text-purple-700" />
        <StatCard icon={Bot} value={agents.length} label="AI Agents" color="bg-emerald-500/10 text-emerald-700" />
        <StatCard icon={Zap} value={`${org.monthlyRequestCount ?? 0}/${(org.monthlyRequestLimit ?? 50) >= 999999 ? "∞" : (org.monthlyRequestLimit ?? 50)}`} label="Requests This Month" color="bg-amber-500/10 text-amber-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent Team */}
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">AI Agents</h2>
              <span className="text-xs text-muted-foreground">{agents.length}</span>
            </div>
            {agentTeam && (
              <span className="text-xs text-muted-foreground">{agentTeam.name}</span>
            )}
          </div>
          {agents.length > 0 ? (
            <div className="divide-y divide-border/20">
              {agents.map((agent) => (
                <div key={agent._id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-2 w-2 rounded-full ${
                      agent.status === "working" ? "bg-amber-400 animate-pulse" :
                      agent.status === "idle" ? "bg-emerald-400" :
                      agent.status === "error" ? "bg-red-400" : "bg-zinc-400"
                    }`} />
                    <div>
                      <p className="text-sm font-medium">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">{agent.specialty}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{agent.modelId?.split("/").pop() ?? agent.modelId}</Badge>
                    <span className="text-xs text-muted-foreground capitalize">{agent.status}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-xs text-muted-foreground">No agents configured</p>
            </div>
          )}
        </div>

        {/* Scheduled Tasks */}
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Scheduled Tasks</h2>
              <span className="text-xs text-muted-foreground">{scheduledTasks.length}</span>
            </div>
            <span className="text-xs text-emerald-700">{activeScheduled.length} active</span>
          </div>
          {scheduledTasks.length > 0 ? (
            <div className="divide-y divide-border/20">
              {scheduledTasks.slice(0, 8).map((task) => (
                <div key={task._id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {task.status === "active" ? (
                      <Play className="h-3 w-3 text-emerald-700" />
                    ) : task.status === "paused" ? (
                      <Pause className="h-3 w-3 text-amber-700" />
                    ) : (
                      <Circle className="h-3 w-3 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]">{task.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.schedule.type === "cron" ? task.schedule.cronExpression : "One-time"} · Run #{task.runCount}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] capitalize ${
                      task.status === "active" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" :
                      task.status === "paused" ? "bg-amber-500/10 text-amber-700 border-amber-500/20" :
                      "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                    }`}
                  >
                    {task.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-xs text-muted-foreground">No scheduled tasks</p>
            </div>
          )}
        </div>

        {/* Kanban Tasks */}
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Tasks</h2>
              <span className="text-xs text-muted-foreground">{tasks.length}</span>
            </div>
            <span className="text-xs text-muted-foreground">{activeTasks.length} open</span>
          </div>
          {tasks.length > 0 ? (
            <div className="divide-y divide-border/20">
              {tasks.slice(0, 8).map((task) => (
                <div key={task._id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {task.stage === "done" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                    ) : task.priority === "urgent" ? (
                      <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]">{task.title}</p>
                      {task.assignedAgentName && (
                        <p className="text-xs text-muted-foreground">{task.assignedAgentName}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TASK_STAGE_COLORS[task.stage] ?? ""}`}>
                      {task.stage.replace("_", " ")}
                    </span>
                    <Badge variant="outline" className="text-[10px] capitalize">{task.priority}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-xs text-muted-foreground">No tasks</p>
            </div>
          )}
        </div>

        {/* Projects */}
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Projects</h2>
              <span className="text-xs text-muted-foreground">{projects.length}</span>
            </div>
          </div>
          {projects.length > 0 ? (
            <div className="divide-y divide-border/20">
              {projects.slice(0, 8).map((project) => (
                <div key={project._id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-2 w-2 rounded-full ${
                      project.status === "active" ? "bg-emerald-400" : "bg-zinc-400"
                    }`} />
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]">{project.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{project.agentType?.replace("_", " ")} · {project.messageCount} msgs</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(project.lastActivityAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-xs text-muted-foreground">No projects yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Team Members */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Team Members</h2>
          <span className="text-xs text-muted-foreground">{users.length}</span>
        </div>
        {users.length > 0 ? (
          <div className="divide-y divide-border/20">
            {users.map((u) => (
              <div key={u._id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {(u.name ?? u.email ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{u.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] capitalize">{u.role}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-muted-foreground">No members yet — invite sent to owner</p>
          </div>
        )}
      </div>
    </div>
  );
}
