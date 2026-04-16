"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Info,
  Search,
  List,
  GitBranch,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState, useMemo } from "react";

const MESSAGE_TYPE_CONFIG: Record<
  string,
  { color: string; bgColor: string; icon: any; label: string }
> = {
  delegation: {
    color: "text-blue-700",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    icon: ArrowRight,
    label: "Delegation",
  },
  result: {
    color: "text-emerald-700",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
    icon: CheckCircle,
    label: "Result",
  },
  error: {
    color: "text-red-600",
    bgColor: "bg-red-500/10 border-red-500/20",
    icon: AlertCircle,
    label: "Error",
  },
  question: {
    color: "text-amber-700",
    bgColor: "bg-amber-500/10 border-amber-500/20",
    icon: HelpCircle,
    label: "Question",
  },
  info: {
    color: "text-zinc-400",
    bgColor: "bg-zinc-500/10 border-zinc-500/20",
    icon: Info,
    label: "Info",
  },
};

type ViewMode = "timeline" | "threads";

interface CommunicationsPanelProps {
  agentTeamId: Id<"agentTeams">;
  projectId?: Id<"projects">;
}

export function CommunicationsPanel({
  agentTeamId,
  projectId,
}: CommunicationsPanelProps) {
  const [filter, setFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [searchQuery, setSearchQuery] = useState("");

  const communications = useQuery(
    api.agentCommunications.listByTeam,
    { agentTeamId, limit: 100 }
  );

  type CommDoc = Doc<"agentCommunications">;

  // Apply text search filter
  const searchFiltered = useMemo(() => {
    if (!communications) return [] as CommDoc[];
    if (!searchQuery.trim()) return communications;
    const q = searchQuery.toLowerCase();
    return communications.filter(
      (c: CommDoc) =>
        c.content.toLowerCase().includes(q) ||
        c.fromName.toLowerCase().includes(q) ||
        c.toName.toLowerCase().includes(q)
    );
  }, [communications, searchQuery]);

  const filtered = filter
    ? searchFiltered.filter((c: CommDoc) => c.messageType === filter)
    : searchFiltered;

  // Show chronological (reverse the desc order from query)
  const chronological = [...filtered].reverse();

  // Group by delegation chain for thread view
  const threads = useMemo(() => {
    if (viewMode !== "threads") return [];
    const chainMap = new Map<
      string,
      Doc<"agentCommunications">[]
    >();
    const noChain: Doc<"agentCommunications">[] = [];

    for (const comm of chronological) {
      const chainId = (comm as any).delegationChainId;
      if (chainId) {
        if (!chainMap.has(chainId)) chainMap.set(chainId, []);
        chainMap.get(chainId)!.push(comm);
      } else {
        noChain.push(comm);
      }
    }

    const chains = Array.from(chainMap.entries()).map(([id, msgs]) => ({
      chainId: id,
      delegation: msgs.find((m) => m.messageType === "delegation"),
      result: msgs.find(
        (m) => m.messageType === "result" || m.messageType === "error"
      ),
      messages: msgs,
    }));

    return { chains, orphans: noChain };
  }, [chronological, viewMode]);

  return (
    <div className="rounded-xl border border-border bg-card/60">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Communications</h3>
          {communications && (
            <span className="text-xs text-muted-foreground">
              ({communications.length})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode("timeline")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium transition-all",
                viewMode === "timeline"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-3 w-3" />
            </button>
            <button
              onClick={() => setViewMode("threads")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium transition-all",
                viewMode === "threads"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <GitBranch className="h-3 w-3" />
            </button>
          </div>

          {/* Filter buttons */}
          <div className="flex items-center gap-1">
            <FilterButton
              active={filter === null}
              onClick={() => setFilter(null)}
              label="All"
            />
            <FilterButton
              active={filter === "delegation"}
              onClick={() => setFilter("delegation")}
              label="Tasks"
              color="text-blue-700"
            />
            <FilterButton
              active={filter === "result"}
              onClick={() => setFilter("result")}
              label="Results"
              color="text-emerald-700"
            />
            <FilterButton
              active={filter === "error"}
              onClick={() => setFilter("error")}
              label="Errors"
              color="text-red-600"
            />
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-4 py-2 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search communications..."
            className="w-full pl-7 pr-3 py-1.5 text-xs bg-transparent border border-border/50 rounded-md focus:outline-none focus:border-primary/40 placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      {/* Message list */}
      <div className="max-h-[400px] overflow-y-auto">
        {chronological.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {communications === undefined
              ? "Loading..."
              : searchQuery
                ? "No matches found."
                : "No communications yet. Delegate tasks to see activity here."}
          </div>
        ) : viewMode === "timeline" ? (
          <div className="divide-y divide-border/50">
            {chronological.map((comm) => (
              <CommunicationRow key={comm._id} comm={comm} />
            ))}
          </div>
        ) : (
          <ThreadView threads={threads as any} />
        )}
      </div>
    </div>
  );
}

function ThreadView({
  threads,
}: {
  threads: {
    chains: Array<{
      chainId: string;
      delegation?: Doc<"agentCommunications">;
      result?: Doc<"agentCommunications">;
      messages: Doc<"agentCommunications">[];
    }>;
    orphans: Doc<"agentCommunications">[];
  };
}) {
  return (
    <div className="divide-y divide-border/50">
      {threads.chains.map((chain) => (
        <ThreadChain key={chain.chainId} chain={chain} />
      ))}
      {threads.orphans.map((comm) => (
        <CommunicationRow key={comm._id} comm={comm} />
      ))}
    </div>
  );
}

function ThreadChain({
  chain,
}: {
  chain: {
    chainId: string;
    delegation?: Doc<"agentCommunications">;
    result?: Doc<"agentCommunications">;
    messages: Doc<"agentCommunications">[];
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = chain.result !== undefined;
  const isError = chain.result?.messageType === "error";

  return (
    <div className="border-l-2 border-blue-500/30">
      {/* Chain header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs font-medium text-blue-700">
            {chain.delegation?.fromName}
          </span>
          <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-xs font-medium">
            {chain.delegation?.toName}
          </span>
          {hasResult ? (
            isError ? (
              <Badge variant="secondary" className="text-[9px] text-red-600">
                Error
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="text-[9px] text-emerald-700"
              >
                Complete
              </Badge>
            )
          ) : (
            <div className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin text-amber-700" />
              <span className="text-[9px] text-amber-700">In Progress</span>
            </div>
          )}
          {chain.delegation && (
            <span className="text-[10px] text-muted-foreground/50 ml-auto">
              {new Date(chain.delegation._creationTime).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1 ml-5 line-clamp-1">
          {chain.delegation?.content}
        </p>
      </button>

      {/* Expanded: show all messages in chain */}
      {expanded && (
        <div className="ml-4 border-l border-border/30">
          {chain.messages.map((comm) => (
            <CommunicationRow key={comm._id} comm={comm} />
          ))}
        </div>
      )}
    </div>
  );
}

function CommunicationRow({ comm }: { comm: Doc<"agentCommunications"> }) {
  const config =
    MESSAGE_TYPE_CONFIG[comm.messageType] || MESSAGE_TYPE_CONFIG.info;
  const TypeIcon = config.icon;
  const timestamp = new Date(comm._creationTime).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={cn("px-4 py-3 border-l-2", config.bgColor)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <TypeIcon className={cn("h-3.5 w-3.5 shrink-0", config.color)} />
          <span className="text-xs font-medium">{comm.fromName}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          <span className="text-xs font-medium">{comm.toName}</span>
          <Badge
            variant="secondary"
            className={cn("text-[9px]", config.color)}
          >
            {config.label}
          </Badge>
        </div>
        <span className="text-[10px] text-muted-foreground/50 shrink-0">
          {timestamp}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3">
        {comm.content}
      </p>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 rounded text-[10px] font-medium transition-all",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        color && active ? color : ""
      )}
    >
      {label}
    </button>
  );
}
