"use client";

import type { Doc } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Bot,
  Sparkles,
  Zap,
  Globe,
  Code,
  Search,
  FileText,
  BarChart,
  Video,
  Presentation,
  Image,
  Settings,
  Target,
  TrendingUp,
  Share2,
  Megaphone,
  Headphones,
} from "lucide-react";
import Link from "next/link";

const ICON_MAP: Record<string, any> = {
  Bot,
  Sparkles,
  Zap,
  Globe,
  Code,
  Search,
  FileText,
  BarChart,
  Video,
  Presentation,
  Image,
  Target,
  TrendingUp,
  Share2,
  Megaphone,
  Headphones,
};

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-emerald-500",
  working: "bg-amber-500 animate-pulse",
  delegating: "bg-blue-500 animate-pulse",
};

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  working: "Working",
  delegating: "Delegating",
};

interface MainAgentCardProps {
  team: Doc<"agentTeams">;
}

export function MainAgentCard({ team }: MainAgentCardProps) {
  const AvatarIcon = ICON_MAP[team.avatar || "Bot"] || Bot;

  return (
    <div className="rounded-xl border border-border bg-card/80 p-5">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <AvatarIcon className="h-6 w-6 text-primary" />
        </div>

        {/* Name + Status */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold truncate">{team.name}</h2>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  STATUS_COLORS[team.status] || STATUS_COLORS.idle
                )}
              />
              <span className="text-[11px] text-muted-foreground">
                {STATUS_LABELS[team.status] || "Idle"}
              </span>
            </div>
          </div>
          {team.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {team.description}
            </p>
          )}
        </div>
      </div>

      {team.currentTask && team.status !== "idle" && (
        <p className="text-xs text-muted-foreground/70 mt-2 italic truncate">
          {team.currentTask}
        </p>
      )}

      {/* Footer: badges + configure */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/40">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[9px] text-muted-foreground/60">
            {team.modelId.split("/").pop()}
          </Badge>
          <Badge variant="secondary" className="text-[9px]">
            Swarm Leader
          </Badge>
        </div>
        <Link
          href="/settings"
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50"
        >
          <Settings className="h-3 w-3" />
          Configure
        </Link>
      </div>
    </div>
  );
}
