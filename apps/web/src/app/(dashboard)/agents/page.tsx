"use client";

import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { AGENT_CATEGORIES, AGENT_REGISTRY, type AgentType } from "@/lib/agents/registry";
import { ModelSelector } from "@/components/chat/model-selector";
import { getModelsForPlan } from "@/lib/agents/models";
import { MainAgentCard } from "@/components/agents/main-agent-card";
import { SubAgentCard } from "@/components/agents/sub-agent-card";
import { SwarmVisualization } from "@/components/agents/swarm-visualization";
import { AgentDetailPanel } from "@/components/agents/agent-detail-panel";
import { CommunicationsPanel } from "@/components/agents/communications-panel";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Paperclip,
  SlidersHorizontal,
  ArrowUp,
  Sparkles,
  Globe,
  FileText,
  MessageCircle,
  Search,
  Image,
  Presentation,
  Table,
  Video,
  Wrench,
  Folder,
  Clock,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Users,
  Settings,
  Target,
  TrendingUp,
  Share2,
  Megaphone,
  Headphones,
} from "lucide-react";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

const ICON_MAP: Record<string, any> = {
  Sparkles,
  Image,
  FileText,
  Presentation,
  MessageCircle,
  Table,
  Globe,
  Video,
  Wrench,
  Search,
  Target,
  TrendingUp,
  Share2,
  Megaphone,
  Headphones,
};

const FEATURED_AGENTS: AgentType[] = ["general", "websites", "documents", "chat"];

