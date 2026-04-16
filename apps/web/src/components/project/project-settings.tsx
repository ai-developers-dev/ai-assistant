"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  X,
  Heart,
  Brain,
  Loader2,
  Check,
  Trash2,
} from "lucide-react";

interface ProjectSettingsProps {
  projectId: Id<"projects">;
  onClose: () => void;
}

export function ProjectSettings({ projectId, onClose }: ProjectSettingsProps) {
  const project = useQuery(api.projects.getById, { projectId });
  const memories = useQuery(api.embeddings.listByProject, { projectId, limit: 20 });
  const updateProject = useMutation(api.projects.update);
  const deleteMemory = useMutation(api.embeddings.deleteMemory);

  // Local form state — populated from project data
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [activeStart, setActiveStart] = useState(9);
  const [activeEnd, setActiveEnd] = useState(17);
  const [checklist, setChecklist] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Hydrate form from project data
  useEffect(() => {
    if (!project?.agentConfig) return;
    const config = project.agentConfig as any;
    if (config.heartbeatEnabled !== undefined) setHeartbeatEnabled(config.heartbeatEnabled);
    if (config.heartbeatIntervalMinutes !== undefined) setIntervalMinutes(config.heartbeatIntervalMinutes);
    if (config.heartbeatChecklist !== undefined) setChecklist(config.heartbeatChecklist);
    if (config.heartbeatActiveHours) {
      setActiveStart(config.heartbeatActiveHours.start);
      setActiveEnd(config.heartbeatActiveHours.end);
    }
  }, [project]);

  const handleSave = async () => {
    if (!project) return;
    setSaving(true);
    try {
      const existingConfig = (project.agentConfig || {}) as any;
      await updateProject({
        projectId,
        agentConfig: {
          ...existingConfig,
          heartbeatEnabled,
          heartbeatIntervalMinutes: intervalMinutes,
          heartbeatChecklist: checklist,
          heartbeatActiveHours: {
            start: activeStart,
            end: activeEnd,
            timezone: "UTC",
          },
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="border-l border-border bg-background w-80 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm">Project Settings</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Heartbeat Section */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-red-600" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Heartbeat
            </h4>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm">Enable Heartbeat</label>
            <button
              type="button"
              role="switch"
              aria-checked={heartbeatEnabled}
              onClick={() => setHeartbeatEnabled(!heartbeatEnabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                heartbeatEnabled ? "bg-primary" : "bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  heartbeatEnabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {heartbeatEnabled && (
            <div className="space-y-3 pl-1">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Interval (minutes)</label>
                <Input
                  type="number"
                  min={5}
                  max={1440}
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Active Hours (UTC)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={activeStart}
                    onChange={(e) => setActiveStart(Number(e.target.value))}
                    className="h-8 text-sm w-16"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={activeEnd}
                    onChange={(e) => setActiveEnd(Number(e.target.value))}
                    className="h-8 text-sm w-16"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Checklist</label>
                <textarea
                  value={checklist}
                  onChange={(e) => setChecklist(e.target.value)}
                  placeholder={"- Check email for urgent items\n- Monitor sales dashboard\n- Review pending tasks"}
                  rows={4}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                />
              </div>
            </div>
          )}
        </section>

        {/* Memories Section */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Memories
            </h4>
            {memories && (
              <Badge variant="outline" className="text-[10px] ml-auto">
                {memories.length} stored
              </Badge>
            )}
          </div>

          {memories === undefined ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : memories.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No memories stored yet. Chat with your agent to build memory.
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {memories.map((mem) => (
                <div
                  key={mem._id}
                  className="group flex items-start gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-200 line-clamp-2">
                      {mem.content}
                    </p>
                    {mem.metadata?.source && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {mem.metadata.source}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteMemory({ id: mem._id })}
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 text-red-600 hover:text-red-300"
                    title="Delete memory"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Save Button */}
      <div className="px-4 py-3 border-t border-border">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full gap-2"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : saved ? (
            <Check className="h-3.5 w-3.5" />
          ) : null}
          {saved ? "Saved" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
