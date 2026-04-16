"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { api } from "../../../../../convex/_generated/api";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ModelSelector } from "@/components/chat/model-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAgentConfig } from "@/lib/agents/registry";
import { getModelsForPlan } from "@/lib/agents/models";
import {
  History,
  Settings,
  Loader2,
  FolderOpen,
  Monitor,
  Tablet,
  Smartphone,
  Globe,
  Download,
  Copy,
  Eye,
  Check,
  ExternalLink,
  X,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { cn, prepareHtmlForIframe } from "@/lib/utils";
import Link from "next/link";
import { Id } from "../../../../../convex/_generated/dataModel";
import { ProjectSettings } from "@/components/project/project-settings";

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { org } = useEffectiveOrg();
  const [modelId, setModelId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const project = useQuery(
    api.projects.getById,
    { projectId: projectId as Id<"projects"> }
  );

  const session = useQuery(
    api.sessions.getActiveForProject,
    project?._id ? { projectId: project._id } : "skip"
  );

  // Load artifacts for persistent action bar
  const artifacts = useQuery(
    api.artifacts.listByProject,
    project?._id ? { projectId: project._id } : "skip"
  );

  const latestHtmlArtifact = useMemo(() => {
    if (!artifacts) return null;
    return artifacts.find((a) => a.type === "html") ?? null;
  }, [artifacts]);

  // Persist model choice per project in localStorage.
  // Priority: localStorage saved choice > agent default.
  useEffect(() => {
    if (modelId !== null) return;
    if (!org || !project) return;

    const storageKey = `project-model:${projectId}`;
    const saved = localStorage.getItem(storageKey);

    const agent = getAgentConfig(project.agentType);
    const plan = org.plan || "free";
    const available = getModelsForPlan(plan);
    const availableIds = new Set(available.map((m) => m.id));

    // Use saved model if it's still available on the user's plan
    if (saved && availableIds.has(saved)) {
      setModelId(saved);
    } else if (availableIds.has(agent.defaultModel)) {
      setModelId(agent.defaultModel);
    } else if (available.length > 0) {
      setModelId(available[available.length - 1].id);
    } else {
      setModelId(agent.defaultModel);
    }
  }, [org, project, modelId, projectId]);

  // When user changes model, persist to localStorage
  const handleModelChange = useCallback(
    (newModelId: string) => {
      setModelId(newModelId);
      localStorage.setItem(`project-model:${projectId}`, newModelId);
    },
    [projectId]
  );

  if (!project || !session || modelId === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading project...</p>
        </div>
      </div>
    );
  }

  const agent = getAgentConfig(project.agentType);
  // Check if any provider credential exists for BYOK access
  const providerKeys = org?.providerKeys as Record<string, any> | undefined;
  const hasByok = !!providerKeys && Object.values(providerKeys).some(
    (v) => v != null && v !== "" && (typeof v === "string" || (typeof v === "object" && v.type))
  );

  return (
    <div className="flex flex-col h-full">
      {/* Project Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/50">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-sm">{project.name}</h2>
          <Badge variant="outline" className="text-[10px] capitalize">
            {project.agentType}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <ModelSelector
            value={modelId}
            onChange={handleModelChange}
            plan={org?.plan || "free"}
            hasByok={hasByok}
          />
          {project.agentType === "websites" && (
            <Link href={`/project/${projectId}/view?model=${encodeURIComponent(modelId)}`} target="_blank">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Monitor className="h-4 w-4" />
              </Button>
            </Link>
          )}
          <Link href={`/project/${projectId}/files`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <FolderOpen className="h-4 w-4" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <History className="h-4 w-4" />
          </Button>
          <Button
            variant={showSettings ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Artifact Actions Bar - persists across refresh */}
      {latestHtmlArtifact && (
        <ArtifactBar artifact={latestHtmlArtifact} projectId={projectId} modelId={modelId} />
      )}

      {/* Chat Panel + Settings */}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-hidden">
          <ChatPanel
            projectId={project._id}
            sessionId={session._id}
            organizationId={org?._id}
            agentType={project.agentType}
            modelId={modelId}
            enabledTools={project.agentConfig?.enabledTools || agent.defaultTools}
            proMode={project.agentConfig?.proMode}
          />
        </div>
        {showSettings && (
          <ProjectSettings
            projectId={project._id}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    </div>
  );
}

type PreviewViewport = "desktop" | "tablet" | "mobile";

const PREVIEW_VIEWPORT_WIDTHS: Record<PreviewViewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

function ArtifactBar({
  artifact,
  projectId,
  modelId,
}: {
  artifact: { title: string; content?: string; type: string; mimeType: string; sizeBytes: number };
  projectId: string;
  modelId: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!artifact.content) return;
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [artifact.content]);

  const handleDownload = useCallback(() => {
    if (!artifact.content) return;
    const blob = new Blob([artifact.content], { type: artifact.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = artifact.title;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [artifact]);

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Globe className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{artifact.title}</p>
        </div>
        <div className="flex items-center gap-1">
          <Link href={`/project/${projectId}/view?model=${encodeURIComponent(modelId)}`} target="_blank">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
              <ExternalLink className="h-3 w-3" />
              View Site
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setShowPreview(true)}
          >
            <Eye className="h-3 w-3" />
            Preview
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleDownload}
          >
            <Download className="h-3 w-3" />
            Download
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      {showPreview && artifact.content && (
        <ResponsivePreviewModal
          title={artifact.title}
          html={artifact.content}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}

function ResponsivePreviewModal({
  title,
  html,
  onClose,
}: {
  title: string;
  html: string;
  onClose: () => void;
}) {
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-[95vw] max-w-7xl h-[90vh] mx-4 rounded-xl border border-border bg-background shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <span className="font-semibold text-sm">{title}</span>

          <div className="flex items-center gap-3">
            {/* Viewport switcher */}
            <div className="flex items-center border border-border rounded-md">
              <Button
                variant={viewport === "desktop" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7 rounded-r-none"
                onClick={() => setViewport("desktop")}
                title="Desktop"
              >
                <Monitor className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewport === "tablet" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7 rounded-none border-x border-border"
                onClick={() => setViewport("tablet")}
                title="Tablet"
              >
                <Tablet className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewport === "mobile" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7 rounded-l-none"
                onClick={() => setViewport("mobile")}
                title="Mobile"
              >
                <Smartphone className="h-3.5 w-3.5" />
              </Button>
            </div>

            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-auto flex items-start justify-center bg-muted/10 p-4">
          <div
            className={cn(
              "h-full bg-white rounded-lg border border-border shadow-sm overflow-hidden transition-all duration-200",
              viewport === "desktop" && "w-full",
              viewport !== "desktop" && "mx-auto"
            )}
            style={{
              width: PREVIEW_VIEWPORT_WIDTHS[viewport],
              maxWidth: "100%",
            }}
          >
            <iframe
              srcDoc={prepareHtmlForIframe(html)}
              className="w-full h-full"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              title={title}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
