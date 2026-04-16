"use client";

import { useChat } from "ai/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import Link from "next/link";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, Loader2, RefreshCw } from "lucide-react";
import type { AgentType } from "@/lib/agents/registry";
import type { Id } from "../../../convex/_generated/dataModel";

interface ChatPanelProps {
  projectId: string;
  sessionId: string;
  organizationId?: string;
  agentType: AgentType;
  modelId: string;
  enabledTools?: string[];
  proMode?: boolean;
  onMessageSent?: () => void;
}

export function ChatPanel({
  projectId,
  sessionId,
  organizationId,
  agentType,
  modelId,
  enabledTools,
  proMode = false,
  onMessageSent,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const retryCountRef = useRef(0);
  const initialLoadDone = useRef(false);
  const [historyTimedOut, setHistoryTimedOut] = useState(false);
  const MAX_AUTO_RETRIES = 1;

  // Load saved messages from Convex
  const savedMessages = useQuery(
    api.messages.listBySession,
    sessionId
      ? { sessionId: sessionId as Id<"sessions"> }
      : "skip"
  );

  const {
    messages,
    setMessages,
    input,
    setInput,
    handleSubmit,
    append,
    isLoading,
    stop,
    error,
    reload,
  } = useChat({
    api: "/api/chat",
    body: {
      modelId,
      agentType,
      enabledTools,
      proMode,
      projectId,
      sessionId,
      organizationId,
    },
    id: sessionId,
    onFinish: () => {
      retryCountRef.current = 0;
      onMessageSent?.();
    },
    onError: (err) => {
      console.error("Chat stream error:", err);
    },
  });

  // Load saved messages into useChat on initial mount
  useEffect(() => {
    if (initialLoadDone.current) return;
    if (savedMessages === undefined) return; // still loading
    initialLoadDone.current = true;
    if (savedMessages.length > 0) {
      setMessages(
        savedMessages.map((m) => ({
          id: m._id,
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        }))
      );
    }
  }, [savedMessages, setMessages]);

  // Auto-send initial message from agents page (stored in sessionStorage)
  const initialMessageSent = useRef(false);
  useEffect(() => {
    if (initialMessageSent.current) return;
    if (!initialLoadDone.current) return;
    if (savedMessages === undefined || savedMessages.length > 0) return;

    const key = `initial-message:${projectId}`;
    const initialMessage = sessionStorage.getItem(key);
    if (initialMessage) {
      initialMessageSent.current = true;
      sessionStorage.removeItem(key);
      append({ role: "user", content: initialMessage });
    }
  }, [projectId, savedMessages, append]);

  // Timeout fallback: if Convex auth is broken, unblock the UI after 5s
  useEffect(() => {
    if (initialLoadDone.current) return;
    const timeout = setTimeout(() => {
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        setHistoryTimedOut(true);
      }
    }, 5000);
    return () => clearTimeout(timeout);
  }, []);

  // Auto-retry once on stream disconnection errors
  useEffect(() => {
    if (!error || isLoading) return;

    const msg = error.message || "";
    const isRetryable =
      msg.includes("ERR_INCOMPLETE_CHUNKED_ENCODING") ||
      msg.includes("network") ||
      msg.includes("fetch failed") ||
      msg.includes("terminated") ||
      msg === "";

    if (isRetryable && retryCountRef.current < MAX_AUTO_RETRIES) {
      retryCountRef.current += 1;
      console.log(`Auto-retrying (attempt ${retryCountRef.current})...`);
      const timer = setTimeout(() => reload(), 1500);
      return () => clearTimeout(timer);
    }
  }, [error, isLoading, reload]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const onSubmit = useCallback(() => {
    if (input.trim()) {
      handleSubmit();
    }
  }, [input, handleSubmit]);

  // Show loading state while fetching saved messages — but never block
  // if useChat already has messages or if the history load timed out
  const isLoadingHistory = savedMessages === undefined && !initialLoadDone.current && !historyTimedOut && messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isLoadingHistory ? (
          <div className="flex flex-col items-center justify-center h-full px-4 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Loading conversation...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              Start a conversation
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Type a message below to start chatting with your AI agent.
              The agent can search the web, perform calculations, and help
              with a wide variety of tasks.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {messages.map((message, index) => (
              <ChatMessage
                key={message.id}
                message={message}
                isStreaming={
                  isLoading && index === messages.length - 1 && message.role === "assistant"
                }
                projectId={projectId}
              />
            ))}
            {isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
              <ThinkingPlaceholder agentType={agentType} />
            )}
          </div>
        )}
        {error && !isLoading && <ChatError error={error} onRetry={reload} />}
      </div>

      {/* Input area */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={onSubmit}
        onStop={stop}
        isLoading={isLoading}
      />
    </div>
  );
}

