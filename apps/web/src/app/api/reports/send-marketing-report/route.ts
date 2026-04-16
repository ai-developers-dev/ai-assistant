import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { decryptProviderKeys } from "@/lib/credentials/provider-keys";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  // Verify scheduler secret
  const secret = req.headers.get("x-scheduler-secret");
  if (secret !== process.env.SCHEDULER_INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { organizationId, reportHtml, subject, recipientEmail } = await req.json();

    if (!organizationId || !reportHtml) {
      return NextResponse.json({ error: "Missing organizationId or reportHtml" }, { status: 400 });
    }

    // Get org data + Gmail credentials
    const orgData = await convex.query(api.organizations.getById, { id: organizationId });
    if (!orgData?.providerKeys) {
      return NextResponse.json({ error: "No provider keys configured" }, { status: 400 });
    }

    const credentials = decryptProviderKeys(
      orgData.providerKeys as Record<string, any>,
      organizationId
    );

    // Find Gmail account
    let gmailAddress = "";
    let gmailPassword = "";

    const gmailAccounts = credentials.gmail_smtp_accounts;
    if (Array.isArray(gmailAccounts) && gmailAccounts.length > 0) {
      gmailAddress = gmailAccounts[0].email;
      gmailPassword = gmailAccounts[0].password;
    } else if (credentials.gmail_smtp && typeof credentials.gmail_smtp === "object" && "token" in credentials.gmail_smtp) {
      const parts = (credentials.gmail_smtp as any).token.split("|");
      gmailAddress = parts[0] || "";
      gmailPassword = parts[1] || "";
    }

    if (!gmailAddress || !gmailPassword) {
      return NextResponse.json({ error: "No Gmail SMTP credentials found" }, { status: 400 });
    }

    // Send email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailAddress, pass: gmailPassword },
    });

    const to = recipientEmail || gmailAddress; // Default: send to self
    const emailSubject = subject || `Lead Gen Report — ${orgData.name} — ${new Date().toLocaleDateString()}`;

    await transporter.sendMail({
      from: `${orgData.name} Marketing Manager <${gmailAddress}>`,
      to,
      subject: emailSubject,
      html: reportHtml,
      text: reportHtml.replace(/<[^>]*>/g, ""), // Strip HTML for plain text fallback
    });

    return NextResponse.json({ success: true, sentTo: to });
  } catch (err: any) {
    console.error("[marketing-report] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
