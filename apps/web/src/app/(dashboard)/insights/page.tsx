"use client";

import { useQuery, useMutation } from "convex/react";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Trash2,
  BarChart3,
  Zap,
  Bug,
  Lightbulb,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";

type InsightStatus = "new" | "acknowledged" | "applied" | "dismissed";
type InsightCategory = "performance" | "optimization" | "failure_analysis" | "new_automation" | "general";

const CATEGORY_CONFIG: Record<InsightCategory, { label: string; icon: typeof TrendingUp; color: string }> = {
  performance: { label: "Performance", icon: BarChart3, color: "text-blue-700" },
  optimization: { label: "Optimization", icon: Zap, color: "text-amber-700" },
  failure_analysis: { label: "Failure Analysis", icon: Bug, color: "text-red-600" },
  new_automation: { label: "New Automation", icon: Lightbulb, color: "text-green-700" },
  general: { label: "General", icon: Info, color: "text-slate-400" },
};

const PRIORITY_CONFIG = {
  high: { label: "High", className: "bg-red-500/20 text-red-600 border-red-500/30" },
  medium: { label: "Medium", className: "bg-amber-500/20 text-amber-700 border-amber-500/30" },
  low: { label: "Low", className: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
};

const STATUS_FILTERS: { value: InsightStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "applied", label: "Applied" },
  { value: "dismissed", label: "Dismissed" },
];

const CATEGORY_FILTERS: { value: InsightCategory | "all"; label: string }[] = [
  { value: "all", label: "All Categories" },
  { value: "performance", label: "Performance" },
  { value: "optimization", label: "Optimization" },
  { value: "failure_analysis", label: "Failures" },
  { value: "new_automation", label: "New Automations" },
  { value: "general", label: "General" },
];

export default function InsightsPage() {
  const { org } = useEffectiveOrg();
  const [statusFilter, setStatusFilter] = useState<InsightStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<InsightCategory | "all">("all");

  const insights = useQuery(
    api.agentInsights.listByOrganization,
    org?._id
      ? {
          organizationId: org._id,
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          ...(categoryFilter !== "all" && statusFilter === "all" ? { category: categoryFilter } : {}),
        }
      : "skip"
  );

  const stats = useQuery(
    api.agentInsights.getStats,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const updateStatus = useMutation(api.agentInsights.updateStatus);
  const deleteInsight = useMutation(api.agentInsights.deleteInsight);

  // Client-side category filter when status filter is active
  const filteredInsights =
    insights && categoryFilter !== "all" && statusFilter !== "all"
      ? insights.filter((i) => i.category === categoryFilter)
      : insights;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated recommendations to improve your agents and automations
          </p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Insights" value={stats.total} />
            <StatCard
              label="New"
              value={stats.new}
              className={stats.new > 0 ? "ring-1 ring-primary/30" : ""}
            />
            <StatCard
              label="High Priority"
              value={stats.high}
              className={stats.high > 0 ? "ring-1 ring-red-500/30" : ""}
              valueClassName={stats.high > 0 ? "text-red-600" : ""}
            />
            <StatCard label="Categories" value={Object.values(stats.byCategory).filter((c) => c > 0).length} />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  statusFilter === f.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
                {f.value === "new" && stats && stats.new > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px]">
                    {stats.new}
                  </span>
                )}
              </button>
            ))}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as InsightCategory | "all")}
            className="px-3 py-1.5 rounded-lg bg-muted/50 text-xs font-medium text-muted-foreground border-0 outline-none cursor-pointer"
          >
            {CATEGORY_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* Insights List */}
        <div className="space-y-3">
          {filteredInsights === undefined && (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
          )}

          {filteredInsights && filteredInsights.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <TrendingUp className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground text-sm">No insights yet</p>
              <p className="text-muted-foreground/60 text-xs max-w-sm mx-auto">
                Schedule an Insights Agent to analyze your tasks and agents, then recommendations will appear here.
              </p>
            </div>
          )}

          {filteredInsights?.map((insight) => (
            <InsightCard
              key={insight._id}
              insight={insight}
              onUpdateStatus={(status) =>
                updateStatus({ insightId: insight._id, status })
              }
              onDelete={() => deleteInsight({ insightId: insight._id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: number;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold mt-1", valueClassName)}>{value}</p>
    </div>
  );
}

function InsightCard({
  insight,
  onUpdateStatus,
  onDelete,
}: {
  insight: {
    _id: Id<"agentInsights">;
    category: string;
    title: string;
    summary: string;
    details: string;
    priority: string;
    status: string;
    generatedAt: number;
  };
  onUpdateStatus: (status: "acknowledged" | "applied" | "dismissed") => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_CONFIG[insight.category as InsightCategory] || CATEGORY_CONFIG.general;
  const priority = PRIORITY_CONFIG[insight.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.low;
  const CatIcon = cat.icon;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card transition-all",
        insight.status === "new" && "border-primary/20 bg-primary/[0.02]",
        insight.status === "dismissed" && "opacity-60"
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5 p-2 rounded-lg bg-muted/50", cat.color)}>
            <CatIcon className="h-4 w-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">{insight.title}</h3>
              <Badge variant="outline" className={cn("text-[10px] px-1.5", priority.className)}>
                {priority.label}
              </Badge>
              {insight.status === "new" && (
                <Badge className="text-[10px] px-1.5 bg-primary/20 text-primary border-primary/30">
                  New
                </Badge>
              )}
              {insight.status === "applied" && (
                <Badge className="text-[10px] px-1.5 bg-green-500/20 text-green-700 border-green-500/30">
                  Applied
                </Badge>
              )}
              {insight.status === "acknowledged" && (
                <Badge className="text-[10px] px-1.5 bg-blue-500/20 text-blue-700 border-blue-500/30">
                  Seen
                </Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground mt-1">{insight.summary}</p>

            <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground/60">
              <span>{cat.label}</span>
              <span>-</span>
              <span>{new Date(insight.generatedAt).toLocaleDateString()}</span>
            </div>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3">
          <div className="text-sm whitespace-pre-wrap text-muted-foreground leading-relaxed">
            {insight.details}
          </div>

          <div className="flex items-center gap-2 pt-1">
            {insight.status === "new" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => onUpdateStatus("acknowledged")}
                >
                  <Eye className="h-3 w-3" />
                  Acknowledge
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 text-green-700 hover:text-green-300"
                  onClick={() => onUpdateStatus("applied")}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Mark Applied
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1.5 text-muted-foreground"
                  onClick={() => onUpdateStatus("dismissed")}
                >
                  <XCircle className="h-3 w-3" />
                  Dismiss
                </Button>
              </>
            )}
            {insight.status === "acknowledged" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 text-green-700 hover:text-green-300"
                onClick={() => onUpdateStatus("applied")}
              >
                <CheckCircle2 className="h-3 w-3" />
                Mark Applied
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1.5 text-red-600 hover:text-red-300 ml-auto"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