const STATUS_MESSAGES: Record<string, string[]> = {
  websites: [
    "Connecting to AI model...",
    "Planning website layout...",
    "Designing page structure...",
    "Writing HTML & CSS...",
    "Adding styles and content...",
    "Building your website...",
    "Generating — large pages take a moment...",
  ],
  images: [
    "Connecting to AI model...",
    "Analyzing your request...",
    "Preparing image generation...",
    "Creating your image...",
  ],
  default: [
    "Connecting to AI model...",
    "Processing your request...",
    "Generating response...",
    "Working on it...",
    "Still working...",
  ],
};

function getStatusMessage(agentType: string, elapsed: number): string {
  const messages = STATUS_MESSAGES[agentType] || STATUS_MESSAGES.default;
  const index = Math.min(
    Math.floor(elapsed / 8),
    messages.length - 1
  );
  return messages[index];
}

function ThinkingPlaceholder({ agentType }: { agentType?: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const statusMessage = getStatusMessage(agentType || "default", elapsed);

  return (
    <div className="flex gap-3 px-4 py-4 bg-muted/20">
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        <AvatarFallback className="bg-violet-500/20 text-violet-400">
          <Bot className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-2 overflow-hidden min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Agent</span>
          <Badge variant="secondary" className="text-[10px] gap-1 px-1.5">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            Working
          </Badge>
          {elapsed >= 5 && (
            <span className="text-[10px] text-muted-foreground/50">{elapsed}s</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{statusMessage}</p>
        <div className="flex items-center gap-1 pt-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

function tryParseErrorJson(message: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(message);
    if (parsed && typeof parsed === "object" && parsed.error) return parsed;
  } catch {
    // Not JSON
  }

  const jsonMatch = message.match(/\{[^{}]*"error"[^{}]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === "object" && parsed.error) return parsed;
    } catch {
      // Not valid JSON
    }
  }

  return null;
}

function RetryButton({ onRetry }: { onRetry?: () => void }) {
  if (!onRetry) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className="mt-2 h-7 text-xs gap-1.5"
      onClick={onRetry}
    >
      <RefreshCw className="h-3 w-3" />
      Retry
    </Button>
  );
}

function ChatError({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const parsed = useMemo(() => tryParseErrorJson(error.message), [error.message]);

  const isAuthError =
    parsed?.category === "invalid_key" || parsed?.category === "expired_key";

  const isStreamError =
    !parsed &&
    (error.message.includes("ERR_INCOMPLETE_CHUNKED_ENCODING") ||
      error.message.includes("network") ||
      error.message.includes("fetch failed") ||
      error.message.includes("terminated") ||
      error.message.includes("aborted") ||
      error.message === "");

  if (parsed) {
    return (
      <div className="px-4 py-3 mx-4 my-2 rounded-lg bg-destructive/10 border border-destructive/20">
        <p className="text-sm font-medium text-destructive">{parsed.error}</p>
        {parsed.suggestion && (
          <p className="text-xs text-destructive/70 mt-1">{parsed.suggestion}</p>
        )}
        <div className="flex items-center gap-2">
          {isAuthError && (
            <Link
              href="/settings"
              className="inline-block text-xs text-primary underline mt-2"
            >
              Go to Settings
            </Link>
          )}
          {!isAuthError && <RetryButton onRetry={onRetry} />}
        </div>
      </div>
    );
  }

  if (isStreamError) {
    return (
      <div className="px-4 py-3 mx-4 my-2 rounded-lg bg-destructive/10 border border-destructive/20">
        <p className="text-sm font-medium text-destructive">
          Connection lost during generation
        </p>
        <p className="text-xs text-destructive/70 mt-1">
          The AI provider disconnected before finishing. This can happen with
          large outputs like full web pages. Try again — or switch to a
          different model.
        </p>
        <RetryButton onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className="px-4 py-3 mx-4 my-2 rounded-lg bg-destructive/10 border border-destructive/20">
      <p className="text-sm text-destructive">
        Error: {error.message || "Something went wrong. Please try again."}
      </p>
      <RetryButton onRetry={onRetry} />
    </div>
  );
}
