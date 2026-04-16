"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { Doc } from "../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

type OrgWithCounts = Doc<"organizations"> & { projectCount: number; userCount: number };

const PLAN_BADGE_COLORS: Record<string, string> = {
  free: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
  starter: "bg-blue-500/15 text-blue-700 border-blue-500/20",
  pro: "bg-purple-500/15 text-purple-700 border-purple-500/20",
  enterprise: "bg-amber-500/15 text-amber-700 border-amber-500/20",
};

function AddTenantModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [plan, setPlan] = useState<"free" | "starter" | "pro" | "enterprise">("free");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Organization name is required.");
    if (!ownerEmail.trim()) return setError("Owner email is required.");
    setLoading(true);
    setError("");
    setWarning("");
    try {
      const res = await fetch("/api/admin/create-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), ownerEmail: ownerEmail.trim(), plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create tenant.");
        return;
      }
      if (data.warning) {
        setWarning(data.warning);
        setSuccess(data.message ?? "Organization created.");
        return; // Keep modal open so admin sees the warning
      }
      // Full success — close after a moment
      setSuccess(`Organization created! Invitation sent to ${ownerEmail}.`);
      setTimeout(onClose, 1800);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success && !warning) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-xl border border-border/60 bg-card p-6 shadow-xl text-center space-y-3">
          <Check className="h-8 w-8 text-green-700 mx-auto" />
          <p className="text-sm font-medium">{success}</p>
          <p className="text-xs text-muted-foreground">The owner will receive an email invitation to sign in and set up their account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border/60 bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold">Add New Tenant</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Creates the organization and emails the owner an invite link.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Organization Name <span className="text-red-600">*</span></label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              className="mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Owner Email <span className="text-red-600">*</span></label>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="owner@company.com"
              className="mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-1">They'll receive an invite email and be set as org admin.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Plan</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as any)}
              className="mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {warning && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
              {warning}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border/60 px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Creating..." : "Create & Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditOrgModal({
  org,
  onClose,
  onSave,
}: {
  org: OrgWithCounts;
  onClose: () => void;
  onSave: (name: string, slug: string) => Promise<void>;
}) {
  const [name, setName] = useState(org.name);
  const [slug, setSlug] = useState(org.slug ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required.");
    setLoading(true);
    setError("");
    try {
      await onSave(name.trim(), slug.trim());
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border/60 bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold">Edit Organization</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="mt-1 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border/60 px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminOrganizationsPage() {
  const { user } = useUser();
  const router = useRouter();
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const impersonateAndView = async (org: OrgWithCounts) => {
    setImpersonatingId(org._id);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: org._id, roleView: "admin", orgName: org.name }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error("Impersonation failed", { description: data.error ?? "Unknown error" });
        return;
      }
      window.location.href = "/home";
    } finally {
      setImpersonatingId(null);
    }
  };

  const orgs = useQuery(
    api.admin.listAllOrganizations,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  const updatePlan = useMutation(api.admin.adminUpdateOrgPlan);
  const updateOrg = useMutation(api.admin.adminUpdateOrg);
  const deleteOrg = useMutation(api.admin.adminDeleteOrg);

  const [showAdd, setShowAdd] = useState(false);
  const [editingOrg, setEditingOrg] = useState<OrgWithCounts | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"organizations"> | null>(null);

  const handlePlanChange = async (
    organizationId: Id<"organizations">,
    plan: "free" | "starter" | "pro" | "enterprise"
  ) => {
    if (!user?.id) return;
    try {
      await updatePlan({ clerkUserId: user.id, organizationId, plan });
    } catch (error: any) {
      toast.error("Failed to update plan", { description: error.message });
    }
  };

  const handleDelete = async (org: OrgWithCounts) => {
    if (!user?.id) return;
    if (
      !confirm(
        `Delete "${org.name}"?\n\nThis will permanently delete the organization, all ${org.userCount} users, and all ${org.projectCount} projects. This cannot be undone.`
      )
    )
      return;
    setDeletingId(org._id);
    try {
      await deleteOrg({ clerkUserId: user.id, organizationId: org._id });
    } catch (err: any) {
      toast.error("Failed to delete", { description: err.message });
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = async (name: string, slug: string) => {
    if (!user?.id || !editingOrg) return;
    await updateOrg({ clerkUserId: user.id, organizationId: editingOrg._id, name, slug });
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All tenants on the platform. Each organization is an independent SaaS customer.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Tenant
        </button>
      </div>

      {orgs && orgs.length > 0 ? (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Requests</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Projects</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Users</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Change Plan</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(orgs as OrgWithCounts[]).map((org) => (
                <tr
                  key={org._id}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors"
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => impersonateAndView(org)}
                      disabled={impersonatingId === org._id}
                      className="group flex items-center gap-1.5 hover:text-primary transition-colors text-left disabled:opacity-60"
                      title="View tenant dashboard"
                    >
                      <div>
                        <p className="font-medium group-hover:text-primary">
                          {impersonatingId === org._id ? "Loading..." : org.name}
                        </p>
                        {org.slug && (
                          <p className="text-xs text-muted-foreground">{org.slug}</p>
                        )}
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={`capitalize text-[10px] ${PLAN_BADGE_COLORS[org.plan] || ""}`}
                    >
                      {org.plan}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {org.monthlyRequestCount ?? 0}/{(org.monthlyRequestLimit ?? 50) >= 999999 ? "∞" : (org.monthlyRequestLimit ?? 50)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{org.projectCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{org.userCount}</td>
                  <td className="px-4 py-3">
                    <select
                      value={org.plan}
                      onChange={(e) =>
                        handlePlanChange(
                          org._id,
                          e.target.value as "free" | "starter" | "pro" | "enterprise"
                        )
                      }
                      className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="free">Free</option>
                      <option value="starter">Starter</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setEditingOrg(org)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                        title="Edit organization"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(org)}
                        disabled={deletingId === org._id}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-red-500/20 bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        title="Delete organization"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : orgs && orgs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-border/40 bg-muted/10">
          <Building2 className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">No organizations yet</p>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add First Tenant
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">Loading organizations...</p>
        </div>
      )}

      {showAdd && (
        <AddTenantModal onClose={() => setShowAdd(false)} />
      )}
      {editingOrg && (
        <EditOrgModal
          org={editingOrg}
          onClose={() => setEditingOrg(null)}
          onSave={handleEdit}
        />
      )}
    </div>
  );
}
