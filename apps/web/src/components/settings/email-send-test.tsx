"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, CheckCircle, XCircle } from "lucide-react";

interface EmailSendTestProps {
  provider: "gmail_smtp" | "warmed_email";
  organizationId: string;
}

export function EmailSendTest({ provider, organizationId }: EmailSendTestProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSend = async () => {
    if (!email.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/provider-keys/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, organizationId, recipientEmail: email.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: `Sent to ${email}` });
        setTimeout(() => { setResult(null); setOpen(false); setEmail(""); }, 3000);
      } else {
        setResult({ success: false, message: data.error || "Send failed" });
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || "Send failed" });
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        onClick={() => setOpen(true)}
      >
        <Send className="h-3 w-3 mr-1" />
        Send Test
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="email"
        placeholder="test@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSend();
          if (e.key === "Escape") { setOpen(false); setEmail(""); setResult(null); }
        }}
        className="h-7 text-xs w-44"
        autoFocus
      />
      <Button
        size="sm"
        className="h-7 text-xs px-2"
        onClick={handleSend}
        disabled={!email.trim() || sending}
      >
        {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs px-1.5"
        onClick={() => { setOpen(false); setEmail(""); setResult(null); }}
      >
        ✕
      </Button>
      {result && (
        <span className={`text-[10px] flex items-center gap-1 ${result.success ? "text-emerald-700" : "text-red-600"}`}>
          {result.success ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {result.message}
        </span>
      )}
    </div>
  );
}
