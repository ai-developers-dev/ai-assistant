"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ExternalLink, X, Check, AlertCircle } from "lucide-react";

interface OAuthConnectDialogProps {
  provider: string;
  providerName: string;
  organizationId: string;
  onSuccess: () => void;
  onClose: () => void;
}

type FlowStep = "init" | "waiting" | "paste" | "exchanging" | "success" | "error";

export function OAuthConnectDialog({
  provider,
  providerName,
  organizationId,
  onSuccess,
  onClose,
}: OAuthConnectDialogProps) {
  const [step, setStep] = useState<FlowStep>("init");
  const [authUrl, setAuthUrl] = useState("");
  const [state, setState] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState("");

  const startOAuth = async () => {
    setStep("init");
    setError("");
    try {
      const res = await fetch("/api/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setStep("error");
        return;
      }

      setAuthUrl(data.authUrl);
      setState(data.state);

      // Open popup
      const popup = window.open(
        data.authUrl,
        `oauth-${provider}`,
        "width=600,height=700,scrollbars=yes,resizable=yes"
      );

      if (!popup) {
        // Popup blocked — show link instead
        setStep("paste");
        return;
      }

      setStep("waiting");

      // Poll for popup closure
      const interval = setInterval(() => {
        if (popup.closed) {
          clearInterval(interval);
          setStep("paste");
        }
      }, 500);
    } catch (err: any) {
      setError(err.message || "Failed to start OAuth flow");
      setStep("error");
    }
  };

  const exchangeCode = async () => {
    if (!codeInput.trim()) return;
    setStep("exchanging");
    setError("");
    try {
      const res = await fetch("/api/oauth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          code: codeInput.trim(),
          state,
          organizationId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStep("success");
        setTimeout(() => onSuccess(), 1500);
      } else {
        setError(data.error || "Failed to exchange authorization code.");
        setStep("error");
      }
    } catch (err: any) {
      setError(err.message || "Failed to exchange code.");
      setStep("error");
    }
  };

  // Listen for postMessage from OAuth callback popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "oauth_callback" && event.data?.code) {
        setCodeInput(event.data.code);
        // Auto-exchange immediately
        setStep("exchanging");
        fetch("/api/oauth/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            code: event.data.code,
            state,
            organizationId,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              setStep("success");
              setTimeout(() => onSuccess(), 1500);
            } else {
              setError(data.error || "Failed to exchange authorization code.");
              setStep("error");
            }
          })
          .catch((err) => {
            setError(err.message || "Failed to exchange code.");
            setStep("error");
          });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [provider, state, organizationId, onSuccess]);

  // Auto-start on mount (once)
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      startOAuth();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 rounded-xl border border-border bg-card shadow-2xl p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="text-lg font-semibold mb-1">Connect to {providerName}</h3>

        {step === "init" && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Preparing authorization...</p>
          </div>
        )}

        {step === "waiting" && (
          <div className="space-y-4 mt-4">
            <div className="flex flex-col items-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground text-center">
                Complete the authorization in the popup window...
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Popup didn't open?{" "}
              <a
                href={authUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
                onClick={() => setStep("paste")}
              >
                Open manually
              </a>
            </p>
          </div>
        )}

        {step === "paste" && (
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              After authorizing, copy the authorization code from the URL bar and paste it below.
            </p>

            {authUrl && (
              <a
                href={authUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Open authorization page
              </a>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Authorization Code
              </label>
              <Input
                placeholder="Paste the code here..."
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") exchangeCode();
                }}
                autoFocus
                className="font-mono text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={exchangeCode}
                disabled={!codeInput.trim()}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Connect
              </Button>
            </div>
          </div>
        )}

        {step === "exchanging" && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Exchanging authorization code...</p>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 mb-3">
              <Check className="h-6 w-6 text-emerald-700" />
            </div>
            <p className="text-sm font-medium text-emerald-700">Connected successfully!</p>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4 mt-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="outline" size="sm" onClick={startOAuth}>
                Try Again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
