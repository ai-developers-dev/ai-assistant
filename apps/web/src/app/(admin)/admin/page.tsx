"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import Link from "next/link";
import {
  Building2,
  Users,
  Folder,
  MessageSquare,
  Zap,
  ArrowRight,
  Crown,
  Ticket,
  Settings2,
} from "lucide-react";

function StatCard({
  icon: Icon,
  label,
  value,
  color = "text-primary",
}: {
  icon: any;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-current/10 ${color}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
        {label}
      </span>
    </div>
  );
}

const PLAN_COLORS: Record<string, string> = {
  free: "text-zinc-400",
  pro: "text-blue-700",
  team: "text-purple-700",
  enterprise: "text-amber-700",
};

export default function AdminPage() {
  const { user } = useUser();

  const stats = useQuery(
    api.admin.getPlatformStats,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor and manage your entire platform from here.
        </p>
      </div>

      {stats && (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard
              icon={Building2}
              label="Organizations"
              value={stats.orgCount.toLocaleString()}
              color="text-blue-700"
            />
            <StatCard
              icon={Users}
              label="Users"
              value={stats.userCount.toLocaleString()}
              color="text-emerald-700"
            />
            <StatCard
              icon={Folder}
              label="Projects"
              value={stats.projectCount.toLocaleString()}
              color="text-purple-700"
            />
            <StatCard
              icon={MessageSquare}
              label="Messages"
              value={stats.messageCount.toLocaleString()}
              color="text-cyan-400"
            />
            <StatCard
              icon={Zap}
              label="Total Requests"
              value={stats.totalRequests.toLocaleString()}
              color="text-amber-700"
            />
          </div>

          {/* Plan Distribution */}
          <div className="rounded-xl border border-border/60 bg-card/80 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="h-4 w-4 text-amber-700" />
              <h3 className="text-sm font-semibold">Plan Distribution</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(Object.entries(stats.planDistribution) as [string, number][]).map(
                ([plan, count]) => (
                  <div
                    key={plan}
                    className="rounded-lg border border-border/40 bg-muted/20 p-4 text-center"
                  >
                    <p className={`text-xl font-bold ${PLAN_COLORS[plan] || "text-foreground"}`}>
                      {count}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize mt-1">{plan}</p>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[
              { label: "Manage Organizations", href: "/admin/organizations", icon: Building2 },
              { label: "Platform Users", href: "/admin/users", icon: Users },
              { label: "Usage Analytics", href: "/admin/usage", icon: Zap },
              { label: "Promo Codes", href: "/admin/promo-codes", icon: Ticket },
              { label: "Agent Config", href: "/admin/agent-config", icon: Settings2 },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex items-center justify-between rounded-xl border border-border/60 bg-card/80 p-5 hover:bg-card transition-colors"
              >
                <div className="flex items-center gap-3">
                  <link.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-sm font-medium">{link.label}</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            ))}
          </div>
        </>
      )}

      {!stats && user?.id && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">Loading platform stats...</p>
        </div>
      )}
    </div>
  );
}
