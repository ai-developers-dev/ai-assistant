"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  EyeOff,
  Check,
  X,
  Trash2,
  ExternalLink,
  Loader2,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { OAuthConnectDialog } from "./oauth-connect-dialog";

export interface ProviderCardProps {
  provider: string;
  name: string;
  icon?: React.ReactNode;
  connected: boolean;
  connectionType: "oauth" | "api_key" | null;
  supportsOAuth: boolean;
  keyPlaceholder: string;
  docsUrl: string;
  organizationId: string;
  onUpdate: () => void;
  onFeedback: (type: "success" | "error", message: string) => void;
  /** When true, shows two fields (email + password) that get joined as "email|password" */
  twoFieldMode?: boolean;
  emailPlaceholder?: string;
  passwordPlaceholder?: string;
  /** When true (requires twoFieldMode), shows a third URL field joined as "email|password|url" */
  urlFieldMode?: boolean;
  urlPlaceholder?: string;
  /** Pre-populate the URL field with this value when entering edit mode */
  initialUrl?: string;
  /** Replace the default "Test" button with a custom component (e.g. NatGenLoginTest) */
  testComponent?: React.ReactNode;
}

export function ProviderCard({
  provider,
  name,
  icon,
  connected,
  connectionType,
  supportsOAuth,
  keyPlaceholder,
  docsUrl,
  organizationId,
  onUpdate,
  onFeedback,
  twoFieldMode = false,
  emailPlaceholder = "you@gmail.com",
  passwordPlaceholder = "App password",
  urlFieldMode = false,
  urlPlaceholder = "https://...",
  initialUrl,
  testComponent,
}: ProviderCardProps) {
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showOAuthDialog, setShowOAuthDialog] = useState(false);

  const handleSaveKey = async () => {
    const apiKey = twoFieldMode
      ? urlFieldMode
        // Preserve existing URL if user left the field blank (don't wipe it)
        ? `${emailInput.trim()}|${passwordInput.trim()}|${urlInput.trim() || initialUrl || ""}`
        : `${emailInput.trim()}|${passwordInput.trim()}`
      : keyInput.trim();
    if (!apiKey || (twoFieldMode && (!emailInput.trim() || !passwordInput.trim()))) return;
    setSaving(true);
    try {
      const res = await fetch("/api/provider-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey, organizationId }),
      });
      const data = await res.json();
      if (data.success) {
        onFeedback("success", `${name} saved successfully.`);
        setKeyInput("");
        setEmailInput("");
        setPasswordInput("");
        setUrlInput("");
        setShowKeyInput(false);
        setEditMode(false);
        setShowKey(false);
        onUpdate();
      } else {
        onFeedback("error", data.error || "Failed to save.");
      }
    } catch (err: any) {
      onFeedback("error", err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const body: Record<string, string> = { provider };
      if (keyInput.trim()) {
        body.apiKey = keyInput.trim();
      } else {
        body.organizationId = organizationId;
      }
      const res = await fetch("/api/provider-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.valid) {
        onFeedback("success", `${name} connection is working.`);
      } else {
        onFeedback("error", data.error || `${name} connection test failed.`);
      }
    } catch (err: any) {
      onFeedback("error", err.message || "Test failed.");
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/provider-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, organizationId }),
      });
      const data = await res.json();
      if (data.success) {
        onFeedback("success", `${name} disconnected.`);
        onUpdate();
      } else {
        onFeedback("error", data.error || "Failed to disconnect.");
      }
    } catch (err: any) {
      onFeedback("error", err.message || "Failed to disconnect.");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleOAuthSuccess = () => {
    setShowOAuthDialog(false);
    onUpdate();
    onFeedback("success", `Connected to ${name} via OAuth.`);
  };

  return (
    <>
      <div className="p-3 rounded-lg bg-muted/30 border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{name}</p>
                {connected && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <Wifi className="h-2.5 w-2.5" />
                    {connectionType === "oauth" ? "OAuth" : "API Key"}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {connected ? (
                  <span className="text-emerald-700">Connected</span>
                ) : (
                  "Not connected"
                )}
              </p>
              {connected && initialUrl && (
                <p className="text-[10px] text-muted-foreground truncate max-w-55">{initialUrl}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {connected && (
              <>
                {/* Custom test component (e.g. NatGen login test) OR generic test */}
                {testComponent ?? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleTest}
                    disabled={testing}
                  >
                    {testing ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Check className="h-3 w-3 mr-1" />
                    )}
                    Test
                  </Button>
                )}
                {/* Edit button — lets you update saved credentials */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { setEditMode(true); setShowKeyInput(true); if (initialUrl) setUrlInput(initialUrl); }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="h-3 w-3 mr-1" />
                  )}
                  Disconnect
                </Button>
              </>
            )}
            {!connected && supportsOAuth && (
              <Button
                variant="default"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowOAuthDialog(true)}
              >
                Connect with OAuth
              </Button>
            )}
            {!connected && !supportsOAuth && !showKeyInput && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowKeyInput(true)}
              >
                Add Key
              </Button>
            )}
          </div>
        </div>

        {/* API Key input section */}
        {!connected && supportsOAuth && !showKeyInput && (
          <button
            className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            onClick={() => { setShowKeyInput(!showKeyInput); if (initialUrl && !showKeyInput) setUrlInput(initialUrl); }}
          >
            <ChevronDown className="h-3 w-3" />
            Or use API key
          </button>
        )}

        {(showKeyInput || editMode) && twoFieldMode && (
          <div className="mt-3 space-y-2">
            {editMode && (
              <p className="text-xs text-muted-foreground">Enter new credentials to replace the saved ones:</p>
            )}
            <Input
              type="text"
              placeholder={emailPlaceholder}
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setShowKeyInput(false); setEditMode(false); setEmailInput(""); setPasswordInput(""); }
              }}
              autoFocus
              className="text-sm"
            />
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                placeholder={passwordPlaceholder}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !urlFieldMode) handleSaveKey();
                  if (e.key === "Escape") { setShowKeyInput(false); setEditMode(false); setEmailInput(""); setPasswordInput(""); setUrlInput(""); setShowKey(false); }
                }}
                className="pr-9 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {urlFieldMode && (
              <Input
                type="text"
                placeholder={urlPlaceholder}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveKey();
                  if (e.key === "Escape") { setShowKeyInput(false); setEditMode(false); setEmailInput(""); setPasswordInput(""); setUrlInput(""); setShowKey(false); }
                }}
                className="text-sm"
              />
            )}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleSaveKey}
                disabled={!emailInput.trim() || !passwordInput.trim() || saving}
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                {editMode ? "Update Credentials" : "Save"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => { setShowKeyInput(false); setEditMode(false); setEmailInput(""); setPasswordInput(""); setUrlInput(""); setShowKey(false); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {(showKeyInput || editMode) && !twoFieldMode && (
          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? "text" : "password"}
                placeholder={keyPlaceholder}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveKey();
                  if (e.key === "Escape") {
                    setShowKeyInput(false);
                    setKeyInput("");
                    setShowKey(false);
                  }
                }}
                autoFocus
                className="pr-9 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {keyInput.trim() && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
              </Button>
            )}
            <Button size="sm" className="h-8 text-xs" onClick={handleSaveKey} disabled={!keyInput.trim() || saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => { setShowKeyInput(false); setKeyInput(""); setShowKey(false); }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Docs link */}
        {(showKeyInput || editMode) && (
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            {twoFieldMode ? `Generate app password for ${name}` : `Get API key from ${name}`}
          </a>
        )}
      </div>

      {/* OAuth Dialog */}
      {showOAuthDialog && (
        <OAuthConnectDialog
          provider={provider}
          providerName={name}
          organizationId={organizationId}
          onSuccess={handleOAuthSuccess}
          onClose={() => setShowOAuthDialog(false)}
        />
      )}
    </>
  );
}
