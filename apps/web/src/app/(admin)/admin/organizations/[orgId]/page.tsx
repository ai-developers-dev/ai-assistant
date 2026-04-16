"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Users,
  Folder,
  Zap,
  Crown,
  Eye,
  ShieldCheck,
  Clock,
  ExternalLink,
  Trash2,
  CreditCard,
} from "lucide-react";
import Link from "next/link";

const PLAN_BADGE_COLORS: Record<string, string> = {
  free: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
  starter: "bg-blue-500/15 text-blue-700 border-blue-500/20",
  pro: "bg-purple-500/15 text-purple-700 border-purple-500/20",
  enterprise: "bg-amber-500/15 text-amber-700 border-amber-500/20",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-500/15 text-purple-700 border-purple-500/20",
  member: "bg-blue-500/15 text-blue-700 border-blue-500/20",
  viewer: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

function timeAgo(ms: number | null): string {
  if (!ms) return "Never";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TenantDetailPage() {
  const { user } = useUser();
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as Id<"organizations">;

  const [roleChanging, setRoleChanging] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);

  const detail = useQuery(
    api.admin.getOrganizationDetail,
    user?.id && orgId ? { clerkUserId: user.id, organizationId: orgId } : "skip"
  );

  const updatePlan = useMutation(api.admin.adminUpdateOrgPlan);
  const updateUserRole = useMutation(api.admin.adminUpdateUserRole);
  const removeUser = useMutation(api.admin.adminRemoveUserFromOrg);

  const handleImpersonate = async (roleView: "admin" | "member") => {
    if (!detail?.org) return;
    setImpersonating(true);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId, roleView, orgName: detail.org.name }),
      });
      if (res.ok) {
        // Hard navigation ensures a clean page load where the impersonation
        // cookie is read fresh (soft navigation can have hydration state issues)
        window.location.href = "/home";
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Request failed");
      }
    } finally {
      setImpersonating(false);
    }
  };

  const handleRoleChange = async (userId: Id<"users">, newRole: "admin" | "member" | "viewer") => {
    if (!user?.id) return;
    setRoleChanging(userId);
    try {
      await updateUserRole({ clerkUserId: user.id, targetUserId: userId, newRole });
    } catch (err: any) {
      toast.error(err.message ?? "Request failed");
    } finally {
      setRoleChanging(null);
    }
  };

  const handleRemoveUser = async (userId: Id<"users">, name: string) => {
    if (!user?.id) return;
    if (!confirm(`Remove ${name} from this organization?`)) return;
    setRemoving(userId);
    try {
      await removeUser({ clerkUserId: user.id, targetUserId: userId });
    } catch (err: any) {
      toast.error(err.message ?? "Request failed");
    } finally {
      setRemoving(null);
    }
  };

  const handlePlanChange = async (plan: "free" | "starter" | "pro" | "enterprise") => {
    if (!user?.id) return;
    try {
      await updatePlan({ clerkUserId: user.id, organizationId: orgId, plan });
    } catch (err: any) {
      toast.error(err.message ?? "Request failed");
    }
  };

  if (!detail && user?.id) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Loading tenant details...</p>
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Organization not found.</p>
      </div>
    );
  }

  if (!detail) return null;

  const { org, users, recentProjects, projectCount } = detail;
  const usagePercent = org.monthlyRequestLimit
    ? Math.min(100, Math.round(((org.monthlyRequestCount ?? 0) / org.monthlyRequestLimit) * 100))
    : 0;

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/organizations"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-card/80 hover:bg-card transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
              <Badge
                variant="outline"
                className={`capitalize text-[10px] ${PLAN_BADGE_COLORS[org.plan] || ""}`}
              >
                {org.plan}
              </Badge>
            </div>
            {org.slug && (
              <p className="text-sm text-muted-foreground mt-0.5">{org.slug}</p>
            )}
          </div>
        </div>

        {/* Impersonation buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleImpersonate("member")}
            disabled={impersonating}
            className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-card transition-colors disabled:opacity-50"
          >
            <Eye className="h-3.5 w-3.5" />
            View as Member
          </button>
          <button
            onClick={() => handleImpersonate("admin")}
            disabled={impersonating}
            className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            View as Admin
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Users, label: "Team Members", value: users.length, color: "text-emerald-700" },
          { icon: Folder, label: "Projects", value: projectCount, color: "text-purple-700" },
          {
            icon: Zap,
            label: "Requests This Month",
            value: `${org.monthlyRequestCount ?? 0} / ${(org.monthlyRequestLimit ?? 50) >= 999999 ? "∞" : (org.monthlyRequestLimit ?? 50)}`,
            color: "text-amber-700",
          },
          {
            icon: CreditCard,
            label: "Stripe Customer",
            value: org.stripeCustomerId ? "Connected" : "None",
            color: org.stripeCustomerId ? "text-blue-700" : "text-zinc-500",
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border/60 bg-card/80 p-5">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-current/10 ${stat.color} mb-3`}>
              <stat.icon className="h-4 w-4" />
            </div>
            <p className="text-lg font-bold">{stat.value}</p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 mt-0.5">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Usage bar */}
      <div className="rounded-xl border border-border/60 bg-card/80 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Monthly Usage</h3>
          <span className="text-xs text-muted-foreground">{usagePercent}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${usagePercent > 90 ? "bg-red-500" : usagePercent > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <span>{org.monthlyRequestCount ?? 0} used</span>
          <span>{(org.monthlyRequestLimit ?? 50) >= 999999 ? "Unlimited" : `${org.monthlyRequestLimit} limit`}</span>
        </div>
      </div>

      {/* Team members */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/60 bg-muted/20">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Team Members</h3>
          <span className="text-xs text-muted-foreground ml-auto">{users.length} member{users.length !== 1 ? "s" : ""}</span>
        </div>
        {users.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/10">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Email</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Role</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Last Active</th>
                <th className="px-5 py-3 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="border-b border-border/20 last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="px-5 py-3 font-medium">{u.name ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{u.email ?? "—"}</td>
                  <td className="px-5 py-3">
                    <Badge variant="outline" className={`capitalize text-[10px] ${ROLE_COLORS[u.role] || ""}`}>
                      {u.role}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {timeAgo(u.lastActive)}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        disabled={roleChanging === u._id}
                        onChange={(e) => handleRoleChange(u._id as Id<"users">, e.target.value as any)}
                        className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={() => handleRemoveUser(u._id as Id<"users">, u.name ?? u.email ?? "User")}
                        disabled={removing === u._id}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-red-500/20 bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        title="Remove from org"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">No members found.</p>
          </div>
        )}
      </div>

      {/* Recent Projects */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/60 bg-muted/20">
          <Folder className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Recent Projects</h3>
          <span className="text-xs text-muted-foreground ml-auto">{projectCount} total</span>
        </div>
        {recentProjects.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/10">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Agent Type</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {recentProjects.map((p) => (
                <tr key={p._id} className="border-b border-border/20 last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="px-5 py-3 font-medium">{p.name}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground capitalize">{p.agentType ?? "—"}</td>
                  <td className="px-5 py-3 text-right text-xs text-muted-foreground">{timeAgo(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-red-600" />
          <h3 className="text-sm font-semibold text-red-600">Admin Controls</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-xs font-medium mb-1">Change Plan</p>
            <select
              value={org.plan}
              onChange={(e) => handlePlanChange(e.target.value as any)}
              className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          {org.stripeCustomerId && (
            <div className="flex-1">
              <p className="text-xs font-medium mb-1">Stripe Customer</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted/30 px-2 py-1 rounded font-mono">{org.stripeCustomerId}</code>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
