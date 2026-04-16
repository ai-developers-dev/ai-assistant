"use client";

import { useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Zap, Hash, Coins } from "lucide-react";

type UsageBucket = { tokens: number; credits: number; count: number };

function formatDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

const TYPE_LABELS: Record<string, string> = {
  chat: "Chat",
  image_generation: "Image Generation",
  embedding: "Embedding",
  tool_execution: "Tool Execution",
};

export default function AdminUsagePage() {
  const { user } = useUser();

  const dateRange = useMemo(() => ({
    startDate: formatDate(30),
    endDate: formatDate(0),
  }), []);

  const usage = useQuery(
    api.admin.getPlatformUsage,
    user?.id
      ? { clerkUserId: user.id, ...dateRange }
      : "skip"
  );

  const sortedDates = useMemo((): [string, UsageBucket][] => {
    if (!usage?.byDate) return [];
    return (Object.entries(usage.byDate) as [string, UsageBucket][]).sort(([a], [b]) => b.localeCompare(a));
  }, [usage?.byDate]);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usage Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Platform-wide usage for the last 30 days.
        </p>
      </div>

      {usage && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border/60 bg-card/80 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-current/10 text-cyan-400 mb-4">
                <Hash className="h-4.5 w-4.5" />
              </div>
              <p className="text-2xl font-bold tracking-tight">
                {usage.totalTokens.toLocaleString()}
              </p>
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                Total Tokens
              </span>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/80 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-current/10 text-amber-700 mb-4">
                <Coins className="h-4.5 w-4.5" />
              </div>
              <p className="text-2xl font-bold tracking-tight">
                {usage.totalCredits.toLocaleString()}
              </p>
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                Total Credits
              </span>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/80 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-current/10 text-emerald-700 mb-4">
                <Zap className="h-4.5 w-4.5" />
              </div>
              <p className="text-2xl font-bold tracking-tight">
                {usage.requestCount.toLocaleString()}
              </p>
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                Total Requests
              </span>
            </div>
          </div>

          {/* By Type */}
          <div className="rounded-xl border border-border/60 bg-card/80 p-5">
            <h3 className="text-sm font-semibold mb-4">By Usage Type</h3>
            {Object.keys(usage.byType).length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(Object.entries(usage.byType) as [string, UsageBucket][]).map(([type, data]) => (
                  <div
                    key={type}
                    className="rounded-lg border border-border/40 bg-muted/20 p-4"
                  >
                    <p className="text-xs text-muted-foreground mb-1">
                      {TYPE_LABELS[type] || type}
                    </p>
                    <p className="text-lg font-bold">{data.count.toLocaleString()}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {data.credits.toLocaleString()} credits
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No usage data in this period.</p>
            )}
          </div>

          {/* By Model */}
          <div className="rounded-xl border border-border/60 bg-card/80 p-5">
            <h3 className="text-sm font-semibold mb-4">By Model</h3>
            {Object.keys(usage.byModel).length > 0 ? (
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Model</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Requests</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tokens</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.entries(usage.byModel) as [string, UsageBucket][]).map(([model, data]) => (
                      <tr
                        key={model}
                        className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs">{model}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{data.count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{data.tokens.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{data.credits.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No model data in this period.</p>
            )}
          </div>

          {/* Daily Table */}
          {sortedDates.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card/80 p-5">
              <h3 className="text-sm font-semibold mb-4">Daily Totals</h3>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Requests</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tokens</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDates.map(([date, data]) => (
                      <tr
                        key={date}
                        className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs">{date}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{data.count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{data.tokens.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{data.credits.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!usage && user?.id && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">Loading usage data...</p>
        </div>
      )}
    </div>
  );
}
