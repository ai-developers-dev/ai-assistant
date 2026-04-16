"use client";

import { useQuery, useMutation } from "convex/react";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ModelSelector } from "@/components/chat/model-selector";
import { SubAgentEditor } from "./sub-agent-editor";
import { AGENT_SPECIALTIES, getSpecialtyLabel } from "@/lib/agents/specialties";
import { DEFAULT_SWARM_CONFIG, SWARM_PRESETS } from "@/lib/agents/default-swarm";
import { cn } from "@/lib/utils";
import {
  Bot,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Sparkles,
  Search,
  Code,
  Image,
  Globe,
  BarChart,
  FileText,
  CheckSquare,
  Zap,
  Video,
  Presentation,
  Lock,
  Target,
  TrendingUp,
  Share2,
  Megaphone,
  Headphones,
  Linkedin,
  Mail,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";

// Recommended model per lead gen agent name — must match AGENT_ROLES in scheduled/page.tsx
const LEAD_GEN_AGENT_MODELS: Record<string, string> = {
  "Nexus":                   "anthropic/claude-haiku-4.5",
  "Marketing Manager":       "openai/gpt-4o",
  "Scraping Agent":          "anthropic/claude-haiku-4.5",
  "Meta Outreach Agent":     "openai/gpt-4o",
  "LinkedIn Outreach Agent": "openai/gpt-4o",
  "Cold Email Agent":        "anthropic/claude-haiku-4.5",
  "Prompt Engineer":         "openai/gpt-4.1",
};

// Human-readable labels for model IDs (OpenRouter format + legacy)
const MODEL_LABELS: Record<string, string> = {
  "anthropic/claude-haiku-4.5":          "Claude Haiku 4.5",
  "anthropic/claude-sonnet-4":           "Claude Sonnet 4",
  "anthropic/claude-opus-4":             "Claude Opus 4",
  "openai/gpt-4o":                       "GPT-4o",
  "openai/gpt-4o-mini":                  "GPT-4o Mini",
  "openai/gpt-4.1":                      "GPT-4.1",
  "google/gemini-2.5-flash":             "Gemini 2.5 Flash",
  "google/gemini-2.5-flash-lite":        "Gemini Flash Lite",
  "deepseek/deepseek-chat-v3-0324":      "DeepSeek V3",
  "deepseek/deepseek-r1":                "DeepSeek R1",
  "meta-llama/llama-3.3-70b-instruct":   "Llama 3.3 70B",
  "mistralai/mistral-medium-3":          "Mistral Medium 3",
  // Legacy IDs (before OpenRouter-style migration)
  "claude-sonnet-4-6":                   "Claude Sonnet (legacy — update)",
  "claude-haiku-4-5-20241022":           "Claude Haiku (legacy — update)",
  "claude-opus-4-20250514":              "Claude Opus (legacy — update)",
  "claude-sonnet-4-20250514":            "Claude Sonnet (legacy — update)",
  "gpt-4o":                              "GPT-4o (legacy — update)",
  "gpt-4o-mini":                         "GPT-4o Mini (legacy — update)",
  "gemini-2.5-flash":                    "Gemini Flash (legacy — update)",
};

function getModelLabel(modelId: string): string {
  return MODEL_LABELS[modelId] ?? modelId.split("/").pop() ?? modelId;
}

function isLegacyModelId(modelId: string): boolean {
  // OpenRouter-format IDs contain a slash: "provider/model-name"
  return !modelId.includes("/");
}

const ICON_MAP: Record<string, any> = {
  Search,
  Code,
  Image,
  Globe,
  BarChart,
  FileText,
  CheckSquare,
  Zap,
  Video,
  Presentation,
  Sparkles,
  Bot,
  Target,
  TrendingUp,
  Share2,
  Megaphone,
  Headphones,
  Linkedin,
  Mail,
};

const AVATAR_ICONS = [
  "Bot", "Sparkles", "Zap", "Globe", "Code", "Search",
  "FileText", "BarChart", "Video", "Presentation", "Image",
];

export function AgentTeamSettings() {
  const { org } = useEffectiveOrg();

  const team = useQuery(
    api.agentTeams.getByOrganizationForSettings,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const subAgents = useQuery(
    api.teamAgents.listByTeam,
    team?._id ? { agentTeamId: team._id } : "skip"
  );

  const scheduledTasks = useQuery(
    api.scheduledTaskRunner.listByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const createTeam = useMutation(api.agentTeams.create);
  const updateTeam = useMutation(api.agentTeams.update);
  const removeAgent = useMutation(api.teamAgents.remove);
  const updateAgent = useMutation(api.teamAgents.update);
  const createAgent = useMutation(api.teamAgents.create);
  const ensurePromptEngineer = useMutation(api.agentTeams.ensurePromptEngineer);

  // Auto-heal: ensure Prompt Engineer exists whenever a team is loaded
  const healedTeamId = useRef<string | null>(null);
  useEffect(() => {
    if (!team || !org?._id) return;
    if (subAgents === undefined) return; // still loading
    if (healedTeamId.current === team._id) return; // already healed this team
    const hasPromptEngineer = subAgents.some((a) => a.specialty === "prompt_engineer");
    if (!hasPromptEngineer) {
      healedTeamId.current = team._id;
      ensurePromptEngineer({ organizationId: org._id, modelId: team.modelId });
    } else {
      healedTeamId.current = team._id;
    }
  }, [team, org, subAgents, ensurePromptEngineer]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState("Bot");
  const [modelId, setModelId] = useState("deepseek/deepseek-chat-v3-0324");
  const [personality, setPersonality] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Compute target models: prefer task's saved agentModels, fall back to LEAD_GEN_AGENT_MODELS
  const leadGenTask = (scheduledTasks ?? []).find(
    (t: any) => t.agentConfig?.agentType === "lead_gen_agent"
  ) as any;
  const taskAgentModels: Record<string, string> = leadGenTask?.campaignConfig?.agentModels ?? {};

  // Map agent NAME → target modelId using task config first, then LEAD_GEN_AGENT_MODELS defaults
  function getTargetModel(agentName: string): string {
    // Task config uses keys like "marketingManager", "scrapingAgent" etc.
    // Build reverse name→key map
    const nameToKey: Record<string, string> = {
      "Nexus": "nexus",
      "Marketing Manager": "marketingManager",
      "Scraping Agent": "scrapingAgent",
      "Meta Outreach Agent": "metaOutreach",
      "LinkedIn Outreach Agent": "linkedinOutreach",
      "Cold Email Agent": "coldEmail",
      "Prompt Engineer": "promptEngineer",
    };
    const key = nameToKey[agentName];
    return (key && taskAgentModels[key]) || LEAD_GEN_AGENT_MODELS[agentName] || "";
  }

  // Identify agents with outdated or mismatched model IDs
  const allAgentsForSync = [...(subAgents ?? [])];
  if (team) allAgentsForSync; // include main team model check too
  const mismatchedAgents = allAgentsForSync.filter((agent) => {
    const target = getTargetModel(agent.name);
    if (!target) return false; // not a lead gen agent we manage
    return agent.modelId !== target;
  });
  const hasLegacyModels = allAgentsForSync.some((a) => isLegacyModelId(a.modelId));

  const handleSyncModels = async () => {
    if (!mismatchedAgents.length || syncing) return;
    setSyncing(true);
    try {
      await Promise.all(
        mismatchedAgents.map((agent) =>
          updateAgent({ agentId: agent._id, modelId: getTargetModel(agent.name) })
        )
      );
      // Also sync team (Nexus) model if it's mismatched
      if (team && isLegacyModelId(team.modelId)) {
        await updateTeam({ teamId: team._id, modelId: taskAgentModels["nexus"] ?? LEAD_GEN_AGENT_MODELS["Nexus"] });
      }
    } catch (err) {
      console.error("Failed to sync models:", err);
    } finally {
      setSyncing(false);
    }
  };

  // Initialize form state from team data
  if (team && !initialized) {
    setName(team.name);
    setDescription(team.description || "");
    setAvatar(team.avatar || "Bot");
    setModelId(team.modelId);
    setPersonality(team.personality || "");
    setInitialized(true);
  }

  const handleSave = useCallback(async () => {
    if (!org?._id || !name.trim()) return;
    setSaving(true);
    try {
      if (team) {
        await updateTeam({
          teamId: team._id,
          name: name.trim(),
          description: description.trim() || undefined,
          avatar,
          modelId,
          personality: personality.trim() || undefined,
        });
      } else {
        await createTeam({
          organizationId: org._id,
          name: name.trim(),
          description: description.trim() || undefined,
          avatar,
          modelId,
          personality: personality.trim() || undefined,
        });
      }
    } catch (err) {
      console.error("Failed to save team:", err);
    } finally {
      setSaving(false);
    }
  }, [org, team, name, description, avatar, modelId, personality, createTeam, updateTeam]);

  const handleDelete = useCallback(async (agentId: Id<"teamAgents">) => {
    try {
      await removeAgent({ agentId });
    } catch (err) {
      console.error("Failed to delete agent:", err);
    }
  }, [removeAgent]);

  const handleToggleEnabled = useCallback(async (agentId: Id<"teamAgents">, isEnabled: boolean) => {
    try {
      await updateAgent({ agentId, isEnabled: !isEnabled });
    } catch (err) {
      console.error("Failed to toggle agent:", err);
    }
  }, [updateAgent]);

  const handleQuickSetup = useCallback(async (presetKey: string) => {
    if (!org?._id || saving) return;
    setSaving(true);
    try {
      const preset = SWARM_PRESETS[presetKey];
      if (!preset) return;

      const main = DEFAULT_SWARM_CONFIG.mainAgent;
      const teamId = await createTeam({
        organizationId: org._id,
        name: main.name,
        description: main.description,
        avatar: main.avatar,
        modelId: main.modelId,
        personality: main.personality,
      });

      for (let i = 0; i < preset.agents.length; i++) {
        const agent = preset.agents[i];
        const defaultAgent = DEFAULT_SWARM_CONFIG.subAgents.find(
          (d) => d.specialty === agent.specialty
        );
        await createAgent({
          organizationId: org._id,
          agentTeamId: teamId,
          name: agent.name,
          specialty: agent.specialty,
          modelId: defaultAgent?.modelId ?? main.modelId,
          toolProfile: defaultAgent?.toolProfile ?? "standard",
          isEnabled: true,
        });
      }

      setName(main.name);
      setDescription(main.description);
      setAvatar(main.avatar);
      setModelId(main.modelId);
      setPersonality(main.personality);
      setInitialized(true);
    } catch (err) {
      console.error("Failed quick setup:", err);
    } finally {
      setSaving(false);
    }
  }, [org, saving, createTeam, createAgent]);

  const SelectedAvatarIcon = ICON_MAP[avatar] || Bot;
  const hasByok = !!org?.providerKeys?.openrouter;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Bot className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Swarm Agents</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Configure your Swarm Leader and team of specialists. The leader orchestrates all tasks by delegating to sub-agents.
      </p>

      {/* Quick Setup Presets (shown when no team exists) */}
      {!team && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Quick Setup
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Object.entries(SWARM_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => handleQuickSetup(key)}
                disabled={saving}
                className={cn(
                  "rounded-lg border border-border p-4 text-left transition-all",
                  "hover:border-primary/40 hover:bg-primary/5",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <h4 className="text-sm font-semibold">{preset.label}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {preset.description}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {preset.agents.map((a) => (
                    <Badge key={a.name} variant="secondary" className="text-[9px]">
                      {a.name}
                    </Badge>
                  ))}
                </div>
              </button>
            ))}
          </div>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or configure manually</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Agent Config */}
      <div className="space-y-4 mb-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {team ? "Main Agent" : "Manual Setup"}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Atlas, Jarvis, Nova"
              maxLength={30}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Model</label>
            <ModelSelector
              value={modelId}
              onChange={setModelId}
              plan={org?.plan || "free"}
              hasByok={hasByok}
            />
          </div>
        </div>

        {/* Avatar picker */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">Avatar</label>
          <div className="flex flex-wrap gap-2">
            {AVATAR_ICONS.map((iconName) => {
              const Icon = ICON_MAP[iconName] || Bot;
              return (
                <button
                  key={iconName}
                  onClick={() => setAvatar(iconName)}
                  className={cn(
                    "h-10 w-10 rounded-lg border flex items-center justify-center transition-all",
                    avatar === iconName
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">
            Personality <span className="text-muted-foreground text-xs">(optional)</span>
          </label>
          <textarea
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            placeholder="Custom personality traits, tone, or behavior guidelines..."
            rows={2}
            maxLength={500}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">
            Description <span className="text-muted-foreground text-xs">(optional)</span>
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description of your lead agent"
            maxLength={200}
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={!name.trim() || saving}
        >
          {saving ? "Saving..." : team ? "Update Main Agent" : "Create Team"}
        </Button>
      </div>

      {/* Sub-Agents Section */}
      {team && (
        <>
          <div className="border-t border-border pt-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Sub-Agents ({subAgents?.filter((a) => !a.isHidden && a.specialty !== "prompt_engineer").length ?? 0}/8)
              </h3>
              <div className="flex items-center gap-2">
                {mismatchedAgents.length > 0 && (
                  <button
                    onClick={handleSyncModels}
                    disabled={syncing}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/10 border border-amber-500/30 text-amber-700 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
                    {syncing ? "Syncing..." : `Sync Models (${mismatchedAgents.length} outdated)`}
                  </button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingAgent(null);
                    setShowEditor(true);
                  }}
                  disabled={(subAgents?.filter((a) => !a.isHidden && a.specialty !== "prompt_engineer").length ?? 0) >= 8}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Agent
                </Button>
              </div>
            </div>

            {/* Outdated model warning banner */}
            {(mismatchedAgents.length > 0 || hasLegacyModels) && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 mb-4">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-amber-700">
                    {mismatchedAgents.length} agent{mismatchedAgents.length !== 1 ? "s" : ""} using outdated models
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    These agents were created before per-agent model selection was added.
                    Click <span className="text-amber-700 font-medium">Sync Models</span> to apply the recommended models from your scheduled task configuration.
                  </p>
                </div>
              </div>
            )}

            {subAgents && subAgents.filter((a) => !a.isHidden && a.specialty !== "prompt_engineer").length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {subAgents.filter((a) => !a.isHidden && a.specialty !== "prompt_engineer").map((agent) => {
                  const specialty = AGENT_SPECIALTIES.find(
                    (s) => s.id === agent.specialty
                  );
                  const SpecialtyIcon = ICON_MAP[specialty?.icon || "Sparkles"] || Sparkles;

                  return (
                    <div
                      key={agent._id}
                      className={cn(
                        "rounded-lg border p-4 transition-all",
                        agent.isEnabled
                          ? "border-border bg-card/80"
                          : "border-border/50 bg-muted/20 opacity-60"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <SpecialtyIcon className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium text-sm truncate">
                            {agent.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleToggleEnabled(agent._id, agent.isEnabled)}
                            className={cn(
                              "h-5 w-10 rounded-full transition-all relative",
                              agent.isEnabled ? "bg-primary" : "bg-muted"
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                                agent.isEnabled ? "left-5" : "left-0.5"
                              )}
                            />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {getSpecialtyLabel(agent.specialty)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            isLegacyModelId(agent.modelId)
                              ? "border-amber-500/40 text-amber-700 bg-amber-500/10"
                              : "text-foreground"
                          )}
                        >
                          {getModelLabel(agent.modelId)}
                        </Badge>
                        {getTargetModel(agent.name) && agent.modelId !== getTargetModel(agent.name) && (
                          <span className="text-[9px] text-muted-foreground/60">
                            → {getModelLabel(getTargetModel(agent.name))}
                          </span>
                        )}
                      </div>

                      {/* Hierarchy summary */}
                      {(agent.reportsTo || (agent.minCollaboration && agent.minCollaboration.length > 0)) && (
                        <div className="mt-2 space-y-1">
                          {agent.reportsTo && (() => {
                            const manager = subAgents?.find((a) => a._id === agent.reportsTo);
                            return manager ? (
                              <p className="text-[10px] text-muted-foreground">
                                ↑ Reports to <span className="text-foreground font-medium">{manager.name}</span>
                              </p>
                            ) : null;
                          })()}
                          {agent.minCollaboration && agent.minCollaboration.length > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              ⟷ Collaborates with{" "}
                              <span className="text-foreground font-medium">
                                {agent.minCollaboration
                                  .map((id: string) => subAgents?.find((a) => a._id === id)?.name)
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1 mt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setEditingAgent(agent);
                            setShowEditor(true);
                          }}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleDelete(agent._id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No sub-agents yet. Add specialists to your team.
              </div>
            )}

          </div>

          {/* System Agents Section */}
          {subAgents && subAgents.some((a) => a.isHidden || a.specialty === "prompt_engineer") && (
            <div className="border-t border-border pt-6 mt-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  System Agents
                </h3>
                <Badge variant="secondary" className="text-[10px]">Hidden from swarm</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                System agents assist your team behind the scenes. They are not shown in the agents page or swarm visualization.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {subAgents.filter((a) => a.isHidden || a.specialty === "prompt_engineer").map((agent) => {
                  const specialty = AGENT_SPECIALTIES.find((s) => s.id === agent.specialty);
                  const SpecialtyIcon = ICON_MAP[specialty?.icon || "Sparkles"] || Sparkles;
                  const reportsToAgent = agent.reportsTo
                    ? subAgents.find((a) => a._id === agent.reportsTo)
                    : null;
                  const collaborators = agent.minCollaboration
                    ? subAgents.filter((a) => (agent.minCollaboration as string[]).includes(a._id))
                    : [];
                  return (
                    <div key={agent._id} className="rounded-lg border border-border/60 bg-muted/10 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <SpecialtyIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm truncate">{agent.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px] capitalize mb-3">
                        {getSpecialtyLabel(agent.specialty)}
                      </Badge>
                      {reportsToAgent && (
                        <p className="text-[11px] text-muted-foreground mb-1">
                          ↑ Reports to <span className="font-medium text-foreground">{reportsToAgent.name}</span>
                        </p>
                      )}
                      {collaborators.length > 0 && (
                        <p className="text-[11px] text-muted-foreground mb-3">
                          ⟷ Collaborates with <span className="font-medium text-foreground">{collaborators.map((c) => c.name).join(", ")}</span>
                        </p>
                      )}
                      <div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setEditingAgent(agent);
                            setShowEditor(true);
                          }}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Edit Prompt
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Skills Section (Coming Soon) */}
          <div className="border-t border-border pt-6 mt-6">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Skills
              </h3>
              <Badge variant="secondary" className="text-[10px]">
                Coming Soon
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Assign custom skills to each agent for specialized capabilities.
            </p>
            <div className="mt-3 rounded-lg border border-dashed border-border/50 bg-muted/10 p-6 text-center">
              <Lock className="h-6 w-6 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-xs text-muted-foreground/50">
                Custom skills will let you define reusable tool configurations, prompt templates, and workflow automations per agent.
              </p>
            </div>
          </div>
        </>
      )}

      {/* Sub-Agent Editor Dialog */}
      {showEditor && team && org && (
        <SubAgentEditor
          organizationId={org._id}
          agentTeamId={team._id}
          agent={editingAgent}
          allAgents={subAgents ?? []}
          plan={org.plan || "free"}
          hasByok={hasByok}
          onClose={() => {
            setShowEditor(false);
            setEditingAgent(null);
          }}
        />
      )}
    </div>
  );
}
