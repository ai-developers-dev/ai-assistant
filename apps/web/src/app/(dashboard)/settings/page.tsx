"use client";

import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { useImpersonation } from "@/hooks/use-impersonation";
import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CreditCard,
  Key,
  User,
  CheckCircle,
  AlertCircle,
  Zap,
  Bot,
  Globe,
  Sparkles,
  Cloud,
  Search,
  Mail,
  MapPin,
  Users,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { useState, useCallback, useEffect } from "react";
import { CredentialManager } from "@/components/settings/credential-manager";
import { ProviderCard } from "@/components/settings/provider-card";
import { SocialAccountCard } from "@/components/settings/social-account-card";
import { AgentTeamSettings } from "@/components/settings/agent-team-settings";

/** Quick relative-time formatter for the "last checked" indicator. */
function formatRelativeTime(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleString();
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

const PLAN_PRICES: Record<string, string> = {
  free: "$0/month",
  starter: "$20/month",
  pro: "$50/month",
  enterprise: "Custom",
};

// Provider display config — grouped by section
const PROVIDER_GROUPS = [
  {
    label: "AI Models",
    description: "Connect your preferred AI model provider",
    providers: [
      { key: "openai", name: "OpenAI", icon: <Sparkles className="h-5 w-5" />, placeholder: "sk-...", docsUrl: "https://platform.openai.com/api-keys", supportsOAuth: true },
      { key: "anthropic", name: "Anthropic (Claude)", icon: <Bot className="h-5 w-5" />, placeholder: "sk-ant-...", docsUrl: "https://console.anthropic.com/settings/keys" },
      { key: "google", name: "Google (Gemini)", icon: <Globe className="h-5 w-5" />, placeholder: "AIza...", docsUrl: "https://aistudio.google.com/app/apikey" },
      { key: "openrouter", name: "OpenRouter", icon: <Cloud className="h-5 w-5" />, placeholder: "sk-or-v1-...", docsUrl: "https://openrouter.ai/keys" },
    ],
  },
  {
    label: "Lead Generation",
    description: "APIs for scraping, enrichment, and email outreach",
    providers: [
      { key: "outscraper", name: "Outscraper (Google Maps)", icon: <MapPin className="h-5 w-5" />, placeholder: "Your Outscraper API Key", docsUrl: "https://app.outscraper.com/api-docs" },
      { key: "firecrawl", name: "Firecrawl (Web Scraping)", icon: <Search className="h-5 w-5" />, placeholder: "fc-...", docsUrl: "https://www.firecrawl.dev/app/api-keys" },
      { key: "apollo", name: "Apollo.io (Contact Data)", icon: <Users className="h-5 w-5" />, placeholder: "Your Apollo API key", docsUrl: "https://app.apollo.io/settings/integrations/api_keys" },
      { key: "hunter", name: "Hunter.io (Email Finder)", icon: <Mail className="h-5 w-5" />, placeholder: "Your Hunter API key", docsUrl: "https://hunter.io/api-keys" },
    ],
    multiAccountProviders: [
      { key: "gmail_smtp_accounts" as const, name: "Gmail SMTP (Email Sending)", passwordLabel: "App Password", passwordPlaceholder: "16-char app password", maxAccounts: 20, throughputLabel: "emails/day" },
      { key: "warmed_email_accounts" as const, name: "Resend Email (API)", passwordLabel: "Resend API Key", passwordPlaceholder: "re_...", maxAccounts: 20, throughputLabel: "emails/day" },
    ],
  },
  {
    label: "Social Outreach",
    description: "Accounts for direct messaging and social posting",
    providers: [
      { key: "reddit", name: "Reddit (Official API)", icon: <Globe className="h-5 w-5" />, placeholder: "clientId|clientSecret|username|password", docsUrl: "https://www.reddit.com/prefs/apps" },
      { key: "twitter", name: "Twitter / X (API v2)", icon: <Globe className="h-5 w-5" />, placeholder: "Bearer token", docsUrl: "https://developer.x.com/en/portal/dashboard" },
      { key: "youtube_oauth", name: "YouTube (Data API)", icon: <Globe className="h-5 w-5" />, placeholder: "OAuth2 access token", docsUrl: "https://console.cloud.google.com/apis/credentials" },
      { key: "discord_webhooks", name: "Discord (Webhooks)", icon: <Globe className="h-5 w-5" />, placeholder: '[{"serverName":"...","channelName":"...","webhookUrl":"..."}]', docsUrl: "https://discord.com/developers/docs/resources/webhook" },
    ],
    multiAccountProviders: [
      { key: "meta_accounts" as const, name: "Facebook (DMs + Groups)", passwordLabel: "Password", passwordPlaceholder: "Facebook password", maxAccounts: 5, throughputLabel: "10 messages/account/day" },
      { key: "linkedin_accounts" as const, name: "LinkedIn (Connections)", passwordLabel: "Password", passwordPlaceholder: "LinkedIn password", maxAccounts: 5, throughputLabel: "10 connections/account/day" },
    ],
  },
];

export default function SettingsPage() {
  const { org } = useEffectiveOrg();
  const { orgId: impersonatedOrgId } = useImpersonation();

  // Use org._id from Convex query, OR fall back to impersonation cookie orgId
  const effectiveOrgId = org?._id || (impersonatedOrgId as any) || null;
  const { user } = useUser();

  const usageStats = useQuery(
    api.organizations.getUsageStats,
    effectiveOrgId ? { organizationId: effectiveOrgId } : "skip"
  );

  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Provider connection statuses
  const [providerStatuses, setProviderStatuses] = useState<
    Array<{ provider: string; connected: boolean; type: "oauth" | "api_key" | null; portalUrl?: string }>
  >([]);

  const showFeedback = useCallback((type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  // Social accounts (meta_accounts / linkedin_accounts) — list of {email, configuredAt}
  const [socialAccounts, setSocialAccounts] = useState<
    Record<string, Array<{ email: string; configuredAt: number }>>
  >({});

  // Track last refresh + error so users can see if status is stale or the probe failed.
  const [statusLastCheckedAt, setStatusLastCheckedAt] = useState<number | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProviderStatuses = useCallback(async () => {
    if (!effectiveOrgId) return;
    setRefreshing(true);
    setStatusError(null);
    try {
      const [statusRes, metaRes, linkedinRes, gmailRes, resendRes] = await Promise.all([
        fetch(`/api/provider-keys?organizationId=${effectiveOrgId}`),
        fetch(`/api/provider-keys/social-accounts?provider=meta_accounts&organizationId=${effectiveOrgId}`),
        fetch(`/api/provider-keys/social-accounts?provider=linkedin_accounts&organizationId=${effectiveOrgId}`),
        fetch(`/api/provider-keys/social-accounts?provider=gmail_smtp_accounts&organizationId=${effectiveOrgId}`),
        fetch(`/api/provider-keys/social-accounts?provider=warmed_email_accounts&organizationId=${effectiveOrgId}`),
      ]);
      if (!statusRes.ok) throw new Error(`Status probe failed (${statusRes.status})`);
      const statusData = await statusRes.json();
      if (statusData.providers) setProviderStatuses(statusData.providers);

      const metaData = await metaRes.json();
      const linkedinData = await linkedinRes.json();
      const gmailData = await gmailRes.json();
      const resendData = await resendRes.json();
      setSocialAccounts({
        meta_accounts: metaData.accounts || [],
        linkedin_accounts: linkedinData.accounts || [],
        gmail_smtp_accounts: gmailData.accounts || [],
        warmed_email_accounts: resendData.accounts || [],
      });
      setStatusLastCheckedAt(Date.now());
    } catch (err: any) {
      setStatusError(err?.message ?? "Unable to check connection status");
    } finally {
      setRefreshing(false);
    }
  }, [effectiveOrgId]);

  useEffect(() => {
    fetchProviderStatuses();
  }, [fetchProviderStatuses]);

  const usagePercent = usageStats
    ? Math.min(
        100,
        Math.round(
          (usageStats.monthlyRequestCount / usageStats.monthlyRequestLimit) *
            100
        )
      )
    : 0;

  const getStatusForProvider = (provider: string) => {
    return providerStatuses.find((s) => s.provider === provider) || {
      provider,
      connected: false,
      type: null as "oauth" | "api_key" | null,
    };
  };

  if (!effectiveOrgId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-6 w-6 border-2 border-muted-foreground border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account, billing, and organization settings.
        </p>
      </div>

      {/* Connection Status */}
      <div className="rounded-lg border border-border p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Connection Status</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {providerStatuses.filter(s => s.connected).length}/{providerStatuses.length} connected
            </span>
            {statusLastCheckedAt && (
              <span className="text-muted-foreground/70">
                · checked {formatRelativeTime(statusLastCheckedAt)}
              </span>
            )}
            <button
              type="button"
              onClick={() => fetchProviderStatuses()}
              disabled={refreshing}
              className="ml-1 rounded-md border border-border bg-background px-2 py-0.5 hover:bg-muted disabled:opacity-50"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
        {statusError && (
          <p className="text-xs text-red-600" role="alert">{statusError}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {providerStatuses.map(s => (
            <span key={s.provider} className={`text-[11px] px-2 py-0.5 rounded-full ${s.connected ? "bg-green-500/10 text-green-700" : "bg-muted text-muted-foreground/50"}`}>
              {s.connected ? "\u2713" : "\u2717"} {s.provider}
            </span>
          ))}
        </div>
      </div>

      {/* Feedback banner */}
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

      {/* Team Management shortcut */}
      <Link
        href="/settings/team"
        className="group flex items-center justify-between rounded-xl border border-border/60 bg-card/80 p-5 hover:bg-card transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Team Members</p>
            <p className="text-xs text-muted-foreground">Manage roles and access for your organization</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </Link>

      {/* Plan & Billing */}
      <div id="billing" className="scroll-mt-20 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Plan & Billing</h2>
        </div>
        {org && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">
                  Current Plan:{" "}
                  <Badge className="ml-2 uppercase">
                    {PLAN_LABELS[org.plan] || org.plan}
                  </Badge>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {PLAN_PRICES[org.plan]}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {org.plan === "free"
                    ? "Upgrade for more requests and premium models"
                    : "Your plan renews automatically"}
                </p>
              </div>
              {(org.plan === "free" || org.plan === "starter") && (
                <Button>
                  {org.plan === "free" ? "Upgrade" : "Upgrade to Pro"}
                </Button>
              )}
            </div>
            <Separator />

            {/* Monthly Usage Meter */}
            {usageStats && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Monthly Requests</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {usageStats.monthlyRequestCount.toLocaleString()} /{" "}
                    {usageStats.monthlyRequestLimit >= 999999
                      ? "Unlimited"
                      : usageStats.monthlyRequestLimit.toLocaleString()}
                  </p>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      usagePercent >= 90
                        ? "bg-destructive"
                        : usagePercent >= 70
                          ? "bg-amber-500"
                          : "bg-primary"
                    }`}
                    style={{
                      width: `${usageStats.monthlyRequestLimit >= 999999 ? 5 : usagePercent}%`,
                    }}
                  />
                </div>
                {usagePercent >= 90 &&
                  usageStats.monthlyRequestLimit < 999999 && (
                    <p className="text-xs text-amber-700">
                      You're approaching your monthly limit. Upgrade for more
                      requests.
                    </p>
                  )}
              </div>
            )}

            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Projects</p>
                <p className="text-xl font-bold">
                  {usageStats?.projectCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  of{" "}
                  {usageStats?.maxProjects === 999999
                    ? "unlimited"
                    : usageStats?.maxProjects}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Storage</p>
                <p className="text-xl font-bold">
                  {usageStats
                    ? formatBytes(usageStats.storageUsedBytes)
                    : "..."}
                </p>
                <p className="text-xs text-muted-foreground">
                  of{" "}
                  {usageStats
                    ? formatBytes(usageStats.maxStorageBytes)
                    : "..."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Team */}
      <AgentTeamSettings />

      {/* Connected Providers */}
      <div id="connected-providers" className="rounded-xl border border-border bg-card p-6 scroll-mt-8">
        <div className="flex items-center gap-2 mb-4">
          <Key className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Connected Providers</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Connect your own API keys or accounts for direct provider access.
          Any connected provider bypasses the monthly request quota and reduces latency.
        </p>

        <div className="space-y-6">
          {PROVIDER_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </span>
                {group.description && (
                  <span className="text-xs text-muted-foreground">— {group.description}</span>
                )}
              </div>
              <div className="space-y-2">
                {/* Standard API-key providers */}
                {group.providers.map((p) => {
                  const status = getStatusForProvider(p.key);
                  return (
                    <ProviderCard
                      key={`${group.label}-${p.key}`}
                      provider={p.key}
                      name={p.name}
                      icon={p.icon}
                      connected={status.connected}
                      connectionType={status.type}
                      supportsOAuth={"supportsOAuth" in p ? (p.supportsOAuth ?? false) : false}
                      keyPlaceholder={p.placeholder}
                      docsUrl={p.docsUrl}
                      organizationId={effectiveOrgId || ""}
                      onUpdate={fetchProviderStatuses}
                      onFeedback={showFeedback}
                    />
                  );
                })}
                {/* Multi-account providers (email senders, social logins) */}
                {"multiAccountProviders" in group && group.multiAccountProviders?.map((mp) => {
                  const isEmailProvider = mp.key === "gmail_smtp_accounts" || mp.key === "warmed_email_accounts";
                  return (
                    <SocialAccountCard
                      key={`${group.label}-${mp.key}`}
                      provider={mp.key}
                      name={mp.name}
                      icon={isEmailProvider ? <Mail className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                      accounts={socialAccounts[mp.key] || []}
                      organizationId={effectiveOrgId || ""}
                      onUpdate={fetchProviderStatuses}
                      onFeedback={showFeedback}
                      maxAccounts={mp.maxAccounts}
                      passwordLabel={mp.passwordLabel}
                      passwordPlaceholder={mp.passwordPlaceholder}
                      throughputLabel={mp.throughputLabel}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Service Credentials */}
      <CredentialManager />

      {/* Profile */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Profile</h2>
        </div>
        <div className="space-y-2">
          <p className="text-sm">
            <span className="text-muted-foreground">Name:</span>{" "}
            {user?.fullName || "Not set"}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Email:</span>{" "}
            {user?.emailAddresses[0]?.emailAddress}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Organization:</span>{" "}
            {org?.name || "Loading..."}
          </p>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
