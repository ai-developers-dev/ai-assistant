"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Target,
  Building2,
  Mail,
  MessageCircle,
  Linkedin,
  Users,
  TrendingUp,
  MapPin,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Reply,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  MailOpen,
  AlertTriangle,
  Star,
  Clock,
  X,
  Globe,
  Phone,
  ExternalLink,
  User,
  Facebook,
  Activity,
  ArrowRight,
  Search,
  Zap,
  Send,
  BarChart3,
  Download,
  Upload,
  Trash2,
  Layers,
  Wrench,
  Share2,
} from "lucide-react";

// ── Period Types & Helpers ────────────────────────────────────────────

type Period = "today" | "yesterday" | "week" | "month" | "ytd" | "all";
type TabId = "overview" | "pipeline" | "leads" | "replies" | "social" | "tools";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This Week",
  month: "This Month",
  ytd: "YTD",
  all: "All Time",
};

function getPeriodRange(period: Period): { startTime: number; endTime: number } {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case "today":
      d.setHours(0, 0, 0, 0);
      return { startTime: d.getTime(), endTime: now.getTime() };
    case "yesterday": {
      d.setHours(0, 0, 0, 0);
      const yStart = d.getTime() - 86400000;
      return { startTime: yStart, endTime: d.getTime() };
    }
    case "week": {
      const day = d.getDay();
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      return { startTime: d.getTime(), endTime: now.getTime() };
    }
    case "month":
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return { startTime: d.getTime(), endTime: now.getTime() };
    case "ytd":
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return { startTime: d.getTime(), endTime: now.getTime() };
    case "all":
      return { startTime: 0, endTime: now.getTime() };
  }
}

const TAB_CONFIG: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { id: "pipeline", label: "Pipeline", icon: <Layers className="h-3.5 w-3.5" /> },
  { id: "leads", label: "Leads", icon: <Building2 className="h-3.5 w-3.5" /> },
  { id: "replies", label: "Replies", icon: <Reply className="h-3.5 w-3.5" /> },
  { id: "social", label: "Social", icon: <Share2 className="h-3.5 w-3.5" /> },
  { id: "tools", label: "Tools", icon: <Wrench className="h-3.5 w-3.5" /> },
];

// ── Main Page Component ──────────────────────────────────────────────

