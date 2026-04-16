"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Doc } from "../../../../../convex/_generated/dataModel";
import { Users, Plus, Trash2 } from "lucide-react";

export default function AdminUsersPage() {
  const { user } = useUser();
  const [showForm, setShowForm] = useState(false);
  const [newClerkId, setNewClerkId] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"super_admin" | "platform_staff">("platform_staff");

  const platformUsers = useQuery(
    api.admin.listPlatformUsers,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  const addUser = useMutation(api.admin.addPlatformUser);
  const removeUser = useMutation(api.admin.removePlatformUser);

  const handleAdd = async () => {
    if (!user?.id || !newClerkId || !newEmail) return;
    try {
      await addUser({
        clerkUserId: user.id,
        newClerkUserId: newClerkId,
        email: newEmail,
        role: newRole,
      });
      setNewClerkId("");
      setNewEmail("");
      setNewRole("platform_staff");
      setShowForm(false);
    } catch (error: any) {
      toast.error("Failed to add user", { description: error.message });
    }
  };

  const handleRemove = async (targetId: Id<"platformUsers">) => {
    if (!user?.id) return;
    if (!confirm("Remove this platform user?")) return;
    try {
      await removeUser({ clerkUserId: user.id, targetId });
    } catch (error: any) {
      toast.error("Failed to remove user", { description: error.message });
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage who has access to the admin dashboard.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="rounded-xl border border-border/60 bg-card/80 p-5 space-y-4">
          <h3 className="text-sm font-semibold">Add Platform User</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              placeholder="Clerk User ID"
              value={newClerkId}
              onChange={(e) => setNewClerkId(e.target.value)}
            />
            <Input
              placeholder="Email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "super_admin" | "platform_staff")}
              className="rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="platform_staff">Platform Staff</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!newClerkId || !newEmail}>
              Add User
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Users Table */}
      {platformUsers && platformUsers.length > 0 ? (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Clerk User ID</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {platformUsers.map((pu: Doc<"platformUsers">) => (
                <tr
                  key={pu._id}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{pu.email}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {pu.clerkUserId}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        pu.role === "super_admin"
                          ? "bg-amber-500/15 text-amber-700 border-amber-500/20 text-[10px]"
                          : "bg-blue-500/15 text-blue-700 border-blue-500/20 text-[10px]"
                      }
                    >
                      {pu.role === "super_admin" ? "Super Admin" : "Staff"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {pu.clerkUserId !== user?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(pu._id)}
                        className="text-red-600 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : platformUsers && platformUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No platform users yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Run seedSuperAdmin to add the first admin.
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">Loading users...</p>
        </div>
      )}
    </div>
  );
}
