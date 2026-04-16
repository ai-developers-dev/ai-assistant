"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Image,
  FileText,
  Presentation,
  MessageCircle,
  Table,
  Globe,
  Video,
  Wrench,
} from "lucide-react";
import type { AgentConfig } from "@/lib/agents/registry";

const ICON_MAP: Record<string, any> = {
  Sparkles,
  Image,
  FileText,
  Presentation,
  MessageCircle,
  Table,
  Globe,
  Video,
  Wrench,
};

const COLOR_BG_MAP: Record<string, string> = {
  "text-violet-400": "bg-violet-500/10 group-hover:bg-violet-500/20",
  "text-pink-400": "bg-pink-500/10 group-hover:bg-pink-500/20",
  "text-blue-700": "bg-blue-500/10 group-hover:bg-blue-500/20",
  "text-orange-700": "bg-orange-500/10 group-hover:bg-orange-500/20",
  "text-green-700": "bg-green-500/10 group-hover:bg-green-500/20",
  "text-emerald-700": "bg-emerald-500/10 group-hover:bg-emerald-500/20",
  "text-cyan-400": "bg-cyan-500/10 group-hover:bg-cyan-500/20",
  "text-red-600": "bg-red-500/10 group-hover:bg-red-500/20",
  "text-amber-700": "bg-amber-500/10 group-hover:bg-amber-500/20",
};

const COLOR_BORDER_MAP: Record<string, string> = {
  "text-violet-400": "group-hover:border-violet-500/30",
  "text-pink-400": "group-hover:border-pink-500/30",
  "text-blue-700": "group-hover:border-blue-500/30",
  "text-orange-700": "group-hover:border-orange-500/30",
  "text-green-700": "group-hover:border-green-500/30",
  "text-emerald-700": "group-hover:border-emerald-500/30",
  "text-cyan-400": "group-hover:border-cyan-500/30",
  "text-red-600": "group-hover:border-red-500/30",
  "text-amber-700": "group-hover:border-amber-500/30",
};

interface AgentCategoryCardProps {
  agent: AgentConfig;
  onClick: () => void;
}

export function AgentCategoryCard({ agent, onClick }: AgentCategoryCardProps) {
  const Icon = ICON_MAP[agent.icon] || Sparkles;
  const bgClass = COLOR_BG_MAP[agent.color] || "bg-muted";
  const borderClass = COLOR_BORDER_MAP[agent.color] || "";

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-start gap-3 rounded-xl border border-border/60 bg-card/80 p-5 text-left",
        "transition-all duration-200 hover:bg-card hover:shadow-lg hover:shadow-black/10 hover:-translate-y-0.5",
        borderClass
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
          bgClass,
          agent.color
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold text-sm text-foreground">{agent.name}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {agent.description}
        </p>
      </div>
      {agent.proOnly && (
        <Badge
          variant="secondary"
          className="absolute top-3 right-3 text-[9px] px-1.5 py-0 bg-primary/15 text-primary border-0 font-semibold"
        >
          PRO
        </Badge>
      )}
    </button>
  );
}
