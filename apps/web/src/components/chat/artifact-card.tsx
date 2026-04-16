"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileCode2,
  FileText,
  Table,
  Globe,
  Presentation,
  GitBranch,
  File,
  Copy,
  Eye,
  Download,
  Check,
  ExternalLink,
  Monitor,
  Tablet,
  Smartphone,
  X,
} from "lucide-react";
import { useState, useCallback } from "react";
import { cn, prepareHtmlForIframe } from "@/lib/utils";

interface ArtifactData {
  __artifact: boolean;
  _cacheId?: string;
  title: string;
  type: string;
  language?: string;
  content: string;
  fullSize?: number;
  mimeType: string;
  sizeBytes: number;
}

interface ArtifactCardProps {
  artifact: ArtifactData;
  projectId?: string;
  onPreview?: () => void;
}

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
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArtifactCard({ artifact, projectId, onPreview }: ArtifactCardProps) {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const Icon = TYPE_ICONS[artifact.type] || File;

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [artifact.content]);

  const handleDownload = useCallback(() => {
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

  const handlePreview = useCallback(() => {
    if (onPreview) {
      onPreview();
    } else {
      setShowPreview(true);
    }
  }, [onPreview]);

  return (
    <>
      <div className="my-2 rounded-lg border border-border bg-background/50 overflow-hidden max-w-md">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{artifact.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {artifact.language && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {artifact.language}
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground">
                {formatBytes(artifact.fullSize || artifact.sizeBytes)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
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
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handlePreview}
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
          {artifact.type === "html" && projectId && (
            <a
              href={`/project/${projectId}/view`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5"
              >
                <ExternalLink className="h-3 w-3" />
                View
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Inline preview modal */}
      {showPreview && (
        <ArtifactPreviewInline
          artifact={artifact}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}

type PreviewViewport = "desktop" | "tablet" | "mobile";

const PREVIEW_VIEWPORT_WIDTHS: Record<PreviewViewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

function ArtifactPreviewInline({
  artifact,
  onClose,
}: {
  artifact: ArtifactData;
  onClose: () => void;
}) {
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");
  const isHtml = artifact.type === "html";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className={cn(
          "relative mx-4 rounded-xl border border-border bg-background shadow-2xl flex flex-col overflow-hidden",
          isHtml ? "w-[95vw] max-w-7xl h-[90vh]" : "w-full max-w-3xl max-h-[80vh]"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{artifact.title}</span>
            {artifact.language && (
              <Badge variant="secondary" className="text-[10px]">
                {artifact.language}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Viewport switcher — only for HTML */}
            {isHtml && (
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
            )}

            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto flex items-start justify-center bg-muted/10 p-4">
          {isHtml ? (
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
                srcDoc={prepareHtmlForIframe(artifact.content)}
                className="w-full h-full"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                title={artifact.title}
              />
            </div>
          ) : artifact.type === "spreadsheet" ? (
            <CsvTable content={artifact.content} />
          ) : (
            <pre className="text-sm font-mono whitespace-pre-wrap break-words">
              {artifact.content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function CsvTable({ content }: { content: string }) {
  const rows = content.split("\n").filter(Boolean).map((row) => row.split(","));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Empty spreadsheet</p>;

  const [header, ...body] = rows;

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                className="text-left px-3 py-2 border border-border bg-muted/50 font-medium"
              >
                {cell.trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 border border-border">
                  {cell.trim()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
