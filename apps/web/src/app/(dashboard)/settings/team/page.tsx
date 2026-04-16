"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, Trash2, Crown, Shield, Eye } from "lucide-react";
import { useState } from "react";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-500/15 text-purple-700 border-purple-500/20",
  member: "bg-blue-500/15 text-blue-700 border-blue-500/20",
  viewer: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

const ROLE_ICONS: Record<string, any> = {
  admin: Crown,
  member: Shield,
  viewer: Eye,
};

function timeAgo(ms: number | null | undefined): string {
  if (!ms) return "Never";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TeamSettingsPage() {
  const { user } = useUser();
  const { org, effectiveClerkOrgId, isImpersonating } = useEffectiveOrg();

  const currentUser = useQuery(
    api.users.getCurrent,
    effectiveClerkOrgId && user?.id
      ? { clerkOrgId: effectiveClerkOrgId, clerkUserId: user.id }
      : "skip"
  );

  const members = useQuery(
    api.users.getByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const updateRole = useMutation(api.users.updateRole);
  const removeMember = useMutation(api.users.removeFromOrg);

  const [roleChanging, setRoleChanging] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const isAdmin = currentUser?.role === "admin" || isImpersonating;

  const handleRoleChange = async (targetId: Id<"users">, newRole: "admin" | "member" | "viewer") => {
    if (!currentUser) return;
    setRoleChanging(targetId);
    try {
      await updateRole({ callerId: currentUser._id, targetId, newRole });
    } catch (err: any) {
      toast.error(err.message ?? "Request failed");
    } finally {
      setRoleChanging(null);
    }
  };

  const handleRemove = async (targetId: Id<"users">, name: string) => {
    if (!currentUser) return;
    if (!confirm(`Remove ${name} from your organization? They will lose access immediately.`)) return;
    setRemoving(targetId);
    try {
      await removeMember({ callerId: currentUser._id, targetId });
    } catch (err: any) {
      toast.error(err.message ?? "Request failed");
    } finally {
      setRemoving(null);
    }
  };

  if (!org || !members) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Loading team...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Team Members</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage who has access to your organization and their permission levels.
        </p>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { role: "admin", label: "Admin", desc: "Full access, can manage team & billing" },
          { role: "member", label: "Member", desc: "Full feature access, cannot manage team" },
          { role: "viewer", label: "Viewer", desc: "Read-only access, cannot run agents" },
        ].map(({ role, label, desc }) => {
          const Icon = ROLE_ICONS[role];
          return (
            <div key={role} className="rounded-lg border border-border/40 bg-muted/10 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <Badge variant="outline" className={`text-[10px] ${ROLE_COLORS[role]}`}>
                  {label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          );
        })}
      </div>

      {/* Members table */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Members</h3>
            <span className="text-xs text-muted-foreground">
              {members.length} / {(org.maxTeamMembers ?? 1) >= 999999 ? "∞" : org.maxTeamMembers}
            </span>
          </div>
          {isAdmin && (
            <p className="text-xs text-muted-foreground">
              To invite new members, use your organization settings in the top-right menu.
            </p>
          )}
        </div>

        {members.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/10">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Member</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Role</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Last Active</th>
                {isAdmin && (
                  <th className="px-5 py-3 text-xs font-medium text-muted-foreground">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isMe = member.clerkUserId === user?.id;
                return (
                  <tr
                    key={member._id}
                    className="border-b border-border/20 last:border-0 hover:bg-muted/10 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {(member.name ?? member.email ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {member.name ?? "—"}
                            {isMe && (
                              <span className="ml-2 text-[10px] font-normal text-muted-foreground">(you)</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{member.email ?? "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="outline" className={`capitalize text-[10px] ${ROLE_COLORS[member.role] || ""}`}>
                        {member.role}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {timeAgo((member as any).lastActiveAt)}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3">
                        {!isMe ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={member.role}
                              disabled={roleChanging === member._id}
                              onChange={(e) =>
                                handleRoleChange(member._id, e.target.value as any)
                              }
                              className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                              <option value="viewer">Viewer</option>
                            </select>
                            <button
                              onClick={() =>
                                handleRemove(member._id, member.name ?? member.email ?? "User")
                              }
                              disabled={removing === member._id}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-red-500/20 bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                              title="Remove from org"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">No members found.</p>
          </div>
        )}
      </div>

      {!isAdmin && (
        <p className="text-xs text-muted-foreground text-center">
          Contact your organization admin to change roles or invite members.
        </p>
      )}
    </div>
  );
}
