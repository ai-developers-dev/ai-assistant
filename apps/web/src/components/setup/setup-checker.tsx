"use client";

import { useState, useEffect, useCallback } from "react";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Shield,
  Zap,
  Mail,
  Search,
  Users,
  BarChart3,
  Globe,
  KeyRound,
  Settings,
  DollarSign,
} from "lucide-react";

// ── Credential definitions with explanations ──

interface CredentialDef {
  key: string;
  name: string;
  category: "core" | "ai" | "email" | "enrichment" | "social" | "analytics";
  priority: "required" | "recommended" | "optional";
  description: string;
  impact: string;
  pricing: string;        // e.g. "Free tier available" or "$20/mo"
  setupUrl?: string;
  envVar?: string; // Server-side env var (not checkable from client, but informational)
  isOrgKey?: boolean; // Stored in org.providerKeys
}

const CREDENTIAL_DEFS: CredentialDef[] = [
  // ── Core (Required) ──
  {
    key: "openrouter",
    name: "OpenRouter",
    category: "core",
    priority: "required",
    description: "Routes AI requests to Claude, GPT, Gemini, and other models through a single API key.",
    impact: "Without this, no AI agents can run. All agent execution, chat, and automation stops.",
    pricing: "Pay-per-use. No monthly fee. ~$0.001-$0.01 per request depending on model. $5 free credit on signup.",
    setupUrl: "https://openrouter.ai/keys",
    isOrgKey: true,
  },

  // ── AI Models ──
  {
    key: "openai",
    name: "OpenAI",
    category: "ai",
    priority: "recommended",
    description: "Direct access to GPT models and embeddings for memory/search features.",
    impact: "Embeddings for project memory and semantic search won't work. Agent chat falls back to OpenRouter only.",
    pricing: "Pay-per-use. GPT-4o: ~$2.50/1M input tokens. Embeddings: ~$0.10/1M tokens. No monthly minimum.",
    setupUrl: "https://platform.openai.com/api-keys",
    isOrgKey: true,
  },
  {
    key: "anthropic",
    name: "Anthropic (Claude)",
    category: "ai",
    priority: "optional",
    description: "Direct access to Claude models for higher rate limits and lower latency.",
    impact: "Claude requests go through OpenRouter instead. Slightly higher latency and cost.",
    pricing: "Pay-per-use. Claude Sonnet: ~$3/1M input tokens. $5 free credit on signup. No monthly minimum.",
    setupUrl: "https://console.anthropic.com/settings/keys",
    isOrgKey: true,
  },
  {
    key: "google",
    name: "Google AI (Gemini)",
    category: "ai",
    priority: "optional",
    description: "Direct access to Gemini models for multi-model agent pipelines.",
    impact: "Gemini requests go through OpenRouter. No direct impact if OpenRouter is configured.",
    pricing: "Free tier: 15 requests/min. Pay-per-use after: Gemini Pro ~$1.25/1M input tokens.",
    setupUrl: "https://aistudio.google.com/apikey",
    isOrgKey: true,
  },

  // ── Email ──
  {
    key: "gmail_smtp",
    name: "Gmail SMTP",
    category: "email",
    priority: "required",
    description: "Gmail app password for sending outreach emails via SMTP. Higher deliverability than transactional services for cold email.",
    impact: "Cannot send outreach emails via Gmail. The entire email outreach pipeline is disabled unless Resend is configured.",
    pricing: "Free. Uses your existing Gmail account. Limit: 500 emails/day per account.",
    setupUrl: "https://myaccount.google.com/apppasswords",
    isOrgKey: true,
  },
  {
    key: "resend",
    name: "Resend",
    category: "email",
    priority: "recommended",
    description: "Transactional email API for sending outreach with open/click tracking and webhook-based delivery feedback.",
    impact: "No email open tracking, no bounce detection, no click tracking. Email outreach works but is blind to engagement.",
    pricing: "Free tier: 3,000 emails/mo + 100/day. Pro: $20/mo for 50,000 emails/mo.",
    setupUrl: "https://resend.com/api-keys",
    envVar: "RESEND_API_KEY",
  },
  {
    key: "warmed_email",
    name: "Warmed Email Account",
    category: "email",
    priority: "recommended",
    description: "A separate email account that has been warmed up for cold outreach. Protects your primary domain reputation.",
    impact: "Cold emails sent from your primary domain risk damaging its reputation and landing in spam.",
    pricing: "Instantly.ai: $30/mo (Growth plan). Includes warmup + sending for 1 account. Or use free Gmail warmup tools.",
    setupUrl: "https://instantly.ai/app/accounts",
    isOrgKey: true,
  },

  // ── Lead Enrichment ──
  {
    key: "firecrawl",
    name: "Firecrawl",
    category: "enrichment",
    priority: "required",
    description: "Web scraping API that extracts clean content from business websites for enrichment, contact form discovery, and website quality analysis.",
    impact: "Cannot scrape business websites. Website quality scoring, contact form detection, and deep enrichment are disabled.",
    pricing: "Free tier: 500 credits. Hobby: $19/mo for 3,000 credits. 1 credit = 1 page scrape.",
    setupUrl: "https://www.firecrawl.dev/app/api-keys",
    isOrgKey: true,
  },
  {
    key: "outscraper",
    name: "Outscraper",
    category: "enrichment",
    priority: "required",
    description: "Google Places API proxy for finding businesses, fetching reviews, ratings, and contact info by city and vertical.",
    impact: "Cannot scrape Google Maps. The entire business scraping pipeline (the first step of lead gen) is disabled.",
    pricing: "Free tier: 25 requests. Pay-per-use: ~$3 per 1,000 places. Reviews: ~$2 per 1,000.",
    setupUrl: "https://app.outscraper.com/api-usage",
    isOrgKey: true,
  },
  {
    key: "hunter",
    name: "Hunter.io",
    category: "enrichment",
    priority: "recommended",
    description: "Email finder API that discovers business owner email addresses from company domains.",
    impact: "Fewer email addresses found during enrichment. Lead scoring drops because email is worth +15 points.",
    pricing: "Free tier: 25 searches/mo. Starter: $49/mo for 500 searches. $0.10 per extra search.",
    setupUrl: "https://hunter.io/api-keys",
    isOrgKey: true,
  },
  {
    key: "apollo",
    name: "Apollo.io",
    category: "enrichment",
    priority: "recommended",
    description: "Business owner search API that finds owner names, titles, and LinkedIn profiles from company data.",
    impact: "Owner name discovery relies on website scraping only. LinkedIn outreach channel may be limited.",
    pricing: "Free tier: 10,000 credits/mo (50 mobile numbers, 100 exports). Basic: $49/mo for unlimited email credits.",
    setupUrl: "https://app.apollo.io/#/settings/integrations/api",
    isOrgKey: true,
  },

  // ── Social Outreach ──
  {
    key: "meta",
    name: "Meta (Facebook)",
    category: "social",
    priority: "optional",
    description: "Meta API access for finding Facebook business pages and sending connection requests.",
    impact: "Facebook outreach channel is disabled. Multi-channel sequence skips Meta steps.",
    pricing: "Free. Meta Graph API has no cost. Requires a Facebook Developer account.",
    setupUrl: "https://developers.facebook.com/apps/",
    isOrgKey: true,
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    category: "social",
    priority: "optional",
    description: "LinkedIn API access for sending connection requests and InMail messages to business owners.",
    impact: "LinkedIn outreach channel is disabled. Multi-channel sequence skips LinkedIn steps.",
    pricing: "Free for basic API. Marketing API requires LinkedIn Ads account. InMail requires Premium ($59.99/mo).",
    setupUrl: "https://www.linkedin.com/developers/apps",
    isOrgKey: true,
  },
  {
    key: "reddit",
    name: "Reddit",
    category: "social",
    priority: "optional",
    description: "Reddit API for posting in relevant subreddits to generate inbound leads.",
    impact: "Reddit social presence posting is disabled. No effect on direct outreach.",
    pricing: "Free. 100 requests/min for OAuth apps. Requires a Reddit account.",
    setupUrl: "https://www.reddit.com/prefs/apps",
    isOrgKey: true,
  },

  // ── Analytics & Search ──
  {
    key: "google_custom_search",
    name: "Google Custom Search",
    category: "analytics",
    priority: "optional",
    description: "Google Custom Search API for web research during enrichment.",
    impact: "Web research falls back to Firecrawl search. Slightly less comprehensive results.",
    pricing: "Free tier: 100 queries/day. $5 per 1,000 queries after that.",
    setupUrl: "https://programmablesearchengine.google.com/controlpanel/all",
    isOrgKey: true,
  },
];

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  core: {
    label: "Core AI Engine",
    icon: <Zap className="h-4 w-4" />,
    description: "Required for any AI functionality",
  },
  ai: {
    label: "AI Models",
    icon: <Zap className="h-4 w-4" />,
    description: "Direct model access for better performance",
  },
  email: {
    label: "Email Outreach",
    icon: <Mail className="h-4 w-4" />,
    description: "Send and track outreach emails",
  },
  enrichment: {
    label: "Lead Enrichment",
    icon: <Search className="h-4 w-4" />,
    description: "Find and enrich business data",
  },
  social: {
    label: "Social Outreach",
    icon: <Users className="h-4 w-4" />,
    description: "Multi-channel social presence",
  },
  analytics: {
    label: "Analytics & Search",
    icon: <BarChart3 className="h-4 w-4" />,
    description: "Enhanced research capabilities",
  },
};

