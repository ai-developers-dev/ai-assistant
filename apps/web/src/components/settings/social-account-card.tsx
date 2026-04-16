"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  EyeOff,
  Check,
  X,
  Trash2,
  Plus,
  Loader2,
  UserCircle2,
  Send,
  CheckCircle,
  XCircle,
} from "lucide-react";

export type MultiAccountProvider = "meta_accounts" | "linkedin_accounts" | "gmail_smtp_accounts" | "warmed_email_accounts";

/** Per-account row with optional Send Test for email providers */
function AccountRow({
  email,
  isEmail,
  provider,
  organizationId,
  onRemove,
  removing,
}: {
  email: string;
  isEmail: boolean;
  provider: MultiAccountProvider;
  organizationId: string;
  onRemove: (email: string) => void;
  removing: boolean;
}) {
  const [testOpen, setTestOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Map multi-account provider back to single provider for send-test API
  const singleProvider = provider === "gmail_smtp_accounts" ? "gmail_smtp" : "warmed_email";

  const handleSendTest = async () => {
    if (!testEmail.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/provider-keys/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: singleProvider,
          organizationId,
          recipientEmail: testEmail.trim(),
          fromAccount: email, // specify which account to send from
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: `Sent to ${testEmail}` });
        setTimeout(() => { setResult(null); setTestOpen(false); setTestEmail(""); }, 3000);
      } else {
        setResult({ success: false, message: data.error || "Send failed" });
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || "Send failed" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-md bg-muted/50 border border-border px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-foreground font-mono">{email}</span>
          <span className="text-emerald-700 text-[10px]">· Connected</span>
        </div>
        <div className="flex items-center gap-1">
          {isEmail && !testOpen && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setTestOpen(true)}
            >
              <Send className="h-3 w-3 mr-1" />
              Send Test
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onRemove(email)}
            disabled={removing}
          >
            {removing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>
      {testOpen && (
        <div className="flex items-center gap-1.5 pl-5">
          <Input
            type="email"
            placeholder="test@email.com"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSendTest();
              if (e.key === "Escape") { setTestOpen(false); setTestEmail(""); setResult(null); }
            }}
            className="h-7 text-xs w-44"
            autoFocus
          />
          <Button
            size="sm"
            className="h-7 text-xs px-2"
            onClick={handleSendTest}
            disabled={!testEmail.trim() || sending}
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-1.5"
            onClick={() => { setTestOpen(false); setTestEmail(""); setResult(null); }}
          >
            ✕
          </Button>
          {result && (
            <span className={`text-[10px] flex items-center gap-1 ${result.success ? "text-emerald-700" : "text-red-600"}`}>
              {result.success ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {result.message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export interface SocialAccountCardProps {
  provider: MultiAccountProvider;
  name: string;
  icon?: React.ReactNode;
  accounts: Array<{ email: string; configuredAt: number }>;
  organizationId: string;
  onUpdate: () => void;
  onFeedback: (type: "success" | "error", message: string) => void;
  /** Max accounts allowed (default 20 for email, unlimited for social) */
  maxAccounts?: number;
  /** Custom label for the password field */
  passwordLabel?: string;
  /** Custom placeholder for the password field */
  passwordPlaceholder?: string;
  /** Custom throughput label (default: "10 outreach per account per day") */
  throughputLabel?: string;
}

export function SocialAccountCard({
  provider,
  name,
  icon,
  accounts,
  organizationId,
  onUpdate,
  onFeedback,
  maxAccounts,
  passwordLabel,
  passwordPlaceholder,
  throughputLabel,
}: SocialAccountCardProps) {
  const isEmail = provider === "gmail_smtp_accounts" || provider === "warmed_email_accounts";
  const limit = maxAccounts ?? (isEmail ? 20 : undefined);
  const atLimit = limit != null && accounts.length >= limit;
  const [showAddForm, setShowAddForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!email.trim() || !password.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/provider-keys/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, email: email.trim(), password, organizationId }),
      });
      const data = await res.json();
      if (data.success) {
        onFeedback("success", `${name} account added.`);
        setEmail("");
        setPassword("");
        setShowAddForm(false);
        onUpdate();
      } else {
        onFeedback("error", data.error || "Failed to add account.");
      }
    } catch (err: any) {
      onFeedback("error", err.message || "Failed to add account.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (accountEmail: string) => {
    setRemovingEmail(accountEmail);
    try {
      const res = await fetch("/api/provider-keys/social-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, email: accountEmail, organizationId }),
      });
      const data = await res.json();
      if (data.success) {
        onFeedback("success", `Account removed.`);
        onUpdate();
      } else {
        onFeedback("error", data.error || "Failed to remove account.");
      }
    } catch (err: any) {
      onFeedback("error", err.message || "Failed to remove account.");
    } finally {
      setRemovingEmail(null);
    }
  };

  return (
    <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{name}</p>
              {accounts.length > 0 && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  {accounts.length}{limit ? `/${limit}` : ""} account{accounts.length !== 1 ? "s" : ""}
                  {throughputLabel ? (
                    <>
                      <span className="text-emerald-700 ml-0.5">·</span>
                      <span className="text-emerald-700">{throughputLabel}</span>
                    </>
                  ) : !isEmail ? (
                    <>
                      <span className="text-emerald-700 ml-0.5">·</span>
                      <span className="text-emerald-700">up to {accounts.length * 10}/day</span>
                    </>
                  ) : null}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {accounts.length === 0
                ? "No accounts connected"
                : throughputLabel
                  ? `${accounts.length} account${accounts.length !== 1 ? "s" : ""} — ${throughputLabel}`
                  : isEmail
                    ? `${accounts.length} account${accounts.length !== 1 ? "s" : ""} connected`
                    : `${accounts.length} account${accounts.length !== 1 ? "s" : ""} — 10 outreach per account per day`}
            </p>
          </div>
        </div>

        {!showAddForm && !atLimit && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-3 w-3" />
            Add Account
          </Button>
        )}
      </div>

      {/* Existing accounts list */}
      {accounts.length > 0 && (
        <div className="space-y-1.5">
          {accounts.map((acct) => (
            <AccountRow
              key={acct.email}
              email={acct.email}
              isEmail={isEmail}
              provider={provider}
              organizationId={organizationId}
              onRemove={handleRemove}
              removing={removingEmail === acct.email}
            />
          ))}
        </div>
      )}

      {/* Add account form */}
      {showAddForm && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Add account</p>

          {/* Email field */}
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Email</label>
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              className="h-8 text-sm"
            />
          </div>

          {/* Password field */}
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">{passwordLabel || "Password"}</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder={passwordPlaceholder || "••••••••"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") {
                    setShowAddForm(false);
                    setEmail("");
                    setPassword("");
                  }
                }}
                className="h-8 text-sm pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleAdd}
              disabled={!email.trim() || !password.trim() || saving}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Check className="h-3 w-3 mr-1" />
              )}
              Save Account
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => {
                setShowAddForm(false);
                setEmail("");
                setPassword("");
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
