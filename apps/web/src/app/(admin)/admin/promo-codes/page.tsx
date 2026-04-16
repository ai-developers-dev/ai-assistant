"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Ticket,
  Copy,
  Check,
  Ban,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";

const TYPE_BADGE: Record<string, string> = {
  trial_30d: "bg-blue-500/15 text-blue-700 border-blue-500/20",
  unlimited: "bg-amber-500/15 text-amber-700 border-amber-500/20",
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20",
  revoked: "bg-red-500/15 text-red-600 border-red-500/20",
  exhausted: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

const PLAN_BADGE: Record<string, string> = {
  pro: "bg-blue-500/15 text-blue-700 border-blue-500/20",
  team: "bg-purple-500/15 text-purple-700 border-purple-500/20",
  enterprise: "bg-amber-500/15 text-amber-700 border-amber-500/20",
};

const TYPE_LABELS: Record<string, string> = {
  trial_30d: "30-Day Trial",
  unlimited: "Unlimited",
};

export default function AdminPromoCodesPage() {
  const { user } = useUser();

  const codes = useQuery(
    api.promoCodes.listPromoCodes,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  const createCode = useMutation(api.promoCodes.createPromoCode);
  const revokeCode = useMutation(api.promoCodes.revokePromoCode);

  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<"trial_30d" | "unlimited">("trial_30d");
  const [plan, setPlan] = useState<"starter" | "pro" | "enterprise">("starter");
  const [maxRedemptions, setMaxRedemptions] = useState(1);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleCreate = async () => {
    if (!user?.id) return;
    setCreating(true);
    try {
      const result = await createCode({
        clerkUserId: user.id,
        type,
        plan,
        maxRedemptions,
        note: note.trim() || undefined,
      });
      setGeneratedCode(result.code);
      showFeedback("success", "Promo code created successfully.");
    } catch (err: any) {
      showFeedback("error", err.message || "Failed to create code.");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async (promoCodeId: Id<"promoCodes">) => {
    if (!user?.id) return;
    try {
      await revokeCode({ clerkUserId: user.id, promoCodeId });
      showFeedback("success", "Promo code revoked.");
    } catch (err: any) {
      showFeedback("error", err.message || "Failed to revoke code.");
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setGeneratedCode(null);
    setType("trial_30d");
    setPlan("pro");
    setMaxRedemptions(1);
    setNote("");
  };

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Promo Codes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage promotional access codes.
          </p>
        </div>
        <Button
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
          variant={showForm ? "outline" : "default"}
        >
          {showForm ? "Cancel" : "Create Code"}
        </Button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg border ${
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

      {/* Create Form */}
      {showForm && (
        <div className="rounded-xl border border-border/60 bg-card/80 p-6 space-y-4">
          <h3 className="text-sm font-semibold">Generate New Promo Code</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Type */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Type
              </label>
              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as "trial_30d" | "unlimited")
                }
                className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="trial_30d">30-Day Trial</option>
                <option value="unlimited">Unlimited Forever</option>
              </select>
            </div>

            {/* Plan */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Plan
              </label>
              <select
                value={plan}
                onChange={(e) =>
                  setPlan(e.target.value as "starter" | "pro" | "enterprise")
                }
                className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="pro">Pro</option>
                <option value="starter">Starter</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>

            {/* Max Redemptions */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Max Redemptions
              </label>
              <Input
                type="number"
                min={1}
                value={maxRedemptions}
                onChange={(e) =>
                  setMaxRedemptions(Math.max(1, parseInt(e.target.value) || 1))
                }
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Note (optional)
            </label>
            <Input
              placeholder="e.g. For launch event"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <Button onClick={handleCreate} disabled={creating}>
            {creating ? "Generating..." : "Generate Code"}
          </Button>

          {/* Generated Code Display */}
          {generatedCode && (
            <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border/60">
              <p className="text-xs text-muted-foreground mb-2">
                Generated Code:
              </p>
              <div className="flex items-center gap-3">
                <code className="text-2xl font-mono font-bold tracking-widest">
                  {generatedCode}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(generatedCode)}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 mr-1" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 mr-1" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Codes Table */}
      {codes && codes.length > 0 ? (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Code
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Type
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Plan
                </th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                  Redemptions
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Note
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Created
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr
                  key={code._id}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs tracking-wide">
                        {code.code}
                      </code>
                      <button
                        onClick={() => handleCopy(code.code)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${TYPE_BADGE[code.type] || ""}`}
                    >
                      {TYPE_LABELS[code.type] || code.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize ${PLAN_BADGE[code.plan] || ""}`}
                    >
                      {code.plan}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {code.currentRedemptions}/{code.maxRedemptions}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize ${STATUS_BADGE[code.status] || ""}`}
                    >
                      {code.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-[150px] truncate">
                    {code.note || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(code._creationTime).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {code.status === "active" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2 text-xs"
                        onClick={() => handleRevoke(code._id)}
                      >
                        <Ban className="h-3 w-3 mr-1" />
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : codes && codes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Ticket className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">
            No promo codes yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">
            Loading promo codes...
          </p>
        </div>
      )}
    </div>
  );
}