const PRIORITY_STYLES = {
  required: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", label: "Required" },
  recommended: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", label: "Recommended" },
  optional: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", label: "Optional" },
};

// ── Component ──

export function SetupChecker() {
  const { org } = useEffectiveOrg();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["core", "email", "enrichment"]));
  const [providerStatuses, setProviderStatuses] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const orgId = org?._id;

  // Fetch provider connection statuses
  const checkProviders = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/provider-keys?organizationId=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        const statuses: Record<string, boolean> = {};
        for (const p of data.providers ?? []) {
          statuses[p.provider] = p.connected;
        }
        // Also count multi-account providers
        if (statuses.gmail_smtp_accounts) statuses.gmail_smtp = true;
        if (statuses.meta_accounts) statuses.meta = true;
        if (statuses.linkedin_accounts) statuses.linkedin = true;
        if (statuses.warmed_email_accounts) statuses.warmed_email = true;
        setProviderStatuses(statuses);
      }
    } catch { /* non-fatal */ }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    checkProviders();
  }, [checkProviders]);

  // Check if session storage has the dismissed flag (per-session only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const key = `setup-checker-dismissed-${orgId}`;
      if (sessionStorage.getItem(key) === "true") {
        setDismissed(true);
      }
    }
  }, [orgId]);

  const handleDismiss = () => {
    setDismissed(true);
    setOpen(false);
    if (typeof window !== "undefined" && orgId) {
      sessionStorage.setItem(`setup-checker-dismissed-${orgId}`, "true");
    }
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Compute missing credentials
  const missing = CREDENTIAL_DEFS.filter((d) => !providerStatuses[d.key]);
  const missingRequired = missing.filter((d) => d.priority === "required");
  const missingRecommended = missing.filter((d) => d.priority === "recommended");
  const connected = CREDENTIAL_DEFS.filter((d) => providerStatuses[d.key]);
  const totalConfigured = connected.length;
  const totalCredentials = CREDENTIAL_DEFS.length;
  const completionPct = Math.round((totalConfigured / totalCredentials) * 100);

  // Group by category
  const categories = Array.from(new Set(CREDENTIAL_DEFS.map((d) => d.category)));

  // Don't show if everything is configured or dismissed
  if (loading || dismissed) return null;
  if (missingRequired.length === 0 && missingRecommended.length === 0) return null;

  // Banner (collapsed state)
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-4 py-2 text-xs border-b transition-colors hover:bg-muted/50 cursor-pointer"
        style={{
          backgroundColor: missingRequired.length > 0 ? "rgba(239,68,68,0.06)" : "rgba(245,158,11,0.06)",
          borderColor: missingRequired.length > 0 ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
        }}
      >
        {missingRequired.length > 0 ? (
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
        ) : (
          <Shield className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        )}
        <span className={missingRequired.length > 0 ? "text-red-300" : "text-amber-300"}>
          {missingRequired.length > 0
            ? `${missingRequired.length} required API${missingRequired.length !== 1 ? "s" : ""} missing`
            : `${missingRecommended.length} recommended API${missingRecommended.length !== 1 ? "s" : ""} not configured`}
          {" "}
          <span className="text-muted-foreground">
            — {totalConfigured}/{totalCredentials} connected ({completionPct}%)
          </span>
        </span>
        <span className="ml-auto text-muted-foreground hover:text-foreground">View setup &rarr;</span>
      </button>
    );
  }

  // Full modal overlay
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[85vh] mx-4 rounded-xl border border-border/60 bg-card shadow-2xl shadow-black/40 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Setup Status</h2>
              <p className="text-xs text-muted-foreground">
                {totalConfigured}/{totalCredentials} APIs connected
                <span className="mx-1.5">|</span>
                <span className={missingRequired.length > 0 ? "text-red-400" : "text-green-400"}>
                  {missingRequired.length > 0
                    ? `${missingRequired.length} required missing`
                    : "All required connected"}
                </span>
              </p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-6 py-3 border-b border-border/20">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${completionPct}%`,
                  backgroundColor: completionPct === 100 ? "#22c55e" : completionPct >= 60 ? "#eab308" : "#ef4444",
                }}
              />
            </div>
            <span className="text-xs font-mono text-muted-foreground w-10 text-right">{completionPct}%</span>
          </div>
        </div>

        {/* Credential list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {categories.map((cat) => {
            const catDefs = CREDENTIAL_DEFS.filter((d) => d.category === cat);
            const catMissing = catDefs.filter((d) => !providerStatuses[d.key]);
            const catMeta = CATEGORY_META[cat];
            const isExpanded = expandedCategories.has(cat);

            return (
              <div key={cat} className="rounded-lg border border-border/40 overflow-hidden">
                <button
                  onClick={() => toggleCategory(cat)}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                >
                  <span className="text-muted-foreground">{catMeta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{catMeta.label}</span>
                      <span className="text-xs text-muted-foreground">({catDefs.length - catMissing.length}/{catDefs.length})</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{catMeta.description}</p>
                  </div>
                  {catMissing.length > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      catMissing.some((d) => d.priority === "required") ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
                    }`}>
                      {catMissing.length} missing
                    </span>
                  )}
                  {catMissing.length === 0 && (
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                  )}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-border/20">
                    {catDefs.map((def) => {
                      const isConnected = providerStatuses[def.key];
                      const pStyle = PRIORITY_STYLES[def.priority];

                      return (
                        <div
                          key={def.key}
                          className={`px-4 py-3 border-b border-border/10 last:border-b-0 ${
                            !isConnected ? "bg-muted/5" : ""
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {isConnected ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                            ) : (
                              <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${pStyle.text}`} />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{def.name}</span>
                                {!isConnected && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${pStyle.bg} ${pStyle.text} ${pStyle.border} border`}>
                                    {pStyle.label}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                {def.description}
                              </p>
                              <p className="text-xs mt-1 leading-relaxed flex items-center gap-1">
                                <DollarSign className="h-3 w-3 text-emerald-400 shrink-0" />
                                <span className="text-emerald-400/90">{def.pricing}</span>
                              </p>
                              {!isConnected && (
                                <>
                                  <p className="text-xs mt-1.5 leading-relaxed" style={{ color: pStyle.text.replace("text-", "").includes("red") ? "#f87171" : pStyle.text.includes("amber") ? "#fbbf24" : "#60a5fa" }}>
                                    <strong>Impact:</strong> {def.impact}
                                  </p>
                                  <div className="flex items-center gap-2 mt-2">
                                    {def.setupUrl && (
                                      <a
                                        href={def.setupUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors"
                                      >
                                        <KeyRound className="h-3 w-3" />
                                        Get API Key
                                        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                                      </a>
                                    )}
                                    <button
                                      onClick={() => { setOpen(false); router.push("/settings"); }}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40 transition-colors"
                                    >
                                      <Settings className="h-3 w-3" />
                                      Connect in Settings
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border/40 bg-muted/10">
          <button
            onClick={handleDismiss}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Dismiss for this session
          </button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button size="sm" onClick={() => { setOpen(false); router.push("/settings"); }}>
              <Settings className="h-3.5 w-3.5 mr-1" />
              Go to Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