export default function AgentsPage() {
  const router = useRouter();
  const { user } = useUser();
  const { org, effectiveClerkOrgId, isImpersonating } = useEffectiveOrg();
  const [input, setInput] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<AgentType>("general");
  const [showAllAgents, setShowAllAgents] = useState(false);
  const [showTeam, setShowTeam] = useState(true);
  const [showComms, setShowComms] = useState(false);
  const [selectedSubAgent, setSelectedSubAgent] = useState<Doc<"teamAgents"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [modelId, setModelId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentUser = useQuery(
    api.users.getCurrent,
    user?.id && effectiveClerkOrgId
      ? { clerkUserId: user.id, clerkOrgId: effectiveClerkOrgId }
      : "skip"
  );

  const projects = useQuery(
    api.projects.list,
    org?._id ? { organizationId: org._id } : "skip"
  );

  // Team data (reactive — updates in real-time)
  const team = useQuery(
    api.agentTeams.getByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const subAgents = useQuery(
    api.teamAgents.listByTeam,
    team?._id ? { agentTeamId: team._id } : "skip"
  );

  // Agents + their last activity (from agentDecisionLog). Powers the activity snapshot.
  const agentsWithActivity = useQuery(
    api.teamAgents.listByOrganizationWithActivity,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const createProject = useMutation(api.projects.create);

  // Fetch scheduled tasks + provider statuses for agent card metadata
  const scheduledTasks = useQuery(
    api.scheduledTaskRunner.listByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );
  const [providerStatuses, setProviderStatuses] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!org?._id) return;
    fetch(`/api/provider-keys?organizationId=${org._id}`)
      .then(r => r.json())
      .then(data => {
        if (data.providers) {
          const map: Record<string, boolean> = {};
          for (const p of data.providers) map[p.provider] = p.connected;
          setProviderStatuses(map);
        }
      })
      .catch(() => {});
    // Also check multi-account providers
    Promise.all([
      fetch(`/api/provider-keys/social-accounts?provider=meta_accounts&organizationId=${org._id}`).then(r => r.json()),
      fetch(`/api/provider-keys/social-accounts?provider=linkedin_accounts&organizationId=${org._id}`).then(r => r.json()),
      fetch(`/api/provider-keys/social-accounts?provider=gmail_smtp_accounts&organizationId=${org._id}`).then(r => r.json()),
    ]).then(([meta, linkedin, gmail]) => {
      setProviderStatuses(prev => ({
        ...prev,
        meta_accounts: (meta.accounts?.length ?? 0) > 0,
        linkedin_accounts: (linkedin.accounts?.length ?? 0) > 0,
        gmail_smtp_accounts: (gmail.accounts?.length ?? 0) > 0,
      }));
    }).catch(() => {});
  }, [org?._id]);

  // Build agent metadata from provider statuses and campaign config
  const agentMeta = useMemo(() => {
    const meta: Record<string, { credentialStatus?: "connected" | "missing"; taskSummary?: string }> = {};
    const hasMetaLogin = providerStatuses.meta || providerStatuses.meta_accounts;
    const hasLinkedinLogin = providerStatuses.linkedin || providerStatuses.linkedin_accounts;
    const hasEmail = providerStatuses.warmed_email || providerStatuses.gmail_smtp || providerStatuses.gmail_smtp_accounts;

    // Credential status
    meta["Meta Outreach Agent"] = { credentialStatus: hasMetaLogin ? "connected" : "missing" };
    meta["LinkedIn Outreach Agent"] = { credentialStatus: hasLinkedinLogin ? "connected" : "missing" };
    meta["Cold Email Agent"] = { credentialStatus: hasEmail ? "connected" : "missing" };

    // Task summaries from active scheduled tasks
    const activeTasks = (scheduledTasks || []).filter((t: any) => t.status === "active" && t.campaignConfig);
    for (const task of activeTasks) {
      const cc = task.campaignConfig;
      if (!cc) continue;
      const channels = cc.outreachChannels || [];
      const chConfig = cc.channelConfig || {};

      if (channels.includes("email")) {
        const emailCfg = chConfig.email;
        const accounts = emailCfg?.selectedAccounts?.length || 1;
        const limit = emailCfg?.dailyLimit || 50;
        meta["Cold Email Agent"] = {
          ...meta["Cold Email Agent"],
          taskSummary: `${limit * accounts} emails/day`,
        };
      }
      if (channels.includes("meta")) {
        const metaCfg = chConfig.meta;
        const accounts = metaCfg?.selectedAccounts?.length || 1;
        const limit = metaCfg?.dailyLimit || 10;
        meta["Meta Outreach Agent"] = {
          ...meta["Meta Outreach Agent"],
          taskSummary: `${limit * accounts} messages/day`,
        };
      }
      if (channels.includes("linkedin")) {
        const liCfg = chConfig.linkedin;
        const accounts = liCfg?.selectedAccounts?.length || 1;
        const limit = liCfg?.dailyLimit || 10;
        meta["LinkedIn Outreach Agent"] = {
          ...meta["LinkedIn Outreach Agent"],
          taskSummary: `${limit * accounts} connections/day`,
        };
      }

      // Social presence summaries
      const sp = cc.socialPresence;
      if (sp) {
        const socialParts: string[] = [];
        if (sp.postToReddit) socialParts.push(`${sp.redditPostCount || 5} Reddit/${sp.redditPostFrequency || "daily"}`);
        if (sp.postToMetaGroups) socialParts.push(`${sp.metaPostCount || 5} FB groups/${sp.metaPostFrequency || "daily"}`);
        if (sp.postToLinkedinGroups) socialParts.push(`${sp.linkedinPostCount || 3} LI groups/${sp.linkedinPostFrequency || "weekly"}`);
        if (sp.postToYoutube) socialParts.push(`${sp.youtubePostCount || 3} YouTube/${sp.youtubePostFrequency || "weekly"}`);
        if (sp.postToDiscord) socialParts.push(`${sp.discordPostCount || 3} Discord/${sp.discordPostFrequency || "weekly"}`);
        if (sp.postToNextdoor) socialParts.push(`${sp.nextdoorPostCount || 3} Nextdoor/${sp.nextdoorPostFrequency || "weekly"}`);
        if (sp.postToQuora) socialParts.push(`${sp.quoraPostCount || 3} Quora/${sp.quoraPostFrequency || "weekly"}`);
        if (sp.postToTwitter) socialParts.push(`${sp.twitterPostCount || 5} X-Twitter/${sp.twitterPostFrequency || "daily"}`);
        if (socialParts.length > 0) {
          meta["Social Presence Agent"] = {
            taskSummary: socialParts.join(" · "),
          };
        }
      }

      // Scraping agent summary
      meta["Scraping Agent"] = {
        taskSummary: `${cc.dailyResults || 250} leads/day · ${cc.verticals?.length || 0} verticals`,
      };
    }
    return meta;
  }, [scheduledTasks, providerStatuses]);

  // Initialize model from team config or agent default
  useEffect(() => {
    if (modelId !== null || !org) return;
    const plan = org.plan || "free";
    const available = getModelsForPlan(plan);

    // Use team's model as default if configured
    if (team?.modelId) {
      const availableIds = new Set(available.map((m) => m.id));
      if (availableIds.has(team.modelId)) {
        setModelId(team.modelId);
        return;
      }
    }

    const agent = AGENT_REGISTRY[selectedAgent];
    const availableIds = new Set(available.map((m) => m.id));

    if (availableIds.has(agent.defaultModel)) {
      setModelId(agent.defaultModel);
    } else if (available.length > 0) {
      setModelId(available[available.length - 1].id);
    } else {
      setModelId(agent.defaultModel);
    }
  }, [org, modelId, selectedAgent, team]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || !org?._id || (!currentUser?._id && !isImpersonating) || isCreating) return;

    setIsCreating(true);
    try {
      const agentConfig = AGENT_REGISTRY[selectedAgent];
      const projectId = await createProject({
        organizationId: org._id,
        createdBy: currentUser!._id,
        name: input.trim().slice(0, 50) || `${agentConfig.name} Project`,
        agentType: selectedAgent,
      });

      // Store the initial message so the chat panel can auto-send it
      sessionStorage.setItem(`initial-message:${projectId}`, input.trim());
      router.push(`/project/${projectId}`);
    } catch (error) {
      console.error("Failed to create project:", error);
      setIsCreating(false);
    }
  }, [input, org, currentUser, selectedAgent, createProject, router, isCreating, isImpersonating]);

  const handleAgentChipClick = (agentType: AgentType) => {
    setSelectedAgent(agentType);
    if (org) {
      const plan = org.plan || "free";
      const available = getModelsForPlan(plan);
      const agent = AGENT_REGISTRY[agentType];
      const availableIds = new Set(available.map((m) => m.id));
      if (availableIds.has(agent.defaultModel)) {
        setModelId(agent.defaultModel);
      }
    }
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const selectedAgentConfig = AGENT_REGISTRY[selectedAgent];
  const hasByok = !!org?.providerKeys?.openrouter;
  const recentProjects = projects?.slice(0, 5);
  const hasTeam = !!team;

  return (
    <div className="flex flex-col items-center min-h-[calc(100vh-4rem)] px-4 py-8">
      {/* Header — Team-aware or default */}
      {!hasTeam && (
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            AI Agent, making work easier.
          </h1>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-2 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Set up your Swarm Agents
          </Link>
        </div>
      )}

      {/* Chat Input Area */}
      <div className="w-full max-w-2xl">
        <div className={cn(
          "rounded-2xl border border-border bg-muted/20 transition-all",
          "focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20",
          "shadow-sm hover:shadow-md"
        )}>
          {/* Textarea */}
          <div className="px-4 pt-4 pb-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                hasTeam
                  ? `Ask ${team.name} anything...`
                  : `Enter your task and submit to ${selectedAgentConfig.name} Agent.`
              }
              disabled={isCreating}
              rows={4}
              className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed min-h-[100px] max-h-[200px]"
            />
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 pb-3">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
                disabled={isCreating}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
                disabled={isCreating}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {modelId && (
                <ModelSelector
                  value={modelId}
                  onChange={setModelId}
                  plan={org?.plan || "free"}
                  hasByok={hasByok}
                />
              )}
              <Button
                size="icon"
                onClick={handleSubmit}
                disabled={!input.trim() || isCreating || !org || (!currentUser && !isImpersonating)}
                className={cn(
                  "h-9 w-9 rounded-full transition-all",
                  input.trim()
                    ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Agent Type Chips (shown when no team configured) */}
        {!hasTeam && (
          <>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
              {FEATURED_AGENTS.map((agentType) => {
                const agent = AGENT_REGISTRY[agentType];
                const Icon = ICON_MAP[agent.icon] || Sparkles;
                const isSelected = selectedAgent === agentType;

                return (
                  <button
                    key={agentType}
                    onClick={() => handleAgentChipClick(agentType)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all",
                      isSelected
                        ? "border-primary/50 bg-primary/10 text-foreground shadow-sm"
                        : "border-border bg-card/80 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/50"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", isSelected ? agent.color : "")} />
                    {agent.name}
                  </button>
                );
              })}

              <button
                onClick={() => setShowAllAgents(!showAllAgents)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-all",
                  showAllAgents
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border bg-card/80 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                More
                {showAllAgents ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {showAllAgents && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                {AGENT_CATEGORIES.filter(
                  (a) => !FEATURED_AGENTS.includes(a.type)
                ).map((agent) => {
                  const Icon = ICON_MAP[agent.icon] || Sparkles;
                  const isSelected = selectedAgent === agent.type;

                  return (
                    <button
                      key={agent.type}
                      onClick={() => handleAgentChipClick(agent.type)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all",
                        isSelected
                          ? "border-primary/50 bg-primary/10 text-foreground shadow-sm"
                          : "border-border bg-card/80 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/50",
                      )}
                    >
                      <Icon className={cn("h-4 w-4", isSelected ? agent.color : "")} />
                      {agent.name}
                      {agent.proOnly && (
                        <Badge
                          variant="secondary"
                          className="text-[9px] px-1.5 py-0 bg-primary/15 text-primary border-0 font-semibold"
                        >
                          PRO
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Activity snapshot — last seen per agent from agentDecisionLog */}
      {hasTeam && agentsWithActivity && agentsWithActivity.length > 0 && (
        <div className="w-full max-w-3xl mt-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            <Clock className="h-3.5 w-3.5" />
            Activity Snapshot
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium">Agent</th>
                  <th className="text-left px-3 py-1.5 font-medium">Last seen</th>
                  <th className="text-left px-3 py-1.5 font-medium">Last action</th>
                </tr>
              </thead>
              <tbody>
                {agentsWithActivity
                  .filter((a) => !a.isHidden)
                  .map((a) => {
                    const ageMs = a.lastActivity
                      ? Date.now() - a.lastActivity.createdAt
                      : Infinity;
                    const fresh = ageMs < 10 * 60 * 1000;
                    const recent = ageMs < 24 * 60 * 60 * 1000;
                    return (
                      <tr key={a._id} className="border-t border-border">
                        <td className="px-3 py-1.5 font-medium">{a.name}</td>
                        <td className="px-3 py-1.5">
                          {a.lastActivity ? (
                            <span
                              className={`inline-flex items-center gap-1 ${
                                fresh
                                  ? "text-emerald-700"
                                  : recent
                                  ? "text-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  fresh
                                    ? "bg-emerald-500 animate-pulse"
                                    : recent
                                    ? "bg-foreground/40"
                                    : "bg-muted-foreground/40"
                                }`}
                              />
                              {new Date(a.lastActivity.createdAt).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">never</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[300px]">
                          {a.lastActivity
                            ? `${a.lastActivity.decision}${
                                a.lastActivity.reason ? ` — ${a.lastActivity.reason}` : ""
                              }`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Swarm Visualization */}
      {hasTeam && subAgents && subAgents.filter((a) => !a.isHidden).length > 0 && (
        <div className="w-full max-w-3xl mt-6">
          <button
            onClick={() => setShowTeam(!showTeam)}
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 hover:text-foreground transition-colors"
          >
            <Users className="h-3.5 w-3.5" />
            Swarm ({subAgents.filter((a) => !a.isHidden).length})
            {showTeam ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          {showTeam && (
            <SwarmVisualization
              team={team}
              subAgents={subAgents}
              onAgentClick={(agent) => setSelectedSubAgent(agent)}
              agentMeta={agentMeta}
            />
          )}
        </div>
      )}

      {/* Agent Detail Panel */}
      {selectedSubAgent && team && (
        <AgentDetailPanel
          agent={selectedSubAgent}
          agentTeamId={team._id}
          onClose={() => setSelectedSubAgent(null)}
        />
      )}

      {/* Communications Feed */}
      {hasTeam && (
        <div className="w-full max-w-2xl mt-6">
          <button
            onClick={() => setShowComms(!showComms)}
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 hover:text-foreground transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Communications
            {showComms ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          {showComms && <CommunicationsPanel agentTeamId={team._id} />}
        </div>
      )}

      {/* Recent Projects */}
      {recentProjects && recentProjects.length > 0 && (
        <div className="w-full max-w-2xl mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Recent Projects
          </h2>
          <div className="space-y-1.5">
            {recentProjects.map((project: Doc<"projects">) => (
              <Link
                key={project._id}
                href={`/project/${project._id}`}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 px-4 py-3 transition-all hover:border-primary/30 hover:bg-accent/30"
              >
                <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">
                    {project.name}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className="text-[10px] capitalize shrink-0"
                >
                  {project.agentType}
                </Badge>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(project.lastActivityAt).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
          {projects && projects.length > 5 && (
            <Link
              href="/home"
              className="block text-center text-xs text-muted-foreground hover:text-foreground mt-3 transition-colors"
            >
              View all {projects.length} projects
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
