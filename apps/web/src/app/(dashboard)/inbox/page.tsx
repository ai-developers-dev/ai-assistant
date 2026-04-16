"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { useImpersonation } from "@/hooks/use-impersonation";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  MessageSquare,
  Star,
  ThumbsUp,
  ThumbsDown,
  Flame,
  Snowflake,
  AlertTriangle,
  BotMessageSquare,
  CheckCircle2,
  Loader2,
  Inbox as InboxIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const CLASSIFICATION_OPTIONS = [
  { value: "hot" as const, label: "Hot", icon: Flame, color: "text-red-600", bg: "bg-red-500/10 border-red-500/30 hover:bg-red-500/20" },
  { value: "warm" as const, label: "Warm", icon: ThumbsUp, color: "text-amber-700", bg: "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20" },
  { value: "objection" as const, label: "Objection", icon: AlertTriangle, color: "text-orange-700", bg: "bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20" },
  { value: "cold" as const, label: "Cold", icon: Snowflake, color: "text-blue-700", bg: "bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20" },
];

const CLASSIFICATION_BADGE_STYLES: Record<string, string> = {
  hot: "bg-red-500/20 text-red-600 border-red-500/30",
  warm: "bg-amber-500/20 text-amber-700 border-amber-500/30",
  objection: "bg-orange-500/20 text-orange-700 border-orange-500/30",
  cold: "bg-blue-500/20 text-blue-700 border-blue-500/30",
  auto_reply: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

export default function InboxPage() {
  const { org } = useEffectiveOrg();
  const { orgId: impersonatedOrgId } = useImpersonation();
  const effectiveOrgId = org?._id || (impersonatedOrgId as any) || null;

  const responders = useQuery(
    api.businesses.getResponders,
    effectiveOrgId ? { organizationId: effectiveOrgId } : "skip"
  );

  const updateClassification = useMutation(api.businesses.updateReplyClassification);
  const updatePipeline = useMutation(api.businesses.updatePipelineStage);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleClassify = async (
    businessId: Id<"businesses">,
    classification: "hot" | "warm" | "objection" | "cold"
  ) => {
    const key = `${businessId}-${classification}`;
    setLoadingAction(key);
    try {
      await updateClassification({ id: businessId, replyClassification: classification });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleQualify = async (businessId: Id<"businesses">) => {
    const key = `${businessId}-qualify`;
    setLoadingAction(key);
    try {
      await updatePipeline({ id: businessId, pipelineStage: "qualified" });
    } finally {
      setLoadingAction(null);
    }
  };

  const getReplyDate = (biz: any) => {
    return Math.max(
      biz.outreachStatus?.emailRepliedAt ?? 0,
      biz.outreachStatus?.metaRepliedAt ?? 0,
      biz.outreachStatus?.linkedinRepliedAt ?? 0
    );
  };

  const getReplyChannels = (biz: any) => {
    const channels: string[] = [];
    if (biz.outreachStatus?.emailRepliedAt) channels.push("Email");
    if (biz.outreachStatus?.metaRepliedAt) channels.push("Meta");
    if (biz.outreachStatus?.linkedinRepliedAt) channels.push("LinkedIn");
    return channels;
  };

  const formatDate = (ts: number) => {
    const date = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (!effectiveOrgId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">Select an organization to view replies.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <InboxIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Reply Inbox</h1>
            <p className="text-xs text-muted-foreground">
              {responders === undefined
                ? "Loading..."
                : `${responders.length} ${responders.length === 1 ? "reply" : "replies"}`}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {responders === undefined && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {responders && responders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <InboxIcon className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm font-medium">No replies yet</p>
            <p className="text-xs text-muted-foreground/80 max-w-md text-center">
              When a business responds to your outreach, their reply — classified
              as hot, warm, objection, or cold — appears here.
            </p>
            <a
              href="/leads"
              className="mt-2 text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              View your outreach pipeline →
            </a>
          </div>
        )}

        {responders && responders.length > 0 && (
          <div className="space-y-3">
            {responders.map((biz) => {
              const replyDate = getReplyDate(biz);
              const channels = getReplyChannels(biz);
              const isExpanded = expandedId === biz._id;
              const lastEmail = biz.sentEmails?.length
                ? biz.sentEmails[biz.sentEmails.length - 1]
                : null;

              return (
                <div
                  key={biz._id}
                  className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80"
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground truncate">
                          {biz.name}
                        </h3>
                        {biz.replyClassification && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${CLASSIFICATION_BADGE_STYLES[biz.replyClassification] ?? ""}`}
                          >
                            {biz.replyClassification === "auto_reply" ? "Auto-Reply" : biz.replyClassification}
                          </Badge>
                        )}
                        {biz.pipelineStage === "qualified" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 bg-emerald-500/20 text-emerald-700 border-emerald-500/30"
                          >
                            Qualified
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {biz.ownerName && (
                          <span>{biz.ownerName}</span>
                        )}
                        {biz.address?.city && (
                          <span>{biz.address.city}, {biz.address.state}</span>
                        )}
                        {biz.rating && (
                          <span className="flex items-center gap-0.5">
                            <Star className="h-3 w-3 text-amber-700 fill-amber-400" />
                            {biz.rating}
                          </span>
                        )}
                        {biz.leadScore !== undefined && biz.leadScore !== null && (
                          <span className="text-primary font-medium">
                            Score: {biz.leadScore}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        {channels.map((ch) => (
                          <Badge
                            key={ch}
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 bg-muted/50 text-muted-foreground border-border"
                          >
                            {ch === "Email" && <Mail className="h-2.5 w-2.5 mr-1" />}
                            {ch === "Meta" && <MessageSquare className="h-2.5 w-2.5 mr-1" />}
                            {ch === "LinkedIn" && <MessageSquare className="h-2.5 w-2.5 mr-1" />}
                            {ch} reply
                          </Badge>
                        ))}
                        <span className="text-[10px] text-muted-foreground/60">
                          {formatDate(replyDate)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sent email preview (expandable) */}
                  {lastEmail && (
                    <div className="mt-3">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : biz._id)}
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        Original email sent
                      </button>
                      {isExpanded && (
                        <div className="mt-2 rounded-md border border-border/60 bg-muted/30 p-3">
                          <p className="text-[11px] font-medium text-foreground/80 mb-1">
                            Subject: {lastEmail.subject}
                          </p>
                          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                            {lastEmail.body}
                          </p>
                          <p className="text-[10px] text-muted-foreground/50 mt-2">
                            Sent {new Date(lastEmail.sentAt).toLocaleString()} via {lastEmail.provider}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {CLASSIFICATION_OPTIONS.map((opt) => {
                      const isActive = biz.replyClassification === opt.value;
                      const isLoading = loadingAction === `${biz._id}-${opt.value}`;
                      return (
                        <Button
                          key={opt.value}
                          variant="outline"
                          size="sm"
                          disabled={isLoading}
                          onClick={() => handleClassify(biz._id, opt.value)}
                          className={`h-7 text-[11px] gap-1.5 border ${
                            isActive
                              ? opt.bg
                              : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                          }`}
                        >
                          {isLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <opt.icon className={`h-3 w-3 ${isActive ? opt.color : ""}`} />
                          )}
                          {opt.label}
                        </Button>
                      );
                    })}

                    <div className="w-px h-5 bg-border mx-1" />

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        biz.pipelineStage === "qualified" ||
                        loadingAction === `${biz._id}-qualify`
                      }
                      onClick={() => handleQualify(biz._id)}
                      className={`h-7 text-[11px] gap-1.5 ${
                        biz.pipelineStage === "qualified"
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-emerald-500/30 hover:bg-emerald-500/10"
                      }`}
                    >
                      {loadingAction === `${biz._id}-qualify` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      {biz.pipelineStage === "qualified" ? "Qualified" : "Mark as Qualified"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
