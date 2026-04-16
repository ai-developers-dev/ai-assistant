"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSpecialtyLabel } from "@/lib/agents/specialties";
import { cn } from "@/lib/utils";
import {
  X,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Settings,
  Pencil,
  Save,
  ChevronDown,
  ChevronRight,
  Wrench,
  FileText,
} from "lucide-react";
import Link from "next/link";

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  idle: { color: "bg-emerald-500", label: "Idle" },
  working: { color: "bg-amber-500 animate-pulse", label: "Working" },
  waiting: { color: "bg-blue-500", label: "Waiting" },
  error: { color: "bg-red-500", label: "Error" },
};

// Map agent names to their allowed tools for display
const AGENT_TOOLS: Record<string, string[]> = {
  "Scraping Agent": ["get_campaign_summary", "get_city_campaign_progress", "mark_city_status", "google_places_search"],
  "Research Agent": ["get_businesses_by_status", "enrich_business", "score_business_leads"],
  "Cold Email Agent": ["get_email_ready_businesses", "send_direct_email", "log_decision"],
  "Meta Outreach Agent": ["get_businesses_by_status", "meta_friend_request"],
  "LinkedIn Outreach Agent": ["get_businesses_by_status", "linkedin_connect"],
  "Social Presence Agent": ["find_social_groups", "post_to_reddit", "post_to_meta_group", "find_youtube_videos", "post_youtube_comment", "find_quora_questions", "find_nextdoor_communities"],
  "Marketing Manager": ["get_campaign_summary"],
};

// Map agent names to their pipeline step number
const AGENT_STEP: Record<string, number> = {
  "Scraping Agent": 1,
  "Research Agent": 2,
  "Cold Email Agent": 3,
  "Meta Outreach Agent": 4,
  "LinkedIn Outreach Agent": 5,
  "Social Presence Agent": 6,
  "Marketing Manager": 7,
};

interface AgentDetailPanelProps {
  agent: Doc<"teamAgents">;
  agentTeamId: Id<"agentTeams">;
  onClose: () => void;
}

export function AgentDetailPanel({
  agent,
  agentTeamId,
  onClose,
}: AgentDetailPanelProps) {
  const communications = useQuery(api.agentCommunications.listByAgent, {
    agentTeamId,
    agentId: agent._id,
    limit: 20,
  });

  const updateAgent = useMutation(api.teamAgents.update);

  const [editing, setEditing] = useState(false);
  const [editPrompt, setEditPrompt] = useState(agent.customPrompt || "");
  const [saving, setSaving] = useState(false);
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(true);

  const statusConfig = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;
  const tools = AGENT_TOOLS[agent.name] || [];
  const stepNum = AGENT_STEP[agent.name];

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAgent({ agentId: agent._id, customPrompt: editPrompt });
      setEditing(false);
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg z-50 bg-background border-l border-border shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{agent.name}</h2>
            {stepNum && (
              <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                Step {stepNum}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-[10px] capitalize">
              {getSpecialtyLabel(agent.specialty)}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {agent.modelId.split("/").pop()}
            </Badge>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Status */}
        <div className="px-6 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", statusConfig.color)} />
            <span className="text-sm font-medium">{statusConfig.label}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              Profile: <span className="capitalize text-foreground">{agent.toolProfile}</span>
            </span>
          </div>
          {agent.currentTask && agent.status !== "idle" && (
            <p className="text-sm text-muted-foreground mt-2 italic">
              {agent.currentTask}
            </p>
          )}
          {agent.lastActiveAt && (
            <p className="text-xs text-muted-foreground/60 mt-1">
              Last active: {new Date(agent.lastActiveAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Tools */}
        {tools.length > 0 && (
          <div className="px-6 py-3 border-b border-border">
            <div className="flex items-center gap-1.5 mb-2">
              <Wrench className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tools</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {tools.map((t) => (
                <Badge key={t} variant="outline" className="text-[10px] font-mono bg-muted/30">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Duty / Script */}
        <div className="px-6 py-3 border-b border-border">
          <button
            onClick={() => setScriptExpanded(!scriptExpanded)}
            className="flex items-center gap-1.5 w-full text-left mb-2"
          >
            <FileText className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Agent Script / Duties
            </span>
            <span className="ml-auto">
              {scriptExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            </span>
          </button>

          {scriptExpanded && (
            <>
              {editing ? (
                <div className="space-y-2">
                  <textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    className="w-full h-64 text-xs font-mono bg-muted/30 border border-border rounded-lg p-3 resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Enter agent instructions..."
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => { setEditing(false); setEditPrompt(agent.customPrompt || ""); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      <Save className="h-3 w-3" />
                      {saving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="relative group">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted/20 border border-border rounded-lg p-3 max-h-64 overflow-y-auto font-mono">
                    {agent.customPrompt || "No script defined."}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2 h-6 text-[10px] gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => { setEditPrompt(agent.customPrompt || ""); setEditing(true); }}
                  >
                    <Pencil className="h-2.5 w-2.5" />
                    Edit
                  </Button>
                </div>
              )}
            </>
          )}

          {!scriptExpanded && agent.customPrompt && (
            <p className="text-[10px] text-muted-foreground/60 line-clamp-2 mt-1">
              {agent.customPrompt.slice(0, 150)}...
            </p>
          )}
        </div>

        {/* Settings link */}
        <div className="px-6 py-2 border-b border-border">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Settings className="h-3 w-3" />
            Full Settings (model, specialty, hierarchy)
          </Link>
        </div>

        {/* Recent Activity */}
        <div className="px-6 py-3">
          <button
            onClick={() => setActivityExpanded(!activityExpanded)}
            className="flex items-center gap-1.5 w-full text-left mb-3"
          >
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Recent Activity
            </span>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-1">
              {communications?.length ?? 0}
            </Badge>
            <span className="ml-auto">
              {activityExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            </span>
          </button>

          {activityExpanded && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {communications === undefined ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : communications.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No activity yet for this agent.
                </p>
              ) : (
                communications.map((comm: any) => {
                  const isDelegation = comm.messageType === "delegation";
                  const isResult = comm.messageType === "result";
                  const isError = comm.messageType === "error";

                  return (
                    <div
                      key={comm._id}
                      className={cn(
                        "rounded-lg border p-3 text-xs",
                        isDelegation && "border-blue-500/20 bg-blue-500/5",
                        isResult && "border-emerald-500/20 bg-emerald-500/5",
                        isError && "border-red-500/20 bg-red-500/5",
                        !isDelegation &&
                          !isResult &&
                          !isError &&
                          "border-border bg-muted/20"
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        {isResult ? (
                          <CheckCircle className="h-3 w-3 text-emerald-700" />
                        ) : isError ? (
                          <AlertCircle className="h-3 w-3 text-red-600" />
                        ) : (
                          <ArrowRight className="h-3 w-3 text-blue-700" />
                        )}
                        <span className="font-medium">{comm.fromName}</span>
                        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50" />
                        <span className="font-medium">{comm.toName}</span>
                        <span className="text-muted-foreground/50 ml-auto">
                          {new Date(comm._creationTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-muted-foreground line-clamp-3">
                        {comm.content}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
