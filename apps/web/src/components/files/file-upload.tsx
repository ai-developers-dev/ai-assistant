"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Upload, Loader2, CheckCircle2, X, File } from "lucide-react";
import { useState, useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface FileUploadProps {
  organizationId: Id<"organizations">;
  projectId?: Id<"projects">;
  userId: Id<"users">;
  onUploadComplete?: (fileId: Id<"files">) => void;
  onClose?: () => void;
  compact?: boolean;
}

type UploadState = "idle" | "uploading" | "success" | "error";

export function FileUpload({
  organizationId,
  projectId,
  userId,
  onUploadComplete,
  onClose,
  compact = false,
}: FileUploadProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveUploadedFile = useMutation(api.files.saveUploadedFile);

  const uploadFile = useCallback(
    async (file: File) => {
      setState("uploading");
      setProgress(`Uploading ${file.name}...`);
      setError("");

      try {
        // Step 1: Get upload URL from Convex
        const uploadUrl = await generateUploadUrl();

        // Step 2: Upload file to Convex storage
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!result.ok) {
          throw new Error("Upload failed");
        }

        const { storageId } = await result.json();

        // Step 3: Save file record
        setProgress("Saving file record...");
        const fileId = await saveUploadedFile({
          organizationId,
          projectId,
          uploadedBy: userId,
          storageId,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        });

        setState("success");
        setProgress(`${file.name} uploaded successfully`);
        onUploadComplete?.(fileId);

        // Reset after brief success state
        setTimeout(() => {
          setState("idle");
          setProgress("");
        }, 2000);
      } catch (err: any) {
        setState("error");
        setError(err.message || "Upload failed");
      }
    },
    [generateUploadUrl, saveUploadedFile, organizationId, projectId, userId, onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => inputRef.current?.click()}
          disabled={state === "uploading"}
        >
          {state === "uploading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
        </Button>
      </>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border-2 border-dashed p-6 text-center transition-colors",
        dragOver
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50",
        state === "error" && "border-destructive/50"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
      />

      {state === "idle" && (
        <>
          <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">Drop files here or click to upload</p>
          <p className="text-xs text-muted-foreground mb-3">
            Supports any file type up to your plan's storage limit
          </p>
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            Choose File
          </Button>
        </>
      )}

      {state === "uploading" && (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{progress}</p>
        </div>
      )}

      {state === "success" && (
        <div className="flex flex-col items-center gap-2">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
          <p className="text-sm text-green-500">{progress}</p>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col items-center gap-2">
          <X className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setState("idle");
              setError("");
            }}
          >
            Try Again
          </Button>
        </div>
      )}

      {onClose && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={onClose}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}
