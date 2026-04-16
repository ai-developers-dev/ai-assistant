"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, X, Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";
import { prepareHtmlForIframe } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ArtifactPreviewProps {
  artifact: {
    title: string;
    type: string;
    language?: string;
    content: string;
    mimeType: string;
    sizeBytes: number;
  };
  onClose: () => void;
}

export function ArtifactPreview({ artifact, onClose }: ArtifactPreviewProps) {
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[85vh] mx-4 rounded-xl border border-border bg-background shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{artifact.title}</span>
            {artifact.language && (
              <Badge variant="secondary" className="text-[10px]">
                {artifact.language}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] capitalize">
              {artifact.type}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
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
              className="h-7 gap-1.5 text-xs"
              onClick={handleDownload}
            >
              <Download className="h-3 w-3" />
              Download
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <PreviewContent artifact={artifact} />
        </div>
      </div>
    </div>
  );
}

function PreviewContent({
  artifact,
}: {
  artifact: ArtifactPreviewProps["artifact"];
}) {
  switch (artifact.type) {
    case "html":
      return (
        <iframe
          srcDoc={prepareHtmlForIframe(artifact.content)}
          className="w-full h-full min-h-[500px] rounded border border-border bg-white"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          title={artifact.title}
        />
      );

    case "spreadsheet":
      return <CsvPreview content={artifact.content} />;

    case "document":
    case "slides":
      return (
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {artifact.content}
          </ReactMarkdown>
        </div>
      );

    case "code":
      return (
        <pre className="rounded-lg bg-muted/30 border border-border p-4 overflow-auto">
          <code className="text-sm font-mono whitespace-pre">
            {artifact.content}
          </code>
        </pre>
      );

    default:
      return (
        <pre className="text-sm font-mono whitespace-pre-wrap break-words">
          {artifact.content}
        </pre>
      );
  }
}

function CsvPreview({ content }: { content: string }) {
  const rows = content
    .split("\n")
    .filter(Boolean)
    .map((row) => row.split(","));

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Empty spreadsheet</p>;
  }

  const [header, ...body] = rows;

  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                className="text-left px-3 py-2 border-b border-border bg-muted/50 font-medium sticky top-0"
              >
                {cell.trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.slice(0, 100).map((row, i) => (
            <tr key={i} className="hover:bg-muted/20">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-3 py-1.5 border-b border-border/50"
                >
                  {cell.trim()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {body.length > 100 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Showing first 100 of {body.length} rows
        </p>
      )}
    </div>
  );
}
