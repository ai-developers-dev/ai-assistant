"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ModelSelector } from "@/components/chat/model-selector";
import { AGENT_SPECIALTIES, getSpecialty } from "@/lib/agents/specialties";
import { cn } from "@/lib/utils";
import { X, Eye, EyeOff, Check, Loader2, AlertTriangle } from "lucide-react";
import { useState, useCallback, useEffect } from "react";

const TOOL_PROFILES = [
  { id: "minimal", label: "Minimal", description: "Basic tools only" },
  { id: "standard", label: "Standard", description: "Web search + common tools" },
  { id: "research", label: "Research", description: "Deep search + memory" },
  { id: "automation", label: "Automation", description: "Browser + code execution" },
  { id: "full", label: "Full", description: "All tools including delegation" },
];

// Which provider keys each specialty requires
const SPECIALTY_REQUIRED_KEYS: Record<
  string,
  Array<{ provider: string; label: string; placeholder: string }>
> = {
  prospecting: [
    { provider: "google_custom_search", label: "Google API Key", placeholder: "AIza..." },
    { provider: "google_search_engine_id", label: "Search Engine ID", placeholder: "cx:..." },
  ],
  meta_prospecting: [
    { provider: "meta", label: "Meta Access Token", placeholder: "EAA..." },
  ],
  linkedin_prospecting: [
    { provider: "linkedin", label: "LinkedIn Access Token", placeholder: "Access Token" },
  ],
  cold_email: [
    { provider: "instantly", label: "Instantly.ai API Key", placeholder: "API Key" },
  ],
};

interface SubAgentEditorProps {
  organizationId: Id<"organizations">;
  agentTeamId: Id<"agentTeams">;
  agent?: any; // Existing agent to edit, or null for new
  allAgents?: any[]; // All agents in the team (for reporting selectors)
  plan: string;
  hasByok: boolean;
  onClose: () => void;
}

