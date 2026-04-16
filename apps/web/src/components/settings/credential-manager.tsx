"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { useImpersonation } from "@/hooks/use-impersonation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Globe,
  X,
} from "lucide-react";

const SERVICES = [
  { value: "opentable", label: "OpenTable" },
  { value: "resy", label: "Resy" },
  { value: "expedia", label: "Expedia" },
  { value: "booking_com", label: "Booking.com" },
  { value: "custom", label: "Custom Service" },
] as const;

interface CredentialMetadata {
  _id: string;
  _creationTime: number;
  serviceName: string;
  serviceLabel: string;
  lastUsedAt: number | null;
  status: string;
}

export function CredentialManager() {
  const { org, effectiveClerkOrgId, isImpersonating } = useEffectiveOrg();
  const { orgId: impersonatedOrgId } = useImpersonation();
  const effectiveOrgId = org?._id || (impersonatedOrgId as any) || null;
  const { user } = useUser();

  const convexUser = useQuery(
    api.users.getCurrent,
    user?.id && effectiveClerkOrgId
      ? { clerkUserId: user.id, clerkOrgId: effectiveClerkOrgId }
      : "skip"
  );

  const [credentials, setCredentials] = useState<CredentialMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Form state
  const [serviceName, setServiceName] = useState("opentable");
  const [serviceLabel, setServiceLabel] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchCredentials = useCallback(async () => {
    if (!effectiveOrgId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/credentials?organizationId=${effectiveOrgId}`
      );
      const data = await res.json();
      if (data.credentials) {
        setCredentials(data.credentials);
      }
    } catch {
      // Silently fail — list will be empty
    } finally {
      setLoading(false);
    }
  }, [effectiveOrgId]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const handleAdd = async () => {
    if (!effectiveOrgId || !convexUser?._id || !username || !password || !serviceLabel) return;
    setSaving(true);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: effectiveOrgId,
          userId: convexUser._id,
          serviceName,
          serviceLabel,
          username,
          password,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback("success", "Credential saved securely.");
        setShowAddForm(false);
        resetForm();
        fetchCredentials();
      } else {
        showFeedback("error", data.error || "Failed to save credential.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "Failed to save credential.");
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (credentialId: string) => {
    try {
      const res = await fetch("/api/credentials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback("success", "Credential revoked.");
        fetchCredentials();
      } else {
        showFeedback("error", data.error || "Failed to revoke credential.");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "Failed to revoke credential.");
    }
  };

  const resetForm = () => {
    setServiceName("opentable");
    setServiceLabel("");
    setUsername("");
    setPassword("");
    setShowPassword(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Service Credentials</h2>
        </div>
        {!showAddForm && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Credential
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Store login credentials for booking services. Credentials are encrypted
        at rest and only decrypted when the AI agent needs to log in on your
        behalf.
      </p>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg border mb-4 ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700"
              : "bg-destructive/10 border-destructive/20 text-destructive"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <p className="text-sm">{feedback.message}</p>
        </div>
      )}

      {/* Add credential form */}
      {showAddForm && (
        <div className="p-4 rounded-lg bg-muted/30 border border-border mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">New Credential</p>
            <button
              onClick={() => {
                setShowAddForm(false);
                resetForm();
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Service
            </label>
            <select
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
            >
              {SERVICES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Label
            </label>
            <Input
              placeholder="e.g. OpenTable - John's Account"
              value={serviceLabel}
              onChange={(e) => setServiceLabel(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Username / Email
            </label>
            <Input
              placeholder="john@example.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Password
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAddForm(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!serviceLabel || !username || !password || saving}
            >
              {saving ? "Saving..." : "Save Credential"}
            </Button>
          </div>
        </div>
      )}

      {/* Credential list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading credentials...</p>
      ) : credentials.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No credentials saved yet.</p>
          <p className="text-xs mt-1">
            Add credentials for booking services like OpenTable, Resy, or
            Expedia.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {credentials.map((cred) => (
            <div
              key={cred._id}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border"
            >
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{cred.serviceLabel}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-xs">
                      {SERVICES.find((s) => s.value === cred.serviceName)
                        ?.label || cred.serviceName}
                    </Badge>
                    {cred.lastUsedAt && (
                      <span className="text-xs text-muted-foreground">
                        Last used{" "}
                        {new Date(cred.lastUsedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2"
                onClick={() => handleRevoke(cred._id)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
