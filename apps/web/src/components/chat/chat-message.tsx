"use client";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  User,
  ChevronDown,
  ChevronRight,
  Wrench,
  Check,
  X,
  Loader2,
  Layout,
  PanelsTopLeft,
  ImageIcon,
  Type,
  Paintbrush,
  CheckCircle2,
  Brain,
  Search,
  ArrowRight,
  Globe2,
  AlertCircle,
} from "lucide-react";
import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "ai";
import { ArtifactCard } from "./artifact-card";
import { AgentPlanDisplay, AgentReflectionDisplay } from "./agent-plan-display";

interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: "call" | "result" | "partial-call";
  result?: unknown;
}

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  projectId?: string;
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  web_search: "Searching the web",
  calculator: "Calculating",
  save_artifact: "Saving artifact",
  agent_plan: "Creating plan",
  update_plan: "Updating progress",
  agent_reflect: "Evaluating results",
  deep_search: "Deep searching",
  read_webpage: "Reading webpage",
  memory_save: "Memory Saved",
  memory_search: "Memory Search",
  delegate_to_agent: "Agent Delegation",
  browser_action: "Browser Action",
};

function getToolDetail(invocation: ToolInvocation): string | undefined {
  if (invocation.toolName === "save_artifact") {
    const title = invocation.args?.title as string | undefined;
    return title || undefined;
  }
  if (invocation.toolName === "web_search") {
    const query = invocation.args?.query as string | undefined;
    return query ? `"${query}"` : undefined;
  }
  if (invocation.toolName === "agent_plan") {
    const goal = invocation.args?.goal as string | undefined;
    return goal || undefined;
  }
  if (invocation.toolName === "deep_search") {
    const topic = invocation.args?.topic as string | undefined;
    return topic || undefined;
  }
  if (invocation.toolName === "read_webpage") {
    const url = invocation.args?.url as string | undefined;
    return url || undefined;
  }
  if (invocation.toolName === "memory_save") {
    const topic = invocation.args?.topic as string | undefined;
    return topic ? `Saved: ${topic}` : undefined;
  }
  if (invocation.toolName === "memory_search") {
    const query = invocation.args?.query as string | undefined;
    return query ? `Searching: ${query}` : undefined;
  }
  if (invocation.toolName === "delegate_to_agent") {
    const target = invocation.args?.targetAgent as string | undefined;
    return target ? `Delegating to ${target}` : undefined;
  }
  if (invocation.toolName === "browser_action") {
    const steps = invocation.args?.steps as unknown[] | undefined;
    return steps ? `${steps.length} step(s)` : undefined;
  }
  return undefined;
}

function getStreamingStatus(message: Message): {
  label: string;
  detail?: string;
} {
  const tools = (message.toolInvocations || []) as ToolInvocation[];
  const pendingTools = tools.filter(
    (t) => t.state === "call" || t.state === "partial-call"
  );
  const completedTools = tools.filter((t) => t.state === "result");

  // Active tool calls take priority
  if (pendingTools.length > 0) {
    const name =
      TOOL_DISPLAY_NAMES[pendingTools[0].toolName] ||
      pendingTools[0].toolName;
    return { label: "Using tools", detail: name };
  }

  // Content is streaming
  if (message.content) {
    const words = message.content.trim().split(/\s+/).length;
    const hasArtifact = completedTools.some(
      (t) =>
        t.toolName === "save_artifact" &&
        t.result &&
        typeof t.result === "object" &&
        (t.result as any).__artifact
    );
    if (hasArtifact) {
      return { label: "Wrapping up", detail: `${words} words` };
    }
    return { label: "Writing", detail: `${words} words` };
  }

  // Nothing yet
  if (tools.length > 0) {
    return { label: "Processing" };
  }
  return { label: "Thinking" };
}

