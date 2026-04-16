import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { decryptProviderKeys } from "@/lib/credentials/provider-keys";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * POST — Send a test email via Gmail SMTP or Resend.
 * Body: { provider: "gmail_smtp" | "warmed_email", organizationId, recipientEmail, fromAccount? }
 * fromAccount: optional email address to send from (for multi-account; finds matching account in _accounts array)
 */
export async function POST(req: Request) {
  try {
    const { provider, organizationId, recipientEmail, fromAccount } = await req.json();

    if (!provider || !organizationId || !recipientEmail) {
      return NextResponse.json(
        { error: "Missing provider, organizationId, or recipientEmail" },
        { status: 400 }
      );
    }

    const org = await convex.query(api.organizations.getById, {
      id: organizationId as Id<"organizations">,
    });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const keys = decryptProviderKeys(org.providerKeys as Record<string, any>, organizationId);

    // If fromAccount is specified, look up the specific account from the multi-account array
    let token: string | null = null;
    if (fromAccount) {
      const accountsKey = `${provider}_accounts` as keyof typeof keys;
      const accounts = keys[accountsKey];
      if (Array.isArray(accounts)) {
        const match = accounts.find((a: any) => a.email === fromAccount);
        if (match) {
          token = `${match.email}|${match.password}`;
        }
      }
    }
    // Fallback to legacy single credential
    if (!token) {
      const credential = keys[provider as keyof typeof keys];
      if (credential && typeof credential === "object" && "token" in credential) {
        token = credential.token;
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: `No credentials found for ${fromAccount || provider}. Save your credentials first.` },
        { status: 404 }
      );
    }
    const subject = "Test Email from Agent Platform";
    const textBody = "This is a test email sent from your Agent Platform to verify your email configuration is working correctly.\n\nIf you received this, your email setup is good to go!";
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:24px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:40px;max-width:600px">
        <tr><td style="color:#1a1a1a;font-size:16px">
          <h2 style="margin:0 0 16px 0;font-size:20px;color:#1a1a1a">Test Email</h2>
          <p style="margin:0 0 16px 0;line-height:1.6">This is a test email sent from your <strong>Agent Platform</strong> to verify your email configuration is working correctly.</p>
          <p style="margin:0 0 16px 0;line-height:1.6">If you received this, your <strong>${provider === "gmail_smtp" ? "Gmail SMTP" : "Resend"}</strong> setup is good to go! &#x2705;</p>
        </td></tr>
        <tr><td style="border-top:1px solid #eee;padding-top:16px;margin-top:24px;color:#999;font-size:11px;line-height:1.5">
          Sent via Agent Platform &mdash; ${provider === "gmail_smtp" ? "Gmail SMTP" : "Resend API"}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    if (provider === "gmail_smtp") {
      const [gmailAddr, gmailPass] = token.split("|");
      if (!gmailAddr || !gmailPass) {
        return NextResponse.json({ error: "Invalid Gmail credentials format" }, { status: 400 });
      }
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        service: "gmail",
        auth: { user: gmailAddr, pass: gmailPass },
      });
      await transporter.sendMail({
        from: gmailAddr,
        to: recipientEmail,
        subject,
        text: textBody,
        html,
      });
      return NextResponse.json({ success: true, from: gmailAddr, to: recipientEmail, provider: "gmail" });
    }

    if (provider === "warmed_email") {
      const [wmEmail, wmPassword] = token.split("|");
      const resendApiKey = process.env.RESEND_API_KEY || (wmPassword?.startsWith("re_") ? wmPassword : null);
      if (!wmEmail || !resendApiKey) {
        return NextResponse.json(
          { error: "No valid Resend API key found. Store a key starting with re_ or set RESEND_API_KEY env var." },
          { status: 400 }
        );
      }
      const { Resend } = await import("resend");
      const resend = new Resend(resendApiKey);
      const { error } = await resend.emails.send({
        from: wmEmail,
        to: recipientEmail,
        subject,
        text: textBody,
        html,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, from: wmEmail, to: recipientEmail, provider: "resend" });
    }

    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
  } catch (error: any) {
    console.error("[send-test] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send test email" },
      { status: 500 }
    );
  }
}
