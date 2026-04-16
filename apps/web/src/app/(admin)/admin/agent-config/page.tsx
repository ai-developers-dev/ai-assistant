"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { AGENT_REGISTRY, type AgentType } from "@/lib/agents/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Settings2,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Save,
  Eye,
} from "lucide-react";
import { useState, useMemo } from "react";

const AGENT_TYPES = Object.keys(AGENT_REGISTRY) as AgentType[];

function getStatusBadge(
  configs: any[] | null,
  agentType: string
): { label: string; className: string } {
  const config = configs?.find((c) => c.agentType === agentType);
  if (!config) return { label: "Default", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20" };
  if (!config.enabled) return { label: "Disabled", className: "bg-amber-500/15 text-amber-700 border-amber-500/20" };
  return { label: "Custom", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20" };
}

export default function AdminAgentConfigPage() {
  const { user } = useUser();

  const configs = useQuery(
    api.platformConfig.listAll,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  const upsertConfig = useMutation(api.platformConfig.upsert);
  const removeConfig = useMutation(api.platformConfig.remove);

  const [selectedAgent, setSelectedAgent] = useState<AgentType>("websites");
  const [buildCriteria, setBuildCriteria] = useState("");
  const [isOverride, setIsOverride] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Load selected agent's config when switching tabs
  const selectedConfig = useMemo(() => {
    return configs?.find((c) => c.agentType === selectedAgent) ?? null;
  }, [configs, selectedAgent]);

  const handleSelectAgent = (agentType: AgentType) => {
    setSelectedAgent(agentType);
    const config = configs?.find((c) => c.agentType === agentType);
    if (config) {
      setBuildCriteria(config.buildCriteria);
      setIsOverride(config.isOverride);
      setEnabled(config.enabled);
      setNotes(config.notes || "");
    } else {
      setBuildCriteria("");
      setIsOverride(false);
      setEnabled(true);
      setNotes("");
    }
    setShowPreview(false);
  };

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    if (!buildCriteria.trim()) {
      showFeedback("error", "Build criteria cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      await upsertConfig({
        clerkUserId: user.id,
        agentType: selectedAgent,
        buildCriteria: buildCriteria.trim(),
        isOverride,
        enabled,
        notes: notes.trim() || undefined,
      });
      showFeedback("success", `Config saved for "${AGENT_REGISTRY[selectedAgent].name}" agent.`);
    } catch (err: any) {
      showFeedback("error", err.message || "Failed to save config.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!user?.id) return;
    try {
      await removeConfig({ clerkUserId: user.id, agentType: selectedAgent });
      setBuildCriteria("");
      setIsOverride(false);
      setEnabled(true);
      setNotes("");
      showFeedback("success", `Config removed — "${AGENT_REGISTRY[selectedAgent].name}" will use the hardcoded default.`);
    } catch (err: any) {
      showFeedback("error", err.message || "Failed to reset config.");
    }
  };

  // Build effective prompt preview
  const effectivePrompt = useMemo(() => {
    const defaultPrompt = AGENT_REGISTRY[selectedAgent].systemPrompt;
    if (!buildCriteria.trim() || !enabled) return defaultPrompt;
    if (isOverride) return buildCriteria.trim();
    return `${defaultPrompt}\n\n## ADDITIONAL PLATFORM REQUIREMENTS\n${buildCriteria.trim()}`;
  }, [selectedAgent, buildCriteria, isOverride, enabled]);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent Config</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customize build criteria and system prompts per agent type. Changes apply platform-wide.
        </p>
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

      {/* Agent Type Tabs */}
      <div className="flex flex-wrap gap-2">
        {AGENT_TYPES.map((agentType) => {
          const agent = AGENT_REGISTRY[agentType];
          const status = getStatusBadge(configs ?? null, agentType);
          const isSelected = selectedAgent === agentType;

          return (
            <button
              key={agentType}
              onClick={() => handleSelectAgent(agentType)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                isSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/60 bg-card/80 text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              <span>{agent.name}</span>
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${status.className}`}>
                {status.label}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Config Editor */}
      <div className="rounded-xl border border-border/60 bg-card/80 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">
              {AGENT_REGISTRY[selectedAgent].name} Agent — Build Criteria
            </h3>
          </div>
          {selectedConfig && (
            <span className="text-[10px] text-muted-foreground">
              Last updated by {selectedConfig.updatedBy}
            </span>
          )}
        </div>

        {/* Build Criteria Textarea */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Build Criteria / Custom System Prompt
          </label>
          <textarea
            value={buildCriteria}
            onChange={(e) => setBuildCriteria(e.target.value)}
            rows={15}
            placeholder={`Enter custom build criteria for the ${AGENT_REGISTRY[selectedAgent].name} agent...\n\nExample: "Always include a Google Maps embed in the contact section."`}
            className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-y min-h-[200px]"
          />
        </div>

        {/* Mode Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">
              Mode
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setIsOverride(false)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  !isOverride
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                Append to default
              </button>
              <button
                onClick={() => setIsOverride(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  isOverride
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                Replace default entirely
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">
              Status
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm">Enabled</span>
            </label>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Notes (optional)
          </label>
          <Input
            placeholder="e.g. Added Google Maps requirement per client feedback"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || !buildCriteria.trim()}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Saving..." : "Save Config"}
          </Button>
          {selectedConfig && (
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset to Default
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => setShowPreview(!showPreview)}
            className="ml-auto"
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            {showPreview ? "Hide Preview" : "Show Effective Prompt"}
          </Button>
        </div>
      </div>

      {/* Effective Prompt Preview */}
      {showPreview && (
        <div className="rounded-xl border border-border/60 bg-card/80 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Effective Prompt Preview</h3>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-500/15 text-blue-700 border-blue-500/20">
              {!buildCriteria.trim() || !enabled ? "Default Only" : isOverride ? "Full Override" : "Default + Custom"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            This is exactly what the LLM will receive as its system prompt.
          </p>
          <pre className="whitespace-pre-wrap text-xs font-mono bg-muted/30 border border-border/40 rounded-lg p-4 max-h-[500px] overflow-y-auto">
            {effectivePrompt}
          </pre>
        </div>
      )}

      {configs === undefined && user?.id && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">Loading agent configs...</p>
        </div>
      )}
    </div>
  );
}