export default function LeadsPage() {
  const { org } = useEffectiveOrg();

  // Period state — persisted to localStorage
  const [period, setPeriod] = useState<Period>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("leads-period");
      if (saved && saved in PERIOD_LABELS) return saved as Period;
    }
    return "today";
  });

  useEffect(() => {
    localStorage.setItem("leads-period", period);
  }, [period]);

  // Tab state — persisted to localStorage
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "");
      if (hash && TAB_CONFIG.some((t) => t.id === hash)) return hash as TabId;
      const saved = localStorage.getItem("leads-tab");
      if (saved && TAB_CONFIG.some((t) => t.id === saved)) return saved as TabId;
    }
    return "overview";
  });

  useEffect(() => {
    localStorage.setItem("leads-tab", activeTab);
    window.location.hash = activeTab;
  }, [activeTab]);

  // Misc UI state
  const [initializing, setInitializing] = useState(false);
  const [syncingReplies, setSyncingReplies] = useState(false);
  const [selectedBusinessId, setSelectedBusinessId] = useState<Id<"businesses"> | null>(null);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [citiesExpanded, setCitiesExpanded] = useState(false);
  const [addCityName, setAddCityName] = useState("");
  const [addCityState, setAddCityState] = useState("");

  // Leads tab filters
  const [leadFilter, setLeadFilter] = useState<"all" | "new" | "ready" | "emailed" | "replied">("all");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadSort, setLeadSort] = useState<"newest" | "score" | "name">("newest");

  const { startTime, endTime } = useMemo(() => getPeriodRange(period), [period]);

  // Today range for per-agent stats
  const todayRange = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return { todayStart: d.getTime(), todayEnd: Date.now() };
  }, []);

  // ── All Convex Queries ─────────────────────────────────────────────

  const cityProgress = useQuery(
    api.cityCampaigns.getProgress,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const cityList = useQuery(
    api.cityCampaigns.list,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const pipelineStats = useQuery(
    api.businesses.getDailyPipelineStats,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const businessStats = useQuery(
    api.businesses.getStatsByDateRange,
    org?._id ? { organizationId: org._id, startTime, endTime } : "skip"
  );

  const allTimeStats = useQuery(
    api.businesses.getStats,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const recentBusinesses = useQuery(
    api.businesses.list,
    org?._id ? { organizationId: org._id, limit: 20 } : "skip"
  );

  const responders = useQuery(
    api.businesses.getResponders,
    org?._id ? { organizationId: org._id, limit: 100 } : "skip"
  );

  const funnelCounts = useQuery(
    api.businesses.getFunnelCounts,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const emailStats = useQuery(
    api.businesses.getEmailStats,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const upcomingOutreach = useQuery(
    api.businesses.getBusinessesDueForOutreach,
    org?._id ? { organizationId: org._id, limit: 10 } : "skip"
  );

  const postStats = useQuery(
    api.leadGenPosts.getStatsByDateRange,
    org?._id ? { organizationId: org._id, startTime, endTime } : "skip"
  );

  const replyIntelligence = useQuery(
    api.businesses.getReplyIntelligence,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const recentPosts = useQuery(
    api.leadGenPosts.list,
    org?._id ? { organizationId: org._id, limit: 20 } : "skip"
  );

  // Agent team queries for live campaign dashboard
  const agentTeam = useQuery(
    api.agentTeams.getByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const teamAgents = useQuery(
    api.teamAgents.listByTeam,
    agentTeam?._id ? { agentTeamId: agentTeam._id } : "skip"
  );

  const recentComms = useQuery(
    api.agentCommunications.listRecentByOrganization,
    org?._id ? { organizationId: org._id, limit: 20 } : "skip"
  );

  const todayStats = useQuery(
    api.businesses.getStatsByDateRange,
    org?._id ? { organizationId: org._id, startTime: todayRange.todayStart, endTime: todayRange.todayEnd } : "skip"
  );

  // ── All Convex Mutations ───────────────────────────────────────────

  const resetCity = useMutation(api.cityCampaigns.resetCity);
  const skipCity = useMutation(api.cityCampaigns.skipCity);
  const addCity = useMutation(api.cityCampaigns.addCity);
  const initializeCities = useMutation(api.cityCampaigns.initialize);
  const markReply = useMutation(api.businesses.markOutreachReply);
  const deleteAllBusinesses = useMutation(api.businesses.deleteAllByOrganization);

  // ── Derived Data ───────────────────────────────────────────────────

  // Determine pipeline step from agent statuses
  const pipelineInfo = useMemo(() => {
    if (!teamAgents) return { currentStep: "idle" as const, completedSteps: [] as string[] };

    const workingAgent = teamAgents.find((a) => a.status === "working");
    const STEPS = ["Planning", "Scraping", "Enriching", "Emailing", "Social", "Reporting", "Done"] as const;
    const STEP_ORDER: Record<string, number> = { Planning: 0, Scraping: 1, Enriching: 2, Emailing: 3, Social: 4, Reporting: 5, Done: 6 };

    if (!workingAgent) {
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      const recentlyActive = teamAgents.some((a) => (a.lastActiveAt ?? 0) > fiveMinAgo && a.status !== "idle");
      if (!recentlyActive) return { currentStep: "idle" as const, completedSteps: [] as string[], steps: STEPS };
    }

    let currentStep: string = "idle";
    if (workingAgent) {
      const name = workingAgent.name;
      if (name === "Marketing Manager") {
        const hasWorkDone = teamAgents.some(
          (a) => a.name !== "Marketing Manager" && (a.lastActiveAt ?? 0) > (todayRange.todayStart)
        );
        currentStep = hasWorkDone ? "Reporting" : "Planning";
      } else if (name === "Scraping Agent") currentStep = "Scraping";
      else if (name === "Research Agent") currentStep = "Enriching";
      else if (name === "Cold Email Agent") currentStep = "Emailing";
      else if (name.includes("Meta") || name.includes("LinkedIn") || name.includes("Social")) currentStep = "Social";
      else currentStep = "Planning";
    }

    const stepIdx = STEP_ORDER[currentStep] ?? -1;
    const completedSteps = STEPS.filter((_, i) => i < stepIdx);

    return { currentStep, completedSteps, steps: STEPS };
  }, [teamAgents, todayRange.todayStart]);

  // Auto-expand activity feed when agents are working
  const isAnyAgentWorking = useMemo(
    () => teamAgents?.some((a) => a.status === "working") ?? false,
    [teamAgents]
  );

  useEffect(() => {
    if (isAnyAgentWorking) setActivityExpanded(true);
  }, [isAnyAgentWorking]);

  // Relative time helper
  const relativeTime = useCallback((ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }, []);

  // Filtered businesses for leads tab
  const filteredBusinesses = useMemo(() => {
    if (!recentBusinesses) return [];
    let list = [...recentBusinesses];

    // Status filter
    if (leadFilter === "new") list = list.filter((b) => b.status === "new");
    else if (leadFilter === "ready") list = list.filter((b) => b.status === "ready");
    else if (leadFilter === "emailed") list = list.filter((b) => b.outreachStatus?.emailSentAt);
    else if (leadFilter === "replied") list = list.filter((b) => b.outreachStatus?.emailRepliedAt || b.outreachStatus?.metaRepliedAt || b.outreachStatus?.linkedinRepliedAt);

    // Search
    if (leadSearch.trim()) {
      const q = leadSearch.toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.address?.city?.toLowerCase().includes(q) ||
          b.ownerName?.toLowerCase().includes(q) ||
          b.email?.toLowerCase().includes(q)
      );
    }

    // Sort
    if (leadSort === "score") list.sort((a, b) => ((b as any).leadScore ?? 0) - ((a as any).leadScore ?? 0));
    else if (leadSort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    // newest = default order from query

    return list;
  }, [recentBusinesses, leadFilter, leadSearch, leadSort]);

  const progressPct = cityProgress?.total
    ? Math.round(((cityProgress.done ?? 0) / cityProgress.total) * 100)
    : 0;

  // ── Handlers ───────────────────────────────────────────────────────

  const handleInitialize = async () => {
    if (!org?._id) return;
    setInitializing(true);
    try {
      await initializeCities({ organizationId: org._id });
    } finally {
      setInitializing(false);
    }
  };

  const handleSyncReplies = async () => {
    if (!org?._id) return;
    setSyncingReplies(true);
    try {
      await fetch("/api/leads/instantly-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: org._id }),
      });
    } finally {
      setSyncingReplies(false);
    }
  };

  const handleExportCSV = () => {
    if (!org?._id) return;
    window.open(`/api/leads/export?organizationId=${org._id}`, "_blank");
  };

  const handleImportCSV = () => {
    if (!org?._id) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        toast.error("CSV must have a header row + data");
        return;
      }
      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"/, "").replace(/"$/, "").toLowerCase());
      const nameIdx = headers.findIndex((h) => h === "name" || h === "business" || h === "business name");
      const cityIdx = headers.findIndex((h) => h === "city");
      const stateIdx = headers.findIndex((h) => h === "state");
      const phoneIdx = headers.findIndex((h) => h === "phone");
      const emailIdx = headers.findIndex((h) => h === "email");
      const websiteIdx = headers.findIndex((h) => h === "website" || h === "url");
      const ownerIdx = headers.findIndex((h) => h === "owner" || h === "owner name");
      const categoryIdx = headers.findIndex((h) => h === "category" || h === "vertical" || h === "categories");
      if (nameIdx === -1 || cityIdx === -1 || stateIdx === -1) {
        toast.error("CSV must have 'Name', 'City', and 'State' columns");
        return;
      }
      const leads = lines
        .slice(1)
        .map((line) => {
          const cols = line.split(",").map((c) => c.trim().replace(/^"/, "").replace(/"$/, ""));
          return {
            name: cols[nameIdx] || "",
            city: cols[cityIdx] || "",
            state: cols[stateIdx] || "",
            phone: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
            email: emailIdx >= 0 ? cols[emailIdx] : undefined,
            website: websiteIdx >= 0 ? cols[websiteIdx] : undefined,
            ownerName: ownerIdx >= 0 ? cols[ownerIdx] : undefined,
            vertical: categoryIdx >= 0 ? cols[categoryIdx] : undefined,
          };
        })
        .filter((l) => l.name && l.city && l.state);
      if (leads.length === 0) {
        toast.error("No valid leads found in CSV");
        return;
      }
      if (!confirm(`Import ${leads.length} leads?`)) return;
      try {
        const res = await fetch("/api/leads/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId: org._id, leads }),
        });
        const data = await res.json();
        toast.success(`Imported ${data.imported} leads`, {
          description: data.skipped
            ? `Skipped ${data.skipped}${data.errors?.length ? ` · ${data.errors.slice(0, 3).join(", ")}` : ""}`
            : undefined,
        });
      } catch (err: any) {
        toast.error("Import failed", { description: err.message });
      }
    };
    input.click();
  };

  const handleClearAll = async () => {
    if (!org?._id) return;
    if (!confirm("Clear ALL leads, posts, agent communications, and decision logs for this org?")) return;
    setClearing(true);
    try {
      const result = await deleteAllBusinesses({ organizationId: org._id });
      toast.success(`Cleared ${result.deleted} leads`, {
        description: `${result.postsDeleted} posts, ${result.commsDeleted} agent comms, ${result.decisionsDeleted} decisions`,
      });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setClearing(false);
    }
  };

  // ── Loading State ──────────────────────────────────────────────────

  if (!org) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* ── Sticky Header ───────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm -mx-6 px-6 py-4 border-b border-border -mt-8 mb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Activity Dashboard
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Track your lead generation performance
            </p>
          </div>
          <div className="flex gap-1 p-1 bg-muted/30 rounded-lg">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  period === p
                    ? "bg-primary text-primary-foreground shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-muted/30 rounded-lg w-fit">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-md transition-colors ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────── */}

      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* 0. Lead Processing Flow Diagram */}
          {pipelineStats && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Lead Processing Flow
              </h2>

              {/* Main pipeline: Scrape → Enrich → Email → FB → LinkedIn */}
              <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
                {[
                  { label: "Scrape", icon: <Search className="h-3.5 w-3.5" />, done: pipelineStats.total, limit: pipelineStats.total || 100, queue: 0, color: "blue" },
                  { label: "Enrich", icon: <Users className="h-3.5 w-3.5" />, done: pipelineStats.total - pipelineStats.byStatus.new, limit: pipelineStats.total, queue: pipelineStats.queues.awaitingEnrichment, color: "purple" },
                  { label: "Email", icon: <Mail className="h-3.5 w-3.5" />, done: pipelineStats.emailedToday, limit: 25, queue: pipelineStats.queues.awaitingEmail, color: "green" },
                  { label: "FB DM", icon: <Facebook className="h-3.5 w-3.5" />, done: pipelineStats.metaSentToday, limit: 10, queue: pipelineStats.queues.awaitingMeta, color: "sky" },
                  { label: "LinkedIn", icon: <Linkedin className="h-3.5 w-3.5" />, done: pipelineStats.linkedinSentToday, limit: 10, queue: pipelineStats.queues.awaitingLinkedin, color: "indigo" },
                ].map((stage, i, arr) => {
                  const pct = stage.limit > 0 ? Math.min(100, Math.round((stage.done / stage.limit) * 100)) : 0;
                  const isDone = pct >= 100;
                  const hasQueue = stage.queue > 0;
                  return (
                    <div key={stage.label} className="flex items-center gap-1 flex-1 min-w-0">
                      <div className={`flex-1 rounded-lg border p-3 text-center space-y-1.5 ${isDone ? "border-green-500/30 bg-green-500/5" : hasQueue ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-muted/10"}`}>
                        <div className="flex items-center justify-center gap-1 text-xs font-semibold">
                          {stage.icon}
                          {stage.label}
                        </div>
                        {/* Mini progress bar */}
                        <div className="h-2 rounded-full bg-muted overflow-hidden mx-2">
                          <div className={`h-full rounded-full transition-all ${isDone ? "bg-green-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-lg font-bold leading-none">{stage.done}<span className="text-xs font-normal text-muted-foreground">/{stage.limit}</span></div>
                        {hasQueue ? (
                          <div className="text-[10px] text-amber-700 font-medium">{stage.queue} queued</div>
                        ) : isDone ? (
                          <div className="text-[10px] text-green-700 font-medium">done</div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground">in progress</div>
                        )}
                      </div>
                      {i < arr.length - 1 && (
                        <ArrowRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Social posting row */}
              <div className="border-t border-border pt-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Social Posting</div>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: "Reddit", done: postStats?.reddit ?? 0, limit: 5 },
                    { label: "FB Groups", done: postStats?.metaGroup ?? 0, limit: 5 },
                    { label: "YouTube", done: (postStats as any)?.youtube ?? 0, limit: 3 },
                    { label: "Twitter", done: (postStats as any)?.twitter ?? 0, limit: 3 },
                    { label: "Discord", done: (postStats as any)?.discord ?? 0, limit: 3 },
                    { label: "Quora", done: (postStats as any)?.quora ?? 0, limit: 3 },
                    { label: "Nextdoor", done: (postStats as any)?.nextdoor ?? 0, limit: 3 },
                  ].map((s) => (
                    <div key={s.label} className={`px-2.5 py-1 rounded text-[11px] border ${s.done > 0 ? "border-green-500/30 bg-green-500/5 text-green-700" : "border-border text-muted-foreground"}`}>
                      {s.label}: {s.done}/{s.limit}
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeline estimate */}
              {(pipelineStats.queues.awaitingEmail > 0 || pipelineStats.queues.awaitingMeta > 0 || pipelineStats.queues.awaitingLinkedin > 0 || pipelineStats.queues.awaitingEnrichment > 0) && (
                <div className="border-t border-border pt-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Estimated Timeline</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {pipelineStats.queues.awaitingEnrichment > 0 && (
                      <div className="space-y-0.5">
                        <div className="text-muted-foreground">Enrichment</div>
                        <div className="font-medium">{pipelineStats.queues.awaitingEnrichment} queued</div>
                        <div className="text-muted-foreground/60">~{Math.ceil(pipelineStats.queues.awaitingEnrichment / 30)} more run(s)</div>
                      </div>
                    )}
                    {pipelineStats.queues.awaitingEmail > 0 && (
                      <div className="space-y-0.5">
                        <div className="text-muted-foreground">Email</div>
                        <div className="font-medium">{pipelineStats.queues.awaitingEmail} queued</div>
                        <div className="text-muted-foreground/60">~{Math.ceil(pipelineStats.queues.awaitingEmail / 25)} day(s)</div>
                      </div>
                    )}
                    {pipelineStats.queues.awaitingMeta > 0 && (
                      <div className="space-y-0.5">
                        <div className="text-muted-foreground">FB DM</div>
                        <div className="font-medium">{pipelineStats.queues.awaitingMeta} queued</div>
                        <div className="text-muted-foreground/60">~{Math.ceil(pipelineStats.queues.awaitingMeta / 10)} day(s)</div>
                      </div>
                    )}
                    {pipelineStats.queues.awaitingLinkedin > 0 && (
                      <div className="space-y-0.5">
                        <div className="text-muted-foreground">LinkedIn</div>
                        <div className="font-medium">{pipelineStats.queues.awaitingLinkedin} queued</div>
                        <div className="text-muted-foreground/60">~{Math.ceil(pipelineStats.queues.awaitingLinkedin / 10)} day(s)</div>
                      </div>
                    )}
                  </div>
                  {(() => {
                    const maxDays = Math.max(
                      Math.ceil((pipelineStats.queues.awaitingEmail || 0) / 25),
                      Math.ceil((pipelineStats.queues.awaitingMeta || 0) / 10),
                      Math.ceil((pipelineStats.queues.awaitingLinkedin || 0) / 10),
                    );
                    return maxDays > 0 ? (
                      <div className="text-xs text-primary font-medium mt-2">
                        All outreach complete in ~{maxDays} day{maxDays !== 1 ? "s" : ""}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {/* How it works (collapsible) */}
              <details className="border-t border-border pt-3">
                <summary className="text-[10px] text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground">
                  How the pipeline works
                </summary>
                <div className="mt-2 text-xs text-muted-foreground space-y-1 leading-relaxed">
                  <p><strong className="text-foreground">1. Scrape:</strong> Agent finds businesses on Google Maps via Outscraper (limit: configurable/day)</p>
                  <p><strong className="text-foreground">2. Enrich:</strong> Each business gets researched — Apollo, website scraping, Hunter, Google reviews (~2 min each, ~30 per run)</p>
                  <p><strong className="text-foreground">3. Email:</strong> Top-scored leads with emails get personalized cold email (limit: 25/day, highest score first)</p>
                  <p><strong className="text-foreground">4. FB DM:</strong> Leads with Facebook pages get a personalized message (limit: 10/day)</p>
                  <p><strong className="text-foreground">5. LinkedIn:</strong> Leads with owner LinkedIn profiles get a connection request with note (limit: 10/day)</p>
                  <p><strong className="text-foreground">6. Social:</strong> Helpful posts to Reddit, YouTube, Twitter, FB Groups about your verticals</p>
                  <p className="text-muted-foreground/60 pt-1">Pipeline runs hourly. Unprocessed leads carry over to next run. Leads prioritized by score.</p>
                </div>
              </details>
            </div>
          )}

          {/* 1. Four Key Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<Building2 className="h-4 w-4" />}
              label="Scraped"
              value={businessStats?.found ?? 0}
              color="text-blue-700"
            />
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="Enriched"
              value={businessStats?.ownerFound ?? 0}
              color="text-purple-700"
            />
            <StatCard
              icon={<Mail className="h-4 w-4" />}
              label="Emailed"
              value={businessStats?.emailSent ?? 0}
              color="text-green-700"
            />
            <StatCard
              icon={<MessageCircle className="h-4 w-4" />}
              label="Replied"
              value={(businessStats as any)?.replied ?? (allTimeStats?.emailReplied ?? 0)}
              color="text-emerald-700"
            />
          </div>

          {/* 2. Pipeline Progress — consolidated progress bars */}
          {pipelineStats && (
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Pipeline Progress
                </h2>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> {pipelineStats.byStatus.new} unenriched
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> {pipelineStats.byStatus.enriching} enriching
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500" /> {pipelineStats.byStatus.ready} ready
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground" /> {pipelineStats.byStatus.allSent} all sent
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { label: "Enrichment", done: pipelineStats.enrichedToday, total: pipelineStats.total, queue: pipelineStats.queues.awaitingEnrichment },
                  { label: "Email", done: pipelineStats.emailedToday, total: 25, queue: pipelineStats.queues.awaitingEmail },
                  { label: "Meta DM", done: pipelineStats.metaSentToday, total: 10, queue: pipelineStats.queues.awaitingMeta },
                  { label: "LinkedIn", done: pipelineStats.linkedinSentToday, total: 10, queue: pipelineStats.queues.awaitingLinkedin },
                  { label: "Reddit Posts", done: postStats?.reddit ?? 0, total: 5, queue: 0 },
                  { label: "FB Group Posts", done: postStats?.metaGroup ?? 0, total: 5, queue: 0 },
                  { label: "YouTube Comments", done: (postStats as any)?.youtube ?? 0, total: 3, queue: 0 },
                  { label: "Twitter Posts", done: (postStats as any)?.twitter ?? 0, total: 3, queue: 0 },
                  { label: "Quora (found)", done: (postStats as any)?.quora ?? 0, total: 3, queue: 0 },
                  { label: "Nextdoor (found)", done: (postStats as any)?.nextdoor ?? 0, total: 3, queue: 0 },
                  { label: "Discord", done: (postStats as any)?.discord ?? 0, total: 3, queue: 0 },
                ].map((limit) => {
                  const pct = limit.total > 0 ? Math.min(100, Math.round((limit.done / limit.total) * 100)) : 0;
                  return (
                    <div key={limit.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>{limit.label}</span>
                        <span className="text-muted-foreground">
                          {limit.done}/{limit.total}
                          {limit.queue > 0 && <span className="text-amber-700 ml-1">({limit.queue} queued)</span>}
                          {limit.done >= limit.total && limit.total > 0 && <span className="text-green-700 ml-1">DONE</span>}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-green-500" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Agent Status — compact row */}
          {teamAgents && teamAgents.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Agent Status
              </h2>
              <div className="flex flex-wrap gap-2">
                {teamAgents.map((agent) => {
                  const isWorking = agent.status === "working";
                  const isIdle = agent.status === "idle";
                  const dotColor = isWorking ? "bg-blue-500" : isIdle ? "bg-green-500" : "bg-amber-500";
                  const dotPing = isWorking ? "animate-pulse" : "";
                  return (
                    <div
                      key={agent._id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-xs"
                    >
                      <span className={`w-2 h-2 rounded-full ${dotColor} ${dotPing}`} />
                      <span className="font-medium text-foreground">{agent.name}</span>
                      <span className="text-muted-foreground capitalize">({agent.status})</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Live Activity Feed — collapsible */}
          {agentTeam && (
            <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
              <button
                onClick={() => setActivityExpanded((prev) => !prev)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Live Activity Feed</span>
                  {isAnyAgentWorking && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">Last 10 messages</span>
                </div>
                {activityExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {activityExpanded && (
                <div className="border-t border-border px-4 py-3 space-y-2 max-h-64 overflow-y-auto">
                  {(!recentComms || recentComms.length === 0) ? (
                    <div className="flex flex-col items-center py-6 text-center">
                      <Activity className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <span className="text-sm text-muted-foreground">No active campaign</span>
                      <span className="text-xs text-muted-foreground/60">Agent communications will appear here during runs</span>
                    </div>
                  ) : (
                    recentComms.slice(0, 10).map((comm) => {
                      const typeConfig: Record<string, { icon: string; color: string }> = {
                        delegation: { icon: "\u2192", color: "text-blue-700" },
                        result: { icon: "\u2713", color: "text-green-700" },
                        error: { icon: "\u2717", color: "text-red-600" },
                        question: { icon: "?", color: "text-amber-700" },
                        info: { icon: "i", color: "text-muted-foreground" },
                      };
                      const cfg = typeConfig[comm.messageType] ?? typeConfig.info;

                      return (
                        <div key={comm._id} className="flex items-start gap-2 text-xs">
                          <span className={`font-mono font-bold text-sm leading-4 shrink-0 w-4 text-center ${cfg.color}`}>
                            {cfg.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-foreground truncate">{comm.fromName}</span>
                              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
                              <span className="font-medium text-foreground truncate">{comm.toName}</span>
                              <span className="text-muted-foreground/50 ml-auto shrink-0">{relativeTime(comm._creationTime)}</span>
                            </div>
                            <p className="text-muted-foreground truncate">{comm.content.slice(0, 120)}{comm.content.length > 120 ? "..." : ""}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "pipeline" && (
        <div className="space-y-6">
          {/* 1. Funnel */}
          {funnelCounts && funnelCounts.scraped > 0 && (
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Pipeline Funnel
              </h2>
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {[
                  { label: "Scraped", value: funnelCounts.scraped, color: "text-blue-700" },
                  { label: "Enriched", value: funnelCounts.enriched, color: "text-purple-700" },
                  { label: "Scored \u226520", value: funnelCounts.scored, color: "text-amber-700" },
                  { label: "Contacted", value: funnelCounts.contacted, color: "text-sky-700" },
                  { label: "Opened", value: funnelCounts.opened, color: "text-orange-700" },
                  { label: "Replied", value: funnelCounts.replied, color: "text-emerald-700" },
                ].map((step, i, arr) => (
                  <div key={step.label} className="flex items-center shrink-0">
                    <div className="text-center px-3 py-2 rounded-lg bg-muted/40 min-w-[80px]">
                      <div className={`text-lg font-bold ${step.color}`}>{step.value.toLocaleString()}</div>
                      <div className="text-[10px] text-muted-foreground">{step.label}</div>
                      {i > 0 && arr[i - 1].value > 0 && (
                        <div className="text-[9px] text-muted-foreground/60">
                          {Math.round((step.value / arr[i - 1].value) * 100)}%
                        </div>
                      )}
                    </div>
                    {i < arr.length - 1 && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 mx-1" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Channel Breakdown Table */}
          {emailStats && (
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <MailOpen className="h-4 w-4 text-green-700" />
                Channel Breakdown
              </h2>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Channel</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sent</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Opened</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Replied</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium flex items-center gap-1.5">
                        <Mail className="h-3 w-3 text-green-700" /> Email
                      </td>
                      <td className="px-3 py-2 text-right">{emailStats.sent}</td>
                      <td className="px-3 py-2 text-right text-orange-700">{emailStats.opened}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{emailStats.replied}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {emailStats.sent > 0 ? Math.round((emailStats.replied / emailStats.sent) * 100) : 0}%
                      </td>
                    </tr>
                    <tr className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium flex items-center gap-1.5">
                        <Facebook className="h-3 w-3 text-blue-700" /> Meta
                      </td>
                      <td className="px-3 py-2 text-right">{allTimeStats?.metaSent ?? 0}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">--</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{allTimeStats?.metaReplied ?? 0}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {(allTimeStats?.metaSent ?? 0) > 0 ? Math.round(((allTimeStats?.metaReplied ?? 0) / (allTimeStats?.metaSent ?? 1)) * 100) : 0}%
                      </td>
                    </tr>
                    <tr className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium flex items-center gap-1.5">
                        <Linkedin className="h-3 w-3 text-sky-700" /> LinkedIn
                      </td>
                      <td className="px-3 py-2 text-right">{allTimeStats?.linkedinSent ?? 0}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">--</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{allTimeStats?.linkedinReplied ?? 0}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {(allTimeStats?.linkedinSent ?? 0) > 0 ? Math.round(((allTimeStats?.linkedinReplied ?? 0) / (allTimeStats?.linkedinSent ?? 1)) * 100) : 0}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* Email extras: bounced, unsubscribed */}
              {emailStats.sent > 0 && (
                <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                  <span className={emailStats.bounced > emailStats.sent * 0.05 ? "text-destructive flex items-center gap-1" : ""}>
                    {emailStats.bounced > emailStats.sent * 0.05 && <AlertTriangle className="h-2.5 w-2.5" />}
                    {emailStats.bounced} bounced
                  </span>
                  <span>{emailStats.unsubscribed} unsubscribed</span>
                </div>
              )}
            </div>
          )}

          {/* 3. Enrichment Quality */}
          {allTimeStats && allTimeStats.total > 0 && (
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Search className="h-4 w-4 text-purple-700" />
                Enrichment Quality
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-center space-y-1">
                  <div className="text-lg font-bold text-purple-700">
                    {allTimeStats.total > 0 ? Math.round(((allTimeStats as any).withOwner ?? allTimeStats.total - (pipelineStats?.byStatus?.new ?? 0)) / allTimeStats.total * 100) : 0}%
                  </div>
                  <div className="text-muted-foreground">Owner Found</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-center space-y-1">
                  <div className="text-lg font-bold text-green-700">
                    {allTimeStats.total > 0 ? Math.round((allTimeStats.emailSent > 0 ? ((allTimeStats as any).withEmail ?? allTimeStats.emailSent) : 0) / allTimeStats.total * 100) : 0}%
                  </div>
                  <div className="text-muted-foreground">Has Email</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-center space-y-1">
                  <div className="text-lg font-bold text-blue-700">
                    {allTimeStats.total > 0 ? Math.round((allTimeStats.metaSent > 0 ? allTimeStats.metaSent : 0) / allTimeStats.total * 100) : 0}%
                  </div>
                  <div className="text-muted-foreground">Has Facebook</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-center space-y-1">
                  <div className="text-lg font-bold text-sky-700">
                    {allTimeStats.total > 0 ? Math.round((allTimeStats.linkedinSent > 0 ? allTimeStats.linkedinSent : 0) / allTimeStats.total * 100) : 0}%
                  </div>
                  <div className="text-muted-foreground">Has LinkedIn</div>
                </div>
              </div>
            </div>
          )}

          {/* 4. Response Rates — progress bars */}
          {allTimeStats && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Reply className="h-4 w-4 text-emerald-700" />
                Response Rates
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <ResponseRateCard
                  label="Email"
                  sent={allTimeStats.emailSent ?? 0}
                  replied={allTimeStats.emailReplied ?? 0}
                  icon={<Mail className="h-4 w-4" />}
                  colorClass="green"
                />
                <ResponseRateCard
                  label="Meta"
                  sent={allTimeStats.metaSent ?? 0}
                  replied={allTimeStats.metaReplied ?? 0}
                  icon={<MessageCircle className="h-4 w-4" />}
                  colorClass="blue"
                />
                <ResponseRateCard
                  label="LinkedIn"
                  sent={allTimeStats.linkedinSent ?? 0}
                  replied={allTimeStats.linkedinReplied ?? 0}
                  icon={<Linkedin className="h-4 w-4" />}
                  colorClass="sky"
                />
              </div>
            </div>
          )}

          {/* 5. Outreach Queue */}
          {upcomingOutreach && upcomingOutreach.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-700" />
                Outreach Queue
                <Badge variant="secondary" className="text-xs">{upcomingOutreach.length} due</Badge>
              </h2>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Business</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">City</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Score</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Step</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Channels</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {upcomingOutreach.map((b: any) => (
                      <tr key={b._id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2 font-medium truncate max-w-[160px]">{b.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{b.address?.city}</td>
                        <td className="px-3 py-2">
                          <span className={`font-medium ${(b.leadScore ?? 0) >= 50 ? "text-emerald-700" : (b.leadScore ?? 0) >= 25 ? "text-amber-700" : "text-muted-foreground"}`}>
                            {b.leadScore ?? "\u2014"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-[10px]">
                            {["Email #1", "LinkedIn/FB", "Email #2", "LI Follow-up", "Final Email"][b.outreachSequenceStep ?? 0] ?? `Step ${b.outreachSequenceStep}`}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {b.email && <span className="text-green-700" title="Has email">\u2709</span>}
                            {b.metaPageUrl && <span className="text-blue-700" title="Has Facebook">f</span>}
                            {b.linkedinOwnerUrl && <span className="text-sky-700" title="Has LinkedIn">in</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* All-time totals row */}
          {allTimeStats && (
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t border-border pt-3">
              <span>All-time: <strong className="text-foreground">{allTimeStats.total.toLocaleString()}</strong> businesses</span>
              <span>\u2192 <strong className="text-foreground">{allTimeStats.emailSent}</strong> emails sent</span>
              <span>\u2192 <strong className="text-foreground">{allTimeStats.metaSent}</strong> Meta sent</span>
              <span>\u2192 <strong className="text-foreground">{allTimeStats.linkedinSent}</strong> LinkedIn sent</span>
            </div>
          )}
        </div>
      )}

      {activeTab === "leads" && (
        <div className="space-y-6">
          {/* 1. Filter Bar */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Status pills */}
            <div className="flex gap-1 p-1 bg-muted/30 rounded-lg">
              {(["all", "new", "ready", "emailed", "replied"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setLeadFilter(f)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${
                    leadFilter === f
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                placeholder="Search name, city, owner, email..."
                className="pl-8 h-8 text-xs bg-background"
              />
            </div>

            {/* Sort */}
            <select
              value={leadSort}
              onChange={(e) => setLeadSort(e.target.value as typeof leadSort)}
              className="h-8 px-2 text-xs rounded-md border border-border bg-background text-foreground"
            >
              <option value="newest">Newest first</option>
              <option value="score">Highest score</option>
              <option value="name">Name A-Z</option>
            </select>
          </div>

          {/* 2. Leads Table */}
          {filteredBusinesses.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Leads
                <Badge variant="secondary" className="text-xs">{filteredBusinesses.length}</Badge>
              </h2>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Business</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Location</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Owner</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Score</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Outreach</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredBusinesses.map((b) => (
                      <tr
                        key={b._id}
                        className="hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => setSelectedBusinessId(b._id as Id<"businesses">)}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium truncate max-w-[160px]">{b.name}</div>
                          {b.categories[0] && (
                            <div className="text-muted-foreground/60 truncate">{b.categories[0]}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {b.address.city}, {b.address.state}
                        </td>
                        <td className="px-3 py-2">
                          {b.ownerName ? (
                            <span className="text-foreground">{b.ownerName}</span>
                          ) : (
                            <span className="text-muted-foreground/40">\u2014</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {(b as any).leadScore !== undefined ? (
                            <span className={`font-medium text-xs flex items-center gap-0.5 ${(b as any).leadScore >= 50 ? "text-emerald-700" : (b as any).leadScore >= 25 ? "text-amber-700" : "text-muted-foreground"}`}>
                              <Star className="h-2.5 w-2.5" />
                              {(b as any).leadScore}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">\u2014</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 flex-wrap">
                            {/* Email status */}
                            {b.outreachStatus?.emailRepliedAt ? (
                              <Badge className="text-[10px] px-1.5 py-0 bg-green-500/20 text-green-700 border-green-500/30">replied</Badge>
                            ) : b.outreachStatus?.emailSentAt ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-500 border-green-500/30">emailed</Badge>
                            ) : b.email && b.status === "ready" ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-700 border-amber-400/30">email queued</Badge>
                            ) : b.status === "new" ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground/40 border-muted/30">enriching</Badge>
                            ) : null}

                            {/* Meta status */}
                            {b.outreachStatus?.metaRepliedAt ? (
                              <Badge className="text-[10px] px-1.5 py-0 bg-blue-500/20 text-blue-700 border-blue-500/30">FB replied</Badge>
                            ) : b.outreachStatus?.metaSentAt ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-blue-500 border-blue-500/30">FB sent</Badge>
                            ) : b.metaPageUrl && b.status === "ready" ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-700 border-amber-400/30">FB queued</Badge>
                            ) : null}

                            {/* LinkedIn status */}
                            {b.outreachStatus?.linkedinRepliedAt ? (
                              <Badge className="text-[10px] px-1.5 py-0 bg-sky-500/20 text-sky-700 border-sky-500/30">LI replied</Badge>
                            ) : b.outreachStatus?.linkedinSentAt ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-sky-500 border-sky-500/30">LI sent</Badge>
                            ) : (b as any).linkedinOwnerUrl && b.status === "ready" ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-700 border-amber-400/30">LI queued</Badge>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-border">
              <Target className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="font-semibold mb-1">No leads found</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
                {leadSearch || leadFilter !== "all"
                  ? "Try adjusting your filters or search query."
                  : "Create a Lead Gen Agent scheduled task to start generating leads automatically."}
              </p>
              {!(leadSearch || leadFilter !== "all") && (
                <a
                  href="/scheduled"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  Go to Scheduled Tasks →
                </a>
              )}
            </div>
          )}

          {/* 3. Responses Table */}
          {responders && responders.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Reply className="h-4 w-4 text-emerald-700" />
                    Responses
                  </h2>
                  <Badge variant="secondary" className="text-xs">
                    {responders.length}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-7 text-xs"
                  onClick={handleSyncReplies}
                  disabled={syncingReplies}
                >
                  {syncingReplies ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Sync Email Replies
                </Button>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Lead Name</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Business</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">City / State</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Channels Replied</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {responders.map((b) => {
                      const latestReply = Math.max(
                        b.outreachStatus?.emailRepliedAt ?? 0,
                        b.outreachStatus?.metaRepliedAt ?? 0,
                        b.outreachStatus?.linkedinRepliedAt ?? 0
                      );
                      return (
                        <tr key={b._id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2">
                            {b.ownerName ? (
                              <span className="text-foreground font-medium">{b.ownerName}</span>
                            ) : (
                              <span className="text-muted-foreground/40">\u2014</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium truncate max-w-[160px]">{b.name}</div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {b.address.city}, {b.address.state}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1 flex-wrap">
                              {b.outreachStatus?.emailRepliedAt ? (
                                <Badge className="text-[10px] px-1.5 py-0 bg-green-500/20 text-green-700 border-green-500/30">
                                  \u2713 Email
                                </Badge>
                              ) : b.outreachStatus?.emailSentAt ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-green-700"
                                  onClick={() =>
                                    markReply({ id: b._id, channel: "email", repliedAt: Date.now() })
                                  }
                                >
                                  <Reply className="h-2.5 w-2.5" />
                                  Email
                                </Button>
                              ) : null}

                              {b.outreachStatus?.metaRepliedAt ? (
                                <Badge className="text-[10px] px-1.5 py-0 bg-blue-500/20 text-blue-700 border-blue-500/30">
                                  \u2713 Meta
                                </Badge>
                              ) : b.outreachStatus?.metaSentAt ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-blue-700"
                                  onClick={() =>
                                    markReply({ id: b._id, channel: "meta", repliedAt: Date.now() })
                                  }
                                >
                                  <Reply className="h-2.5 w-2.5" />
                                  Meta
                                </Button>
                              ) : null}

                              {b.outreachStatus?.linkedinRepliedAt ? (
                                <Badge className="text-[10px] px-1.5 py-0 bg-sky-500/20 text-sky-700 border-sky-500/30">
                                  \u2713 LinkedIn
                                </Badge>
                              ) : b.outreachStatus?.linkedinSentAt ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-sky-700"
                                  onClick={() =>
                                    markReply({ id: b._id, channel: "linkedin", repliedAt: Date.now() })
                                  }
                                >
                                  <Reply className="h-2.5 w-2.5" />
                                  LI
                                </Button>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {latestReply > 0 ? new Date(latestReply).toLocaleDateString() : "\u2014"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sync replies button if no responders yet */}
          {(!responders || responders.length === 0) && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 h-8 text-xs"
                onClick={handleSyncReplies}
                disabled={syncingReplies}
              >
                {syncingReplies ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Sync Email Replies
              </Button>
            </div>
          )}

          {/* 4. Data Management */}
          {org?._id && (
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExportCSV}>
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleImportCSV}>
                <Upload className="h-3.5 w-3.5" />
                Import CSV
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                disabled={clearing}
                onClick={handleClearAll}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {clearing ? "Clearing..." : "Clear All"}
              </Button>
            </div>
          )}
        </div>
      )}

      {activeTab === "social" && (
        <div className="space-y-6">
          {/* 1. Social Stats Table */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Share2 className="h-4 w-4 text-primary" />
              Social Platform Stats
            </h2>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Platform</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Period</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total (All Time)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    { platform: "Reddit", periodVal: postStats?.reddit ?? 0 },
                    { platform: "FB Groups", periodVal: postStats?.metaGroup ?? 0 },
                    { platform: "YouTube", periodVal: (postStats as any)?.youtube ?? 0 },
                    { platform: "Twitter", periodVal: (postStats as any)?.twitter ?? 0 },
                    { platform: "LinkedIn Groups", periodVal: (postStats as any)?.linkedinGroup ?? 0 },
                    { platform: "Discord", periodVal: (postStats as any)?.discord ?? 0 },
                    { platform: "Quora", periodVal: (postStats as any)?.quora ?? 0 },
                    { platform: "Nextdoor", periodVal: (postStats as any)?.nextdoor ?? 0 },
                  ].map((row) => (
                    <tr key={row.platform} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{row.platform}</td>
                      <td className="px-3 py-2 text-right">{row.periodVal}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{row.periodVal}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/20 font-medium">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right">{postStats?.posted ?? 0}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{postStats?.posted ?? 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. Recent Posts Table */}
          {recentPosts && recentPosts.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" />
                Recent Posts
              </h2>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Platform</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Group</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Vertical</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentPosts.map((p) => (
                      <tr key={p._id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-[10px]">
                            {p.platform === "reddit" ? "Reddit" : "Facebook"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 truncate max-w-[160px]">{p.groupName}</td>
                        <td className="px-3 py-2 text-muted-foreground capitalize">{p.vertical}</td>
                        <td className="px-3 py-2">
                          {p.status === "posted" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-destructive" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {new Date(p.postedAt ?? p._creationTime).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {(!recentPosts || recentPosts.length === 0) && (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-border">
              <Share2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="font-semibold mb-1">No social posts yet</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                Social media posts will appear here once agents start posting to Reddit, FB Groups, and other platforms.
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "replies" && (
        <div className="space-y-6">
          {replyIntelligence ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-xl border border-border/40 bg-card/80 p-4">
                  <p className="text-xs text-muted-foreground">Total Replied</p>
                  <p className="text-2xl font-bold mt-1">{replyIntelligence.totalReplied}</p>
                  <p className="text-xs text-muted-foreground mt-1">{replyIntelligence.replyRate}% reply rate</p>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/80 p-4">
                  <p className="text-xs text-muted-foreground">Positive (Hot + Warm)</p>
                  <p className="text-2xl font-bold mt-1 text-emerald-400">{replyIntelligence.classifications.hot + replyIntelligence.classifications.warm}</p>
                  <p className="text-xs text-muted-foreground mt-1">{replyIntelligence.positiveRate}% of replies</p>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/80 p-4">
                  <p className="text-xs text-muted-foreground">Objections</p>
                  <p className="text-2xl font-bold mt-1 text-amber-400">{replyIntelligence.classifications.objection}</p>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/80 p-4">
                  <p className="text-xs text-muted-foreground">Cold / Auto-Reply</p>
                  <p className="text-2xl font-bold mt-1 text-red-400">{replyIntelligence.classifications.cold + replyIntelligence.classifications.auto_reply}</p>
                </div>
              </div>

              {/* Classification Breakdown */}
              <div className="rounded-xl border border-border/40 bg-card/80 p-5">
                <h3 className="text-sm font-semibold mb-4">Reply Classification Breakdown</h3>
                <div className="space-y-3">
                  {(["hot", "warm", "objection", "cold", "auto_reply"] as const).map((cls) => {
                    const count = replyIntelligence.classifications[cls];
                    const total = replyIntelligence.totalReplied || 1;
                    const pct = Math.round((count / total) * 100);
                    const colors: Record<string, string> = { hot: "bg-emerald-500", warm: "bg-green-400", objection: "bg-amber-500", cold: "bg-red-500", auto_reply: "bg-zinc-500" };
                    return (
                      <div key={cls} className="flex items-center gap-3">
                        <span className="text-xs w-20 text-muted-foreground capitalize">{cls.replace("_", " ")}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                          <div className={`h-full rounded-full ${colors[cls]}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-mono w-16 text-right">{count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* By Vertical */}
              {replyIntelligence.byVertical.length > 0 && (
                <div className="rounded-xl border border-border/40 bg-card/80 p-5">
                  <h3 className="text-sm font-semibold mb-4">Reply Quality by Vertical</h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/20">
                        <th className="text-left py-2 font-medium">Vertical</th>
                        <th className="text-right py-2 font-medium">Replies</th>
                        <th className="text-right py-2 font-medium">Hot</th>
                        <th className="text-right py-2 font-medium">Warm</th>
                        <th className="text-right py-2 font-medium">Objection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {replyIntelligence.byVertical.map(([vertical, stats]: [string, any]) => (
                        <tr key={vertical} className="border-b border-border/10">
                          <td className="py-2">{vertical}</td>
                          <td className="py-2 text-right">{stats.total}</td>
                          <td className="py-2 text-right text-emerald-400">{stats.hot}</td>
                          <td className="py-2 text-right text-green-400">{stats.warm}</td>
                          <td className="py-2 text-right text-amber-400">{stats.objection}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Weekly Trend */}
              {replyIntelligence.weeklyTrend.length > 0 && (
                <div className="rounded-xl border border-border/40 bg-card/80 p-5">
                  <h3 className="text-sm font-semibold mb-4">Weekly Reply Trend</h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/20">
                        <th className="text-left py-2 font-medium">Week Of</th>
                        <th className="text-right py-2 font-medium">Hot</th>
                        <th className="text-right py-2 font-medium">Warm</th>
                        <th className="text-right py-2 font-medium">Objection</th>
                        <th className="text-right py-2 font-medium">Cold</th>
                      </tr>
                    </thead>
                    <tbody>
                      {replyIntelligence.weeklyTrend.map(([week, stats]: [string, any]) => (
                        <tr key={week} className="border-b border-border/10">
                          <td className="py-2">{week}</td>
                          <td className="py-2 text-right text-emerald-400">{stats.hot}</td>
                          <td className="py-2 text-right text-green-400">{stats.warm}</td>
                          <td className="py-2 text-right text-amber-400">{stats.objection}</td>
                          <td className="py-2 text-right text-red-400">{stats.cold}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading reply intelligence...</div>
          )}
        </div>
      )}

      {activeTab === "tools" && (
        <div className="space-y-6">
          {/* 1. Enrichment Test Panel */}
          <EnrichmentTestPanel organizationId={org?._id as string} />

          {/* 2. City Management */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">City Campaign Progress</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {cityProgress?.done ?? 0} / {cityProgress?.total ?? 250} cities
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                {cityProgress?.done ?? 0} done
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                {cityProgress?.scraping ?? 0} running
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" />
                {cityProgress?.pending ?? 0} pending
              </span>
              {(cityProgress?.businessesFound ?? 0) > 0 && (
                <span className="ml-auto font-medium text-foreground">
                  {cityProgress?.businessesFound?.toLocaleString()} total businesses
                </span>
              )}
            </div>
          </div>

          {/* City List — collapsible */}
          {cityList && cityList.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setCitiesExpanded(!citiesExpanded)}
                className="flex items-center gap-2 text-sm font-semibold hover:text-foreground transition-colors"
              >
                {citiesExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Target Cities ({cityList.length})
              </button>

              {citiesExpanded && (
                <div className="space-y-2">
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">City</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">State</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Leads</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Last Run</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {[...cityList]
                          .sort((a, b) => {
                            const statusOrder: Record<string, number> = { scraping: 0, pending: 1, done: 2, failed: 3 };
                            return (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4) || a.cityIndex - b.cityIndex;
                          })
                          .map((city) => (
                            <tr key={city._id} className="hover:bg-muted/20">
                              <td className="px-3 py-2 font-medium">{city.cityName}</td>
                              <td className="px-3 py-2 text-muted-foreground">{city.stateCode}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  city.status === "done" ? "bg-green-500/10 text-green-700" :
                                  city.status === "scraping" ? "bg-blue-500/10 text-blue-700" :
                                  city.status === "failed" ? "bg-red-500/10 text-red-600" :
                                  "bg-muted text-muted-foreground"
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    city.status === "done" ? "bg-green-500" :
                                    city.status === "scraping" ? "bg-blue-500 animate-pulse" :
                                    city.status === "failed" ? "bg-red-500" :
                                    "bg-muted-foreground/40"
                                  }`} />
                                  {city.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {city.businessesFound ?? "\u2014"}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {city.lastRunAt ? new Date(city.lastRunAt).toLocaleDateString() : "\u2014"}
                              </td>
                              <td className="px-3 py-2 text-right space-x-1">
                                {city.status === "done" && (
                                  <button
                                    onClick={() => resetCity({ cityId: city._id })}
                                    className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 hover:bg-blue-500/20"
                                  >
                                    Re-scrape
                                  </button>
                                )}
                                {city.status === "pending" && (
                                  <button
                                    onClick={() => skipCity({ cityId: city._id })}
                                    className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80"
                                  >
                                    Skip
                                  </button>
                                )}
                                {city.status === "failed" && (
                                  <button
                                    onClick={() => resetCity({ cityId: city._id })}
                                    className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
                                  >
                                    Retry
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Add Custom City */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="City name"
                      value={addCityName}
                      onChange={(e) => setAddCityName(e.target.value)}
                      className="flex-1 h-8 px-2 text-xs rounded border border-border bg-background"
                    />
                    <input
                      type="text"
                      placeholder="State (IL)"
                      value={addCityState}
                      onChange={(e) => setAddCityState(e.target.value)}
                      className="w-20 h-8 px-2 text-xs rounded border border-border bg-background"
                      maxLength={2}
                    />
                    <button
                      onClick={async () => {
                        if (!org?._id || !addCityName.trim() || !addCityState.trim()) return;
                        await addCity({ organizationId: org._id, cityName: addCityName.trim(), stateCode: addCityState.trim().toUpperCase() });
                        setAddCityName("");
                        setAddCityState("");
                      }}
                      disabled={!addCityName.trim() || !addCityState.trim()}
                      className="h-8 px-3 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      + Add City
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. Initialize Cities button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleInitialize}
              disabled={initializing || (cityProgress?.initialized && (cityProgress?.total ?? 0) > 0)}
              variant="outline"
              className="gap-2"
            >
              {initializing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {cityProgress?.initialized ? "Cities Initialized" : "Initialize 250 Cities"}
            </Button>
          </div>

          {/* 4. Data Management Buttons */}
          {org?._id && (
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                Data Management
              </h2>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExportCSV}>
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleImportCSV}>
                  <Upload className="h-3.5 w-3.5" />
                  Import CSV
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1.5"
                  disabled={clearing}
                  onClick={handleClearAll}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {clearing ? "Clearing..." : "Clear All Test Data"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Business Detail Drawer (always available) ─────────────── */}
      {selectedBusinessId && (
        <BusinessDetailDrawer
          businessId={selectedBusinessId}
          onClose={() => setSelectedBusinessId(null)}
        />
      )}
    </div>
  );
}

// ── Enrichment Test Panel ────────────────────────────────────────────

function EnrichmentTestPanel({ organizationId }: { organizationId?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("Chicago");
  const [state, setState] = useState("IL");
  const [website, setWebsite] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleTest = async () => {
    if (!name.trim() || !organizationId) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/enrichment-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: name.trim(), city, state, website: website.trim() || undefined, googlePlaceId: placeId.trim() || undefined, organizationId }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Enrichment Test</span>
          <span className="text-xs text-muted-foreground">\u2014 Test what the Research Agent finds for a business</span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Business Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Rescue Plumbing" className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">City *</label>
              <input value={city} onChange={e => setCity(e.target.value)} className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">State *</label>
              <input value={state} onChange={e => setState(e.target.value)} placeholder="IL" className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Website (optional)</label>
              <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://www.rescueplumbing.com" className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Google Place ID (optional)</label>
              <input value={placeId} onChange={e => setPlaceId(e.target.value)} placeholder="ChIJ..." className="w-full mt-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleTest} disabled={running || !name.trim() || !organizationId} size="sm" className="gap-1.5">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {running ? "Enriching..." : "Test Enrichment"}
            </Button>
            {running && <span className="text-xs text-muted-foreground">This may take 30-60 seconds...</span>}
          </div>

          {result && (
            <div className="space-y-3">
              {result.error ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-600">
                  Error: {result.error}
                </div>
              ) : (
                <>
                  {/* Results summary */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                      <span className="text-muted-foreground">Owner:</span>{" "}
                      <span className={result.owner ? "text-emerald-700 font-medium" : "text-red-600"}>{result.owner || "NOT FOUND"}</span>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                      <span className="text-muted-foreground">Email:</span>{" "}
                      <span className={result.emails?.[0] ? "text-emerald-700 font-medium" : "text-red-600"}>{result.emails?.[0] || "NOT FOUND"}</span>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                      <span className="text-muted-foreground">Facebook:</span>{" "}
                      {result.facebook ? (
                        <a href={result.facebook} target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-medium hover:underline break-all">{result.facebook}</a>
                      ) : (
                        <span className="text-red-600">NOT FOUND</span>
                      )}
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                      <span className="text-muted-foreground">LinkedIn:</span>{" "}
                      {result.linkedin?.company ? (
                        <a href={result.linkedin.company} target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-medium hover:underline break-all">{result.linkedin.company}</a>
                      ) : (
                        <span className="text-red-600">NOT FOUND</span>
                      )}
                    </div>
                    {result.linkedin?.owner && (
                      <div className="rounded-lg border border-border bg-muted/30 p-2.5 col-span-2">
                        <span className="text-muted-foreground">LinkedIn Owner:</span>{" "}
                        <a href={result.linkedin.owner} target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-medium hover:underline break-all">{result.linkedin.owner}</a>
                      </div>
                    )}
                    <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                      <span className="text-muted-foreground">Reviews:</span>{" "}
                      <span className={result.reviews?.length ? "text-emerald-700 font-medium" : "text-red-600"}>{result.reviews?.length || 0}</span>
                    </div>
                    {result.emails?.length > 1 && (
                      <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                        <span className="text-muted-foreground">All emails:</span>{" "}
                        <span className="text-foreground text-[10px]">{result.emails.join(", ")}</span>
                      </div>
                    )}
                  </div>

                  {/* Reviews */}
                  {result.reviews?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground">Reviews ({result.reviews.length})</p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {result.reviews.map((r: any, i: number) => (
                          <div key={i} className="text-[10px] bg-muted/20 rounded p-1.5 border border-border">
                            <span className="font-medium">{r.reviewerName}</span> — {"\u2B50".repeat(r.rating)} — <span className="text-muted-foreground">{r.text?.slice(0, 150)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Full enrichment log */}
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">Full Enrichment Log</p>
                    <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted/20 border border-border rounded-lg p-3 max-h-64 overflow-y-auto font-mono">
                      {result.log}
                    </pre>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Business Detail Drawer ────────────────────────────────────────────

function BusinessDetailDrawer({
  businessId,
  onClose,
}: {
  businessId: Id<"businesses">;
  onClose: () => void;
}) {
  const business = useQuery(api.businesses.getById, { id: businessId });

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  if (!business) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative w-full max-w-2xl bg-background rounded-xl border border-border flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const b = business;
  const score = b.leadScore ?? 0;
  const scoreColor = score >= 50 ? "text-emerald-700" : score >= 25 ? "text-amber-700" : "text-muted-foreground";
  const scoreBg = score >= 50 ? "bg-emerald-500/20" : score >= 25 ? "bg-amber-500/20" : "bg-muted/40";

  const statusColors: Record<string, string> = {
    new: "bg-blue-500/20 text-blue-700 border-blue-500/30",
    enriching: "bg-purple-500/20 text-purple-700 border-purple-500/30",
    ready: "bg-green-500/20 text-green-700 border-green-500/30",
    all_sent: "bg-amber-500/20 text-amber-700 border-amber-500/30",
  };

  const fmtDate = (ts?: number) => (ts ? new Date(ts).toLocaleDateString() : null);
  const fmtDateTime = (ts?: number) => (ts ? new Date(ts).toLocaleString() : null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal panel */}
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-background rounded-xl border border-border overflow-y-auto animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold truncate">{b.name}</h2>
            <p className="text-xs text-muted-foreground truncate">{b.address?.formatted}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Status + Score row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`text-xs ${statusColors[b.status] ?? ""}`}>
              {b.status}
            </Badge>
            {b.leadScore !== undefined && (
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${scoreBg} ${scoreColor}`}>
                <Star className="h-3 w-3" />
                {b.leadScore} / 100
              </div>
            )}
            {b.enrichmentQuality !== undefined && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Enrichment: {b.enrichmentQuality}/4
              </Badge>
            )}
          </div>

          {/* Contact Info */}
          <Section title="Contact Information">
            <div className="space-y-2">
              <DetailRow icon={<MapPin className="h-3.5 w-3.5" />} label="Address">
                <span>
                  {b.address?.street && <>{b.address.street}<br /></>}
                  {b.address?.city}, {b.address?.state} {b.address?.zip}
                </span>
              </DetailRow>
              {b.phone && (
                <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone">
                  <a href={`tel:${b.phone}`} className="text-primary hover:underline">{b.phone}</a>
                </DetailRow>
              )}
              {b.email && (
                <DetailRow icon={<Mail className="h-3.5 w-3.5" />} label="Email">
                  <a href={`mailto:${b.email}`} className="text-primary hover:underline break-all">{b.email}</a>
                </DetailRow>
              )}
              {b.website && (
                <DetailRow icon={<Globe className="h-3.5 w-3.5" />} label="Website">
                  <a href={b.website.startsWith("http") ? b.website : `https://${b.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 break-all">
                    {b.website} <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  </a>
                </DetailRow>
              )}
            </div>
          </Section>

          {/* Google Rating */}
          {(b.rating || b.reviewCount) && (
            <Section title="Google Rating">
              <div className="flex items-center gap-3">
                {b.rating && (
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${i < Math.round(b.rating ?? 0) ? "text-amber-700 fill-amber-400" : "text-muted-foreground/30"}`}
                      />
                    ))}
                    <span className="text-sm font-semibold ml-1">{b.rating}</span>
                  </div>
                )}
                {b.reviewCount !== undefined && (
                  <span className="text-xs text-muted-foreground">({b.reviewCount} reviews)</span>
                )}
              </div>
            </Section>
          )}

          {/* Categories / Vertical */}
          {(b.categories?.length > 0 || b.vertical) && (
            <Section title="Categories">
              <div className="flex flex-wrap gap-1.5">
                {b.vertical && (
                  <Badge className="text-xs bg-primary/20 text-primary border-primary/30">{b.vertical}</Badge>
                )}
                {b.categories?.map((cat, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{cat}</Badge>
                ))}
              </div>
            </Section>
          )}

          {/* Owner Info */}
          {(b.ownerName || b.ownerTitle) && (
            <Section title="Owner">
              <DetailRow icon={<User className="h-3.5 w-3.5" />} label="Name">
                <span>
                  {b.ownerName ?? "Unknown"}
                  {b.ownerTitle && <span className="text-muted-foreground ml-1">({b.ownerTitle})</span>}
                </span>
              </DetailRow>
            </Section>
          )}

          {/* Social Profiles */}
          {(b.metaPageUrl || b.linkedinUrl || b.linkedinOwnerUrl) && (
            <Section title="Social Profiles">
              <div className="space-y-2">
                {b.metaPageUrl && (
                  <DetailRow icon={<Facebook className="h-3.5 w-3.5" />} label="Facebook">
                    <a href={b.metaPageUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 break-all">
                      Facebook Page <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    </a>
                  </DetailRow>
                )}
                {b.linkedinUrl && (
                  <DetailRow icon={<Linkedin className="h-3.5 w-3.5" />} label="LinkedIn (Biz)">
                    <a href={b.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 break-all">
                      Company Page <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    </a>
                  </DetailRow>
                )}
                {b.linkedinOwnerUrl && (
                  <DetailRow icon={<Linkedin className="h-3.5 w-3.5" />} label="LinkedIn (Owner)">
                    <a href={b.linkedinOwnerUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 break-all">
                      Owner Profile <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    </a>
                  </DetailRow>
                )}
              </div>
            </Section>
          )}

          {/* Outreach Status */}
          {b.outreachStatus && (
            <Section title="Outreach Status">
              <div className="space-y-2 text-xs">
                <OutreachChannelRow
                  channel="Email"
                  sentAt={b.outreachStatus.emailSentAt}
                  repliedAt={b.outreachStatus.emailRepliedAt}
                  color="green"
                />
                <OutreachChannelRow
                  channel="Meta"
                  sentAt={b.outreachStatus.metaSentAt}
                  repliedAt={b.outreachStatus.metaRepliedAt}
                  color="blue"
                />
                <OutreachChannelRow
                  channel="LinkedIn"
                  sentAt={b.outreachStatus.linkedinSentAt}
                  repliedAt={b.outreachStatus.linkedinRepliedAt}
                  color="sky"
                />
              </div>
              {b.outreachSequenceStep !== undefined && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Sequence step: <span className="text-foreground font-medium">
                    {["Email #1", "LinkedIn/FB", "Email #2", "LI Follow-up", "Final Email"][b.outreachSequenceStep] ?? `Step ${b.outreachSequenceStep}`}
                  </span>
                </div>
              )}
            </Section>
          )}

          {/* Email Tracking */}
          {(b.emailStatus || b.emailOpenCount || b.emailOpenedAt) && (
            <Section title="Email Tracking">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {b.emailOpenCount !== undefined && (
                  <div>
                    <span className="text-muted-foreground">Opens:</span>{" "}
                    <span className="font-medium text-foreground">{b.emailOpenCount}</span>
                  </div>
                )}
                {b.emailOpenedAt && (
                  <div>
                    <span className="text-muted-foreground">First open:</span>{" "}
                    <span className="text-foreground">{fmtDateTime(b.emailOpenedAt)}</span>
                  </div>
                )}
                {b.emailStatus && b.emailStatus !== "active" && (
                  <div className="col-span-2">
                    <Badge className={`text-xs ${b.emailStatus === "bounced" ? "bg-destructive/20 text-destructive" : "bg-amber-500/20 text-amber-700"}`}>
                      {b.emailStatus === "bounced" ? "Bounced" : "Unsubscribed"}
                    </Badge>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Google Reviews */}
          <Section title={`Google Reviews (${b.reviews?.length ?? 0} of ${b.reviewCount ?? "?"} total)`}>
            {b.reviews && b.reviews.length > 0 ? (
              <div className="space-y-3">
                {b.reviews.map((review: any, i: number) => (
                  <div key={i} className="rounded-lg bg-muted/30 border border-border p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">{review.reviewerName || "Anonymous"}</span>
                      <span className="text-[10px] text-muted-foreground">{review.relativeTime || "Unknown date"}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star
                          key={j}
                          className={`h-3 w-3 ${j < (review.rating ?? 5) ? "text-amber-700 fill-amber-400" : "text-muted-foreground/30"}`}
                        />
                      ))}
                      <span className="text-[10px] text-muted-foreground ml-1">{review.rating}/5</span>
                    </div>
                    {review.text ? (
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{review.text}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground/50 italic">No review text</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">No reviews scraped yet. Reviews are collected during the scraping phase (up to 10 per business).</p>
            )}
          </Section>

          {/* Enrichment Process Log */}
          <Section title="Enrichment Process Log">
            {(b as any).enrichmentLog ? (
              <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted/20 border border-border rounded-lg p-3 max-h-48 overflow-y-auto font-mono">
                {(b as any).enrichmentLog}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">No enrichment log yet. The Research Agent logs what it searched and found for each business.</p>
            )}
          </Section>

          {/* Website Quality */}
          {(b as any).websiteQuality && (
            <Section title={`Website Quality \u2014 ${(b as any).websiteQuality.score}/100`}>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${(b as any).websiteQuality.ssl ? "bg-green-500" : "bg-red-500"}`} />
                  SSL: {(b as any).websiteQuality.ssl ? "HTTPS" : "HTTP only"}
                </div>
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${(b as any).websiteQuality.mobile ? "bg-green-500" : "bg-red-500"}`} />
                  Mobile: {(b as any).websiteQuality.mobile ? "Responsive" : "Not responsive"}
                </div>
                <div>Platform: {(b as any).websiteQuality.platform || "Unknown"}</div>
                <div>Speed: {(b as any).websiteQuality.speed || "Unknown"}</div>
                <div>Contact form: {(b as any).websiteQuality.hasContactForm ? "Yes" : "No"}</div>
                <div>Last updated: {(b as any).websiteQuality.lastUpdated || "Unknown"}</div>
              </div>
              <div className={`mt-2 text-xs font-medium px-2 py-1 rounded inline-block ${
                (b as any).websiteQuality.needsUpgrade === "critical" ? "bg-red-500/20 text-red-600" :
                (b as any).websiteQuality.needsUpgrade === "recommended" ? "bg-amber-500/20 text-amber-700" :
                "bg-green-500/20 text-green-700"
              }`}>
                Upgrade: {(b as any).websiteQuality.needsUpgrade.toUpperCase()}
              </div>
            </Section>
          )}

          {/* Review Insights */}
          {(b as any).reviewInsights && (
            <Section title="Review Insights">
              <div className="space-y-2 text-xs">
                {(b as any).reviewInsights.bestQuote && (
                  <div className="bg-muted/20 border border-border rounded-lg p-2">
                    <p className="italic text-foreground">&ldquo;{(b as any).reviewInsights.bestQuote}&rdquo;</p>
                    <p className="text-muted-foreground mt-1">\u2014 {(b as any).reviewInsights.bestQuoteAuthor || "A customer"}</p>
                  </div>
                )}
                <div className="flex gap-4">
                  <div>
                    <span className="text-muted-foreground">Sentiment:</span>{" "}
                    <span className={`font-medium ${(b as any).reviewInsights.sentimentScore >= 80 ? "text-green-700" : (b as any).reviewInsights.sentimentScore >= 50 ? "text-amber-700" : "text-red-600"}`}>
                      {(b as any).reviewInsights.sentimentScore}%
                    </span>
                  </div>
                  {(b as any).reviewInsights.customerType && (
                    <div><span className="text-muted-foreground">Customers:</span> {(b as any).reviewInsights.customerType}</div>
                  )}
                </div>
                {(b as any).reviewInsights.strengths.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Strengths:</span>{" "}
                    {(b as any).reviewInsights.strengths.map((s: string) => (
                      <span key={s} className="inline-block mr-1 mb-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-700 text-[10px]">{s}</span>
                    ))}
                  </div>
                )}
                {(b as any).reviewInsights.weaknesses.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Weaknesses:</span>{" "}
                    {(b as any).reviewInsights.weaknesses.map((w: string) => (
                      <span key={w} className="inline-block mr-1 mb-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 text-[10px]">{w}</span>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Sent Emails */}
          {(b as any).sentEmails && (b as any).sentEmails.length > 0 && (
            <Section title={`Sent Emails (${(b as any).sentEmails.length})`}>
              <div className="space-y-3">
                {(b as any).sentEmails.map((email: any, i: number) => (
                  <div key={i} className="bg-muted/20 border border-border rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">{email.subject}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(email.sentAt).toLocaleString()}</span>
                    </div>
                    <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">{email.body}</pre>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>via {email.provider}</span>
                      {email.messageId && <span className="truncate max-w-[200px]">ID: {email.messageId}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Activity Timeline */}
          <Section title="Activity Timeline">
            <div className="space-y-1.5 text-[11px]">
              {b.createdAt && (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-muted-foreground">{fmtDateTime(b.createdAt)}</span>
                  <span>Scraped from Google Maps ({b.address.city}, {b.address.state})</span>
                </div>
              )}
              {b.status !== "new" && b.updatedAt && b.updatedAt !== b.createdAt && (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                  <span className="text-muted-foreground">{fmtDateTime(b.updatedAt)}</span>
                  <span>Enriched \u2014 {[
                    b.ownerName && `Owner: ${b.ownerName}`,
                    b.email && "Email found",
                    b.metaPageUrl && "Facebook found",
                    (b as any).linkedinOwnerUrl && "LinkedIn found",
                  ].filter(Boolean).join(", ") || "No additional data found"}</span>
                </div>
              )}
              {(b as any).websiteQuality && (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-muted-foreground">{fmtDateTime(b.updatedAt)}</span>
                  <span>Website scored {(b as any).websiteQuality.score}/100 ({(b as any).websiteQuality.needsUpgrade})</span>
                </div>
              )}
              {b.outreachStatus?.emailSentAt && (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <span className="text-muted-foreground">{fmtDateTime(b.outreachStatus.emailSentAt)}</span>
                  <span>Email sent to {b.email}</span>
                </div>
              )}
              {b.outreachStatus?.metaSentAt && (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-muted-foreground">{fmtDateTime(b.outreachStatus.metaSentAt)}</span>
                  <span>Facebook DM sent</span>
                </div>
              )}
              {b.outreachStatus?.linkedinSentAt && (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                  <span className="text-muted-foreground">{fmtDateTime(b.outreachStatus.linkedinSentAt)}</span>
                  <span>LinkedIn connection sent</span>
                </div>
              )}
              {b.outreachStatus?.emailRepliedAt && (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-muted-foreground">{fmtDateTime(b.outreachStatus.emailRepliedAt)}</span>
                  <span className="font-medium text-emerald-700">Reply received!</span>
                </div>
              )}
              {!b.outreachStatus?.emailSentAt && !b.outreachStatus?.metaSentAt && !b.outreachStatus?.linkedinSentAt && b.status === "ready" && (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-muted-foreground">Now</span>
                  <span className="text-amber-700">Queued for outreach</span>
                </div>
              )}
            </div>
          </Section>

          {/* Timestamps */}
          <Section title="Record Info">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Created:</span>{" "}
                <span className="text-foreground">{fmtDateTime(b.createdAt)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Updated:</span>{" "}
                <span className="text-foreground">{fmtDateTime(b.updatedAt)}</span>
              </div>
              {b.googlePlaceId && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Google Place ID:</span>{" "}
                  <span className="text-foreground/60 text-[10px] break-all">{b.googlePlaceId}</span>
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ── Drawer helper components ──────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span className="text-foreground">{children}</span>
      </div>
    </div>
  );
}

function OutreachChannelRow({
  channel,
  sentAt,
  repliedAt,
  color,
}: {
  channel: string;
  sentAt?: number;
  repliedAt?: number;
  color: string;
}) {
  if (!sentAt) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{channel}</span>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">
          Sent {new Date(sentAt).toLocaleDateString()}
        </span>
        {repliedAt ? (
          <Badge className={`text-[10px] px-1.5 py-0 bg-${color}-500/20 text-${color}-400 border-${color}-500/30`}>
            Replied {new Date(repliedAt).toLocaleDateString()}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
            No reply
          </Badge>
        )}
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-1">
      <div className={`flex items-center gap-1.5 ${color}`}>
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}

// ── Response Rate Card ─────────────────────────────────────────────────

function ResponseRateCard({
  label,
  sent,
  replied,
  icon,
  colorClass,
}: {
  label: string;
  sent: number;
  replied: number;
  icon: React.ReactNode;
  colorClass: string;
}) {
  const rate = sent > 0 ? Math.round((replied / sent) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className={`text-${colorClass}-400`}>{icon}</div>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{sent.toLocaleString()} sent</span>
          <span className={`font-bold text-${colorClass}-400`}>{rate}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5">
          <div
            className={`bg-${colorClass}-500 h-1.5 rounded-full transition-all`}
            style={{ width: `${Math.min(rate, 100)}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="text-foreground font-medium">{replied}</span> replied
        </div>
      </div>
    </div>
  );
}