export function SubAgentEditor({
  organizationId,
  agentTeamId,
  agent,
  allAgents = [],
  plan,
  hasByok,
  onClose,
}: SubAgentEditorProps) {
  const createAgent = useMutation(api.teamAgents.create);
  const updateAgent = useMutation(api.teamAgents.update);

  const [name, setName] = useState(agent?.name ?? "");
  const [specialty, setSpecialty] = useState(agent?.specialty ?? "general");
  const [modelId, setModelId] = useState(agent?.modelId ?? "deepseek/deepseek-chat-v3-0324");
  const [toolProfile, setToolProfile] = useState(agent?.toolProfile ?? "standard");
  const [customPrompt, setCustomPrompt] = useState(agent?.customPrompt ?? "");
  const [isEnabled, setIsEnabled] = useState(agent?.isEnabled ?? true);
  const [saving, setSaving] = useState(false);

  // Peers = all agents except this one (for dropdowns)
  const peers = allAgents.filter((a) => a._id !== agent?._id);

  // Auto-infer hierarchy defaults for new agents from existing team structure
  const inferDefaults = () => {
    if (agent) {
      // Editing existing agent — use saved values
      return {
        reportsTo: agent.reportsTo ?? "",
        minCollaboration: agent.minCollaboration ?? [],
      };
    }
    // New agent — infer from team
    const manager = peers.find((a) => a.specialty === "marketing" && !a.isHidden);
    const scraper = peers.find((a) => a.specialty === "lead_gen_agent" || a.name === "Scraping Agent");
    const inferredReportsTo = manager?._id ?? "";
    const outreachSpecialties = new Set(["meta_prospecting", "linkedin_prospecting", "cold_email", "marketing"]);
    let inferredCollab: string[] = [];
    if (manager) inferredCollab.push(manager._id);
    if (scraper && outreachSpecialties.has("general")) inferredCollab.push(scraper._id); // refined on specialty change
    return { reportsTo: inferredReportsTo, minCollaboration: inferredCollab };
  };

  const [reportsTo, setReportsTo] = useState<string>(() => inferDefaults().reportsTo);
  const [minCollaboration, setMinCollaboration] = useState<string[]>(() => inferDefaults().minCollaboration);

  // Re-infer minCollaboration when specialty changes for new agents
  useEffect(() => {
    if (agent) return; // don't override existing agent settings
    const manager = peers.find((a) => a.specialty === "marketing" && !a.isHidden);
    const scraper = peers.find((a) => a.specialty === "lead_gen_agent" || a.name === "Scraping Agent");
    const outreachSpecialties = new Set(["meta_prospecting", "linkedin_prospecting", "cold_email", "marketing"]);
    const collab: string[] = [];
    if (manager) collab.push(manager._id);
    if (scraper && outreachSpecialties.has(specialty)) collab.push(scraper._id);
    setMinCollaboration(collab);
    if (manager && !reportsTo) setReportsTo(manager._id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialty]);

  // API key states for prospecting specialties
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [apiKeyVisibility, setApiKeyVisibility] = useState<Record<string, boolean>>({});
  const [apiKeySaving, setApiKeySaving] = useState<Record<string, boolean>>({});
  const [apiKeyStatuses, setApiKeyStatuses] = useState<Record<string, "connected" | "error" | null>>({});
  const [apiKeyErrors, setApiKeyErrors] = useState<Record<string, string>>({});

  // Fetch connection status for required providers when specialty changes
  useEffect(() => {
    const requiredKeys = SPECIALTY_REQUIRED_KEYS[specialty];
    if (!requiredKeys || !organizationId) return;

    const fetchStatuses = async () => {
      try {
        const res = await fetch(`/api/provider-keys?organizationId=${organizationId}`);
        const data = await res.json();
        if (data.providers) {
          const statuses: Record<string, "connected" | "error" | null> = {};
          for (const req of requiredKeys) {
            const found = data.providers.find((p: any) => p.provider === req.provider);
            statuses[req.provider] = found?.connected ? "connected" : null;
          }
          setApiKeyStatuses(statuses);
        }
      } catch {
        // Silent fail
      }
    };
    fetchStatuses();
  }, [specialty, organizationId]);

  const handleSaveApiKey = useCallback(async (provider: string) => {
    const key = apiKeyInputs[provider]?.trim();
    if (!key) return;

    setApiKeySaving((prev) => ({ ...prev, [provider]: true }));
    setApiKeyErrors((prev) => ({ ...prev, [provider]: "" }));

    try {
      // Test the key first
      const testRes = await fetch("/api/provider-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: key }),
      });
      const testData = await testRes.json();

      if (!testData.valid) {
        setApiKeyErrors((prev) => ({ ...prev, [provider]: testData.error || "Invalid key" }));
        setApiKeySaving((prev) => ({ ...prev, [provider]: false }));
        return;
      }

      // Save the key
      const res = await fetch("/api/provider-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: key, organizationId }),
      });
      const data = await res.json();

      if (data.success) {
        setApiKeyStatuses((prev) => ({ ...prev, [provider]: "connected" }));
        setApiKeyInputs((prev) => ({ ...prev, [provider]: "" }));
        setApiKeyVisibility((prev) => ({ ...prev, [provider]: false }));
      } else {
        setApiKeyErrors((prev) => ({ ...prev, [provider]: data.error || "Failed to save" }));
      }
    } catch (err: any) {
      setApiKeyErrors((prev) => ({ ...prev, [provider]: err.message || "Failed to save key" }));
    } finally {
      setApiKeySaving((prev) => ({ ...prev, [provider]: false }));
    }
  }, [apiKeyInputs, organizationId]);

  // Auto-update tool profile when specialty changes (only for new agents)
  useEffect(() => {
    if (!agent) {
      const spec = getSpecialty(specialty);
      if (spec) {
        setToolProfile(spec.defaultProfile);
      }
    }
  }, [specialty, agent]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (agent) {
        await updateAgent({
          agentId: agent._id,
          name: name.trim(),
          specialty,
          modelId,
          toolProfile,
          customPrompt: customPrompt.trim() || undefined,
          isEnabled,
          reportsTo: (reportsTo as any) || undefined,
          minCollaboration: minCollaboration.length > 0 ? (minCollaboration as any) : undefined,
        });
      } else {
        await createAgent({
          organizationId,
          agentTeamId,
          name: name.trim(),
          specialty,
          modelId,
          toolProfile,
          customPrompt: customPrompt.trim() || undefined,
          isEnabled,
          reportsTo: (reportsTo as any) || undefined,
          minCollaboration: minCollaboration.length > 0 ? (minCollaboration as any) : undefined,
        });
      }
      onClose();
    } catch (err) {
      console.error("Failed to save agent:", err);
    } finally {
      setSaving(false);
    }
  }, [
    agent, name, specialty, modelId, toolProfile, customPrompt, isEnabled,
    reportsTo, minCollaboration,
    organizationId, agentTeamId, createAgent, updateAgent, onClose,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-lg mx-4 rounded-xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">
            {agent ? "Edit Sub-Agent" : "Add Sub-Agent"}
          </h3>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pixel, Scribe, WebDev"
              maxLength={30}
              autoFocus
            />
          </div>

          {/* Specialty */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Specialty</label>
            <select
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {AGENT_SPECIALTIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} — {s.description}
                </option>
              ))}
            </select>
          </div>

          {/* Required API Keys (shown for prospecting/email specialties) */}
          {SPECIALTY_REQUIRED_KEYS[specialty] && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700 font-medium">
                  This agent requires API keys to function
                </p>
              </div>

              {SPECIALTY_REQUIRED_KEYS[specialty].map((keyConfig) => {
                const status = apiKeyStatuses[keyConfig.provider];
                const isSaving = apiKeySaving[keyConfig.provider];
                const error = apiKeyErrors[keyConfig.provider];
                const isVisible = apiKeyVisibility[keyConfig.provider];

                return (
                  <div key={keyConfig.provider} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium">{keyConfig.label}</label>
                      {status === "connected" && (
                        <Badge variant="secondary" className="text-[10px] gap-1 text-emerald-700">
                          <Check className="h-2.5 w-2.5" />
                          Connected
                        </Badge>
                      )}
                    </div>

                    {status === "connected" ? (
                      <p className="text-xs text-muted-foreground">
                        Key is saved and active. You can update it in Settings &gt; Connected Providers.
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Input
                              type={isVisible ? "text" : "password"}
                              placeholder={keyConfig.placeholder}
                              value={apiKeyInputs[keyConfig.provider] || ""}
                              onChange={(e) =>
                                setApiKeyInputs((prev) => ({
                                  ...prev,
                                  [keyConfig.provider]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveApiKey(keyConfig.provider);
                              }}
                              className="pr-9 text-xs h-8"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setApiKeyVisibility((prev) => ({
                                  ...prev,
                                  [keyConfig.provider]: !prev[keyConfig.provider],
                                }))
                              }
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {isVisible ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => handleSaveApiKey(keyConfig.provider)}
                            disabled={!apiKeyInputs[keyConfig.provider]?.trim() || isSaving}
                          >
                            {isSaving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-3 w-3 mr-1" />
                                Save
                              </>
                            )}
                          </Button>
                        </div>
                        {error && (
                          <p className="text-xs text-destructive">{error}</p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Model */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Model</label>
            <ModelSelector
              value={modelId}
              onChange={setModelId}
              plan={plan}
              hasByok={hasByok}
            />
          </div>

          {/* Tool Profile */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Tool Profile</label>
            <select
              value={toolProfile}
              onChange={(e) => setToolProfile(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {TOOL_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.description}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Instructions */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Custom Instructions{" "}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Additional instructions or context for this agent..."
              rows={3}
              maxLength={1000}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Enabled Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Enabled</label>
            <button
              onClick={() => setIsEnabled(!isEnabled)}
              className={cn(
                "h-6 w-11 rounded-full transition-all relative",
                isEnabled ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                  isEnabled ? "left-5.5" : "left-0.5"
                )}
              />
            </button>
          </div>

          {/* Hierarchy (only shown when other agents exist) */}
          {peers.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hierarchy</p>

              {/* Reports To */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Reports to</label>
                <select
                  value={reportsTo}
                  onChange={(e) => setReportsTo(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">— None (reports to main agent) —</option>
                  {peers.map((a) => (
                    <option key={a._id} value={a._id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Min Collaboration */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Min collaboration{" "}
                  <span className="text-muted-foreground text-xs">(must consult when working)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {peers.map((a) => {
                    const selected = minCollaboration.includes(a._id);
                    return (
                      <button
                        key={a._id}
                        type="button"
                        onClick={() =>
                          setMinCollaboration((prev) =>
                            selected ? prev.filter((id) => id !== a._id) : [...prev, a._id]
                          )
                        }
                        className={cn(
                          "rounded-full px-3 py-1 text-xs border transition-all",
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-border hover:text-foreground"
                        )}
                      >
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? "Saving..." : agent ? "Update" : "Add Agent"}
          </Button>
        </div>
      </div>
    </div>
  );
}
