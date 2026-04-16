"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useOrganization } from "@clerk/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ModelSelector } from "@/components/chat/model-selector";
import { Button } from "@/components/ui/button";
import { getAgentConfig } from "@/lib/agents/registry";
import { getModelsForPlan } from "@/lib/agents/models";
import {
  ArrowLeft,
  Loader2,
  Monitor,
  Tablet,
  Smartphone,
  Globe,
  RefreshCw,
  ExternalLink,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { cn, prepareHtmlForIframe } from "@/lib/utils";
import { Id } from "../../../../../../convex/_generated/dataModel";

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTHS: Record<Viewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

export default function WebsiteViewPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const { organization } = useOrganization();
  const initialModel = searchParams.get("model");
  const [modelId, setModelId] = useState<string | null>(initialModel);

  // If opened with a model URL param, persist it so both pages stay in sync
  useEffect(() => {
    if (initialModel) {
      localStorage.setItem(`project-model:${projectId}`, initialModel);
    }
  }, [initialModel, projectId]);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const org = useQuery(
    api.organizations.getCurrent,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  const project = useQuery(
    api.projects.getById,
    { projectId: projectId as Id<"projects"> }
  );

  const session = useQuery(
    api.sessions.getActiveForProject,
    project?._id ? { projectId: project._id } : "skip"
  );

  // Query artifacts directly by project
  const artifacts = useQuery(
    api.artifacts.listByProject,
    project?._id ? { projectId: project._id } : "skip"
  );

  // Persist model choice per project in localStorage.
  // Priority: URL param > localStorage saved choice > agent default.
  useEffect(() => {
    if (modelId !== null) return;
    if (!org || !project) return;

    const storageKey = `project-model:${projectId}`;
    const saved = localStorage.getItem(storageKey);

    const agent = getAgentConfig(project.agentType);
    const plan = org.plan || "free";
    const available = getModelsForPlan(plan);
    const availableIds = new Set(available.map((m) => m.id));

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

  const handleModelChange = useCallback(
    (newModelId: string) => {
      setModelId(newModelId);
      localStorage.setItem(`project-model:${projectId}`, newModelId);
    },
    [projectId]
  );

  const latestHtmlArtifact = useMemo(() => {
    if (!artifacts) return null;
    return artifacts.find((a) => a.type === "html") ?? null;
  }, [artifacts]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleOpenExternal = useCallback(() => {
    if (!latestHtmlArtifact?.content) return;
    const blob = new Blob([latestHtmlArtifact.content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }, [latestHtmlArtifact]);

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
  const hasByok = !!org?.providerKeys?.openrouter;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/50">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push(`/project/${projectId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-sm">{project.name}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Viewport switcher */}
          <div className="flex items-center border border-border rounded-md mr-2">
            <Button
              variant={viewport === "desktop" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7 rounded-r-none"
              onClick={() => setViewport("desktop")}
            >
              <Monitor className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewport === "tablet" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7 rounded-none border-x border-border"
              onClick={() => setViewport("tablet")}
            >
              <Tablet className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewport === "mobile" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7 rounded-l-none"
              onClick={() => setViewport("mobile")}
            >
              <Smartphone className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleRefresh}
            title="Refresh preview"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleOpenExternal}
            disabled={!latestHtmlArtifact?.content}
            title="Open in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>

          <ModelSelector
            value={modelId}
            onChange={handleModelChange}
            plan={org?.plan || "free"}
            hasByok={hasByok}
          />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setChatCollapsed(!chatCollapsed)}
            title={chatCollapsed ? "Show chat" : "Hide chat"}
          >
            {chatCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Split view: Chat + Preview */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat panel */}
        {!chatCollapsed && (
          <div className="w-[380px] min-w-[320px] border-r border-border flex flex-col">
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
        )}

        {/* Preview panel */}
        <div className={cn("flex-1 flex flex-col bg-muted/10", chatCollapsed && "w-full")}>
          {latestHtmlArtifact?.content ? (
            <div className="flex-1 flex items-start justify-center overflow-auto p-4">
              <div
                className={cn(
                  "h-full bg-white rounded-lg border border-border shadow-sm overflow-hidden transition-all duration-200",
                  viewport === "desktop" && "w-full",
                  viewport !== "desktop" && "mx-auto"
                )}
                style={{
                  width: VIEWPORT_WIDTHS[viewport],
                  maxWidth: "100%",
                }}
              >
                <iframe
                  key={`${latestHtmlArtifact._id}-${refreshKey}`}
                  srcDoc={prepareHtmlForIframe(latestHtmlArtifact.content)}
                  className="w-full h-full min-h-[600px]"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                  title="Website Preview"
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                <Globe className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No preview available</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Use the chat to ask the agent to create or update your website.
                The live preview will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