function DelegationResult({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;
  return (
    <div className="rounded bg-background p-2">
      <p className="text-xs text-zinc-300 whitespace-pre-wrap">
        {isLong && !expanded ? text.slice(0, 200) + "..." : text}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-primary hover:underline mt-1"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function ToolCallDisplay({ invocation, projectId, isMessageStreaming, fullHtmlContent, allInvocations }: { invocation: ToolInvocation; projectId?: string; isMessageStreaming?: boolean; fullHtmlContent?: string; allInvocations?: ToolInvocation[] }) {
  const [expanded, setExpanded] = useState(false);

  const isComplete = invocation.state === "result";
  const isPending = invocation.state === "call" || invocation.state === "partial-call";
  // If the message is no longer streaming but the tool call never completed,
  // the model likely hit its output token limit mid-tool-call.
  const isStuck = isPending && !isMessageStreaming;
  const displayName = TOOL_DISPLAY_NAMES[invocation.toolName] || invocation.toolName;
  const detail = getToolDetail(invocation);

  // Render ArtifactCard for completed save_artifact calls
  if (
    invocation.toolName === "save_artifact" &&
    isComplete &&
    invocation.result &&
    typeof invocation.result === "object" &&
    (invocation.result as any).__artifact
  ) {
    const artifactData = invocation.result as any;
    // Inject full HTML content from the message text (the stream only sends an 800-char preview)
    const enrichedArtifact = fullHtmlContent && artifactData.type === "html"
      ? { ...artifactData, content: fullHtmlContent }
      : artifactData;
    return <ArtifactCard artifact={enrichedArtifact} projectId={projectId} />;
  }

  // Render AgentPlanDisplay for completed agent_plan calls
  if (
    invocation.toolName === "agent_plan" &&
    isComplete &&
    invocation.result &&
    typeof invocation.result === "object" &&
    (invocation.result as any).__agentPlan
  ) {
    // Collect all update_plan results for this planId to show latest state
    const planData = invocation.result as any;
    const updates = (allInvocations || [])
      .filter(
        (t) =>
          t.toolName === "update_plan" &&
          t.state === "result" &&
          t.result &&
          typeof t.result === "object" &&
          (t.result as any).__planUpdate &&
          (t.result as any).planId === planData.planId
      )
      .map((t) => t.result as any);

    return (
      <AgentPlanDisplay
        planData={planData}
        updates={updates}
        isStreaming={isMessageStreaming}
      />
    );
  }

  // Hide update_plan calls — AgentPlanDisplay handles them
  if (
    invocation.toolName === "update_plan" &&
    isComplete &&
    invocation.result &&
    typeof invocation.result === "object" &&
    (invocation.result as any).__planUpdate
  ) {
    return null;
  }

  // Render AgentReflectionDisplay for completed agent_reflect calls
  if (
    invocation.toolName === "agent_reflect" &&
    isComplete &&
    invocation.result &&
    typeof invocation.result === "object" &&
    (invocation.result as any).__agentReflection
  ) {
    return <AgentReflectionDisplay reflectionData={invocation.result as any} />;
  }

  // ── Rich renderer: memory_save ──────────────────────────────────────
  if (invocation.toolName === "memory_save" && isComplete) {
    const args = invocation.args || {};
    const topic = (args.topic as string) || "Untitled";
    const importance = (args.importance as string) || "normal";
    const content = (args.content as string) || "";
    return (
      <div className="my-2 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium text-green-700">Memory Saved</span>
          <Badge variant="outline" className="text-[10px] ml-auto capitalize border-green-500/30 text-green-700">
            {importance}
          </Badge>
        </div>
        <p className="text-xs font-medium text-zinc-200">{topic}</p>
        {content && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {content.slice(0, 100)}{content.length > 100 ? "..." : ""}
          </p>
        )}
      </div>
    );
  }

  // ── Rich renderer: memory_search ────────────────────────────────────
  if (invocation.toolName === "memory_search" && isComplete) {
    const result = invocation.result as any;
    const results = Array.isArray(result?.results) ? result.results : Array.isArray(result) ? result : [];
    const query = (invocation.args?.query as string) || "";
    return (
      <div className="my-2 rounded-lg border border-border bg-muted/30 px-3 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Search className="h-4 w-4 text-blue-700" />
          <span className="text-sm font-medium">Memory Search</span>
          {query && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              &ldquo;{query}&rdquo;
            </span>
          )}
        </div>
        {results.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No memories found</p>
        ) : (
          <div className="space-y-1.5">
            {results.map((mem: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <Badge variant="outline" className="text-[10px] shrink-0 tabular-nums mt-0.5">
                  {typeof mem._score === "number" ? mem._score.toFixed(2) : "—"}
                </Badge>
                <div className="min-w-0">
                  <p className="text-zinc-200 line-clamp-1">{mem.content || "—"}</p>
                  {mem.metadata?.source && (
                    <p className="text-muted-foreground text-[10px]">{mem.metadata.source}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Rich renderer: delegate_to_agent ────────────────────────────────
  if (invocation.toolName === "delegate_to_agent" && isComplete) {
    const args = invocation.args || {};
    const fromAgent = (args.fromAgent as string) || "Agent";
    const targetAgent = (args.targetAgent as string) || "Agent";
    const task = (args.task as string) || (args.prompt as string) || "";
    const result = invocation.result as any;
    const resultText = typeof result === "string" ? result : result?.result || result?.response || "";
    const isSuccess = !result?.error;
    return (
      <div className="my-2 rounded-lg border border-border bg-muted/30 px-3 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-medium">Agent Delegation</span>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] ml-auto",
              isSuccess ? "border-green-500/30 text-green-700" : "border-red-500/30 text-red-600"
            )}
          >
            {isSuccess ? "success" : "error"}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-300 mb-2">
          <span className="font-medium">{fromAgent}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium">{targetAgent}</span>
        </div>
        {task && (
          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{task}</p>
        )}
        {resultText && (
          <DelegationResult text={typeof resultText === "string" ? resultText : JSON.stringify(resultText)} />
        )}
      </div>
    );
  }

  // ── Rich renderer: browser_action ───────────────────────────────────
  if (invocation.toolName === "browser_action" && isComplete) {
    const args = invocation.args || {};
    const steps = Array.isArray(args.steps) ? args.steps : [];
    const result = invocation.result as any;
    const resultSteps = Array.isArray(result?.results) ? result.results : Array.isArray(result) ? result : [];
    const sessionId = (result?.sessionId as string) || (args.sessionId as string) || "";
    const currentUrl = (result?.currentUrl as string) || "";
    const tabCount = typeof result?.tabCount === "number" ? result.tabCount : undefined;
    return (
      <div className="my-2 rounded-lg border border-border bg-muted/30 px-3 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Globe2 className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-medium">Browser Action</span>
          <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-2">
            {sessionId && <span>Session: {sessionId.slice(0, 8)}...</span>}
            {currentUrl && <span className="truncate max-w-[150px]">{currentUrl}</span>}
            {tabCount !== undefined && <span>{tabCount} tab(s)</span>}
          </span>
        </div>
        <div className="space-y-1">
          {(resultSteps.length > 0 ? resultSteps : steps).map((step: any, i: number) => {
            const action = step.action || step.type || `Step ${i + 1}`;
            const success = step.success !== false;
            const data = step.data || step.result || step.value;
            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                {success ? (
                  <Check className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
                )}
                <span className="font-medium text-zinc-300">{action}</span>
                {data && (
                  <span className="text-muted-foreground truncate max-w-[250px]">
                    {typeof data === "string" ? data : JSON.stringify(data).slice(0, 80)}
                  </span>
                )}
              </div>
            );
          })}
          {steps.length === 0 && resultSteps.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No steps recorded</p>
          )}
        </div>
      </div>
    );
  }

  // Tool call was truncated — model hit output token limit mid-generation
  if (isStuck) {
    return (
      <div className="my-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3">
        <p className="text-sm font-medium text-destructive">
          Generation incomplete — output was too large
        </p>
        <p className="text-xs text-destructive/70 mt-1">
          The model ran out of output tokens while generating the {displayName.toLowerCase() || "tool call"} content.
          Try again with a simpler prompt, or switch to a faster model like Gemini 2.5 Flash which handles large outputs better.
        </p>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-border bg-muted/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : isComplete ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <X className="h-3.5 w-3.5 text-destructive" />
        )}
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">
          {isPending ? `${displayName}...` : displayName}
        </span>
        {detail && (
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
            {detail}
          </span>
        )}
        <span className="ml-auto">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Input
            </p>
            <pre className="text-xs bg-background rounded p-2 overflow-x-auto font-mono">
              {JSON.stringify(invocation.args, null, 2)}
            </pre>
          </div>
          {isComplete && !!invocation.result && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Output
              </p>
              <pre className="text-xs bg-background rounded p-2 overflow-x-auto font-mono max-h-48 overflow-y-auto">
                {typeof invocation.result === "string"
                  ? invocation.result
                  : JSON.stringify(invocation.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StreamingBadge({ message }: { message: Message }) {
  const status = useMemo(() => getStreamingStatus(message), [message]);

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="text-[10px] gap-1 px-1.5">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        {status.label}
      </Badge>
      {status.detail && (
        <span className="text-[10px] text-muted-foreground">{status.detail}</span>
      )}
    </div>
  );
}

// ─── Website generation progress ──────────────────────────────────────
// Detects ```html code blocks and shows friendly status instead of raw code.

const HTML_FENCE_RE = /```html\s*\n[\s\S]*?(?:\n```|$)/;

function containsHtmlCodeBlock(content: string): boolean {
  return HTML_FENCE_RE.test(content);
}

/** Strip ```html...``` blocks and return only the surrounding prose. */
function stripHtmlCodeBlock(content: string): string {
  return content.replace(/```html\s*\n[\s\S]*?(?:\n```|$)/g, "").trim();
}

interface BuildStage {
  label: string;
  icon: React.ReactNode;
  done: boolean;
}

function getWebsiteBuildStages(html: string): BuildStage[] {
  const lc = html.toLowerCase();
  return [
    {
      label: "Laying out page structure",
      icon: <Layout className="h-3.5 w-3.5" />,
      done: lc.includes("<head") || lc.includes("<body"),
    },
    {
      label: "Styling with CSS",
      icon: <Paintbrush className="h-3.5 w-3.5" />,
      done: lc.includes("<style") || lc.includes("font-family"),
    },
    {
      label: "Building navigation & sections",
      icon: <PanelsTopLeft className="h-3.5 w-3.5" />,
      done: lc.includes("<nav") || lc.includes("<section"),
    },
    {
      label: "Adding content & typography",
      icon: <Type className="h-3.5 w-3.5" />,
      done: lc.includes("<h1") || lc.includes("<h2"),
    },
    {
      label: "Finding & placing images",
      icon: <ImageIcon className="h-3.5 w-3.5" />,
      done: lc.includes("unsplash.com") || lc.includes("<img"),
    },
    {
      label: "Finishing touches",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      done: lc.includes("</html>"),
    },
  ];
}

function WebsiteBuildProgress({ html }: { html: string }) {
  const stages = useMemo(() => getWebsiteBuildStages(html), [html]);
  const activeIndex = stages.findIndex((s) => !s.done);
  const lineCount = html.split("\n").length;

  return (
    <div className="my-2 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Building your website...
        </span>
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
          {lineCount} lines generated
        </span>
      </div>
      <div className="space-y-1.5">
        {stages.map((stage, i) => {
          const isActive = i === activeIndex;
          return (
            <div key={stage.label} className="flex items-center gap-2.5">
              <span
                className={cn(
                  "shrink-0",
                  stage.done
                    ? "text-green-500"
                    : isActive
                      ? "text-primary animate-pulse"
                      : "text-muted-foreground/30"
                )}
              >
                {stage.done ? (
                  <Check className="h-3.5 w-3.5" />
                ) : isActive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  stage.icon
                )}
              </span>
              <span
                className={cn(
                  "text-xs",
                  stage.done
                    ? "text-muted-foreground"
                    : isActive
                      ? "text-foreground font-medium"
                      : "text-muted-foreground/40"
                )}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChatMessage({ message, isStreaming, projectId }: ChatMessageProps) {
  const isUser = message.role === "user";

  // Extract full HTML from the message text so we can pass it to the artifact card
  // (the stream only sends a truncated 800-char preview in the tool result)
  const extractedHtml = useMemo(() => {
    if (!message.content || isUser) return undefined;
    const match = message.content.match(/```html\s*\n([\s\S]*?)\n```/);
    return match?.[1]?.trim() || undefined;
  }, [message.content, isUser]);

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-4",
        isUser ? "bg-transparent" : "bg-muted/20"
      )}
    >
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        <AvatarFallback
          className={cn(
            "text-xs",
            isUser
              ? "bg-primary/20 text-primary"
              : "bg-violet-500/20 text-violet-400"
          )}
        >
          {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-2 overflow-hidden min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {isUser ? "You" : "Agent"}
          </span>
          {isStreaming && !isUser && <StreamingBadge message={message} />}
        </div>

        {/* Tool invocations */}
        {message.toolInvocations?.map((invocation: ToolInvocation) => (
          <ToolCallDisplay
            key={invocation.toolCallId}
            invocation={invocation}
            projectId={projectId}
            isMessageStreaming={isStreaming}
            fullHtmlContent={extractedHtml}
            allInvocations={message.toolInvocations as ToolInvocation[]}
          />
        ))}

        {/* Message content */}
        {message.content && (() => {
          const hasHtml = containsHtmlCodeBlock(message.content);
          const hasArtifact = message.toolInvocations?.some(
            (t: ToolInvocation) =>
              t.toolName === "save_artifact" &&
              t.state === "result" &&
              t.result &&
              typeof t.result === "object" &&
              (t.result as any).__artifact
          );

          // Website generation: hide raw HTML, show progress or just the intro
          if (hasHtml) {
            const prose = stripHtmlCodeBlock(message.content);
            const htmlMatch = message.content.match(/```html\s*\n([\s\S]*?)(?:\n```|$)/);
            const htmlContent = htmlMatch?.[1] || "";

            return (
              <>
                {/* Show the intro text (e.g. "Here's your roofing website:") */}
                {prose && (
                  <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{prose}</ReactMarkdown>
                  </div>
                )}
                {/* While streaming: show build progress. After done: artifact card handles it */}
                {isStreaming && !hasArtifact && (
                  <WebsiteBuildProgress html={htmlContent} />
                )}
              </>
            );
          }

          // Normal message — render full markdown
          return (
            <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  pre: ({ children }) => (
                    <pre className="rounded-lg bg-background border border-border p-4 overflow-x-auto my-3">
                      {children}
                    </pre>
                  ),
                  code: ({ className, children, ...props }) => {
                    const isInline = !className;
                    if (isInline) {
                      return (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono" {...props}>
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code className={cn("font-mono text-sm", className)} {...props}>
                        {children}
                      </code>
                    );
                  },
                  a: ({ children, ...props }) => (
                    <a
                      className="text-primary hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                      {...props}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
