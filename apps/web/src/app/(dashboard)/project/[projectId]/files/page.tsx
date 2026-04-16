"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { api } from "../../../../../../convex/_generated/api";
import { FileUpload } from "@/components/files/file-upload";
import { ArtifactPreview } from "@/components/artifacts/artifact-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  FileCode2,
  FileText,
  Table,
  Globe,
  Presentation,
  GitBranch,
  File,
  Upload as UploadIcon,
  Download,
  Trash2,
  Loader2,
  Image,
} from "lucide-react";
import { useState, useCallback } from "react";
import type { Id } from "../../../../../../convex/_generated/dataModel";

type TabFilter = "all" | "uploads" | "generated";

const TYPE_ICONS: Record<string, typeof FileCode2> = {
  code: FileCode2,
  document: FileText,
  spreadsheet: Table,
  html: Globe,
  slides: Presentation,
  diagram: GitBranch,
  other: File,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function FilesPage() {
  const params = useParams();
  const projectId = params.projectId as Id<"projects">;
  const { org, effectiveClerkOrgId, isImpersonating } = useEffectiveOrg();
  const { user } = useUser();
  const [tab, setTab] = useState<TabFilter>("all");
  const [showUpload, setShowUpload] = useState(false);
  const [previewArtifact, setPreviewArtifact] = useState<any>(null);

  const convexUser = useQuery(
    api.users.getCurrent,
    user?.id && effectiveClerkOrgId
      ? { clerkUserId: user.id, clerkOrgId: effectiveClerkOrgId }
      : "skip"
  );
  const project = useQuery(api.projects.getById, { projectId });
  const artifacts = useQuery(api.artifacts.listByProject, { projectId });
  const files = useQuery(api.files.listByProject, { projectId });
  const storageUsage = useQuery(
    api.files.getStorageUsage,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const removeArtifact = useMutation(api.artifacts.remove);
  const removeFile = useMutation(api.files.remove);

  const handleDeleteArtifact = useCallback(
    async (artifactId: Id<"artifacts">) => {
      if (confirm("Delete this artifact?")) {
        await removeArtifact({ artifactId });
      }
    },
    [removeArtifact]
  );

  const handleDeleteFile = useCallback(
    async (fileId: Id<"files">) => {
      if (confirm("Delete this file?")) {
        await removeFile({ fileId });
      }
    },
    [removeFile]
  );

  if (!project || artifacts === undefined || files === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Combine artifacts and files into a unified list
  const allItems: Array<{
    id: string;
    kind: "artifact" | "file";
    name: string;
    type?: string;
    language?: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: number;
    source: "generated" | "upload";
    data: any;
  }> = [];

  for (const a of artifacts || []) {
    allItems.push({
      id: a._id,
      kind: "artifact",
      name: a.title,
      type: a.type,
      language: a.language,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      createdAt: a._creationTime,
      source: "generated",
      data: a,
    });
  }

  for (const f of files || []) {
    allItems.push({
      id: f._id,
      kind: "file",
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      createdAt: f._creationTime,
      source: f.source as "generated" | "upload",
      data: f,
    });
  }

  // Sort by creation time, newest first
  allItems.sort((a, b) => b.createdAt - a.createdAt);

  // Filter by tab
  const filtered = allItems.filter((item) => {
    if (tab === "uploads") return item.source === "upload";
    if (tab === "generated") return item.source === "generated";
    return true;
  });

  const usagePercent = storageUsage
    ? Math.min(100, (storageUsage.usedBytes / storageUsage.maxBytes) * 100)
    : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/50">
        <div className="flex items-center gap-3">
          <Link href={`/project/${projectId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="font-semibold text-sm">{project.name} — Files</h2>
            {storageUsage && (
              <p className="text-[10px] text-muted-foreground">
                {formatBytes(storageUsage.usedBytes)} / {formatBytes(storageUsage.maxBytes)} used
              </p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setShowUpload(!showUpload)}
        >
          <UploadIcon className="h-3.5 w-3.5" />
          Upload
        </Button>
      </div>

      {/* Storage bar */}
      {storageUsage && (
        <div className="px-4 py-2 border-b border-border">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload zone */}
      {showUpload && org?._id && (convexUser?._id || isImpersonating) && (
        <div className="px-4 py-3 border-b border-border">
          <FileUpload
            organizationId={org._id}
            projectId={projectId}
            userId={convexUser!._id}
            onUploadComplete={() => setShowUpload(false)}
            onClose={() => setShowUpload(false)}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
        {(["all", "uploads", "generated"] as TabFilter[]).map((t) => (
          <Button
            key={t}
            variant={tab === t ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs capitalize"
            onClick={() => setTab(t)}
          >
            {t}
            {t === "all" && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                {allItems.length}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {/* File grid */}
      <div className="flex-1 overflow-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <File className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No files yet</p>
            <p className="text-xs mt-1">
              Files created by agents or uploaded by you will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((item) => {
              const Icon =
                item.kind === "artifact"
                  ? TYPE_ICONS[item.type || "other"] || File
                  : item.mimeType.startsWith("image/")
                    ? Image
                    : File;

              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-border bg-background/50 hover:bg-muted/30 transition-colors overflow-hidden"
                >
                  <div className="flex items-center gap-3 px-3 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.language && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {item.language}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {formatBytes(item.sizeBytes)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDate(item.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
                    {item.kind === "artifact" && item.data.content && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setPreviewArtifact(item.data)}
                      >
                        Preview
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      asChild
                    >
                      <a
                        href={
                          item.kind === "artifact"
                            ? `/api/files/download?artifactId=${item.id}`
                            : `/api/files/download?fileId=${item.id}`
                        }
                        download
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive gap-1 ml-auto"
                      onClick={() =>
                        item.kind === "artifact"
                          ? handleDeleteArtifact(item.id as Id<"artifacts">)
                          : handleDeleteFile(item.id as Id<"files">)
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewArtifact && (
        <ArtifactPreview
          artifact={previewArtifact}
          onClose={() => setPreviewArtifact(null)}
        />
      )}
    </div>
  );
}
