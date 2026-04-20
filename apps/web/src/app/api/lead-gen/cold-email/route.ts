// POST /api/lead-gen/cold-email
// Sends cold emails to status='ready' businesses using the campaign's
// email template. Merge fields are filled deterministically from the DB
// (no LLM call — faster, cheaper, predictable).

import { NextRequest, NextResponse } from "next/server";
import {
  verifyScheduler,
  getConvex,
  loadOrgContext,
  tokenOf,
} from "../_lib/shared";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { createDirectEmailTool } from "@/lib/tools/direct-email-tools";
import { createGmailEmailTool } from "@/lib/tools/gmail-email-tools";
import { applyMergeFields } from "@/lib/tools/email-merge";

export const maxDuration = 300;

const DEFAULT_TEMPLATE = `Hi {{ownerName}},

I came across {{businessName}} and was impressed by your {{rating}}-star rating. One of your customers said: "{{bestReview}}"

I help {{vertical}} businesses in {{city}} get more customers through modern websites and local SEO.

Would you be open to a quick chat this week?

Best,
[Your Name]`;

const DEFAULT_SUBJECT = "{{businessName}} — quick question";

function deriveRecipientName(biz: any): string {
  if (biz.ownerName) return biz.ownerName.split(" ")[0]; // first name only
  return "there";
}

export async function POST(req: NextRequest) {
  const unauthed = verifyScheduler(req);
  if (unauthed) return unauthed;

  const body = await req.json();
  const organizationId = body.organizationId as Id<"organizations">;
  const campaignConfig = body.campaignConfig ?? {};
  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId required" },
      { status: 400 }
    );
  }

  const convex = getConvex();
  const { org, credentials } = await loadOrgContext(convex, organizationId);

  const dailyLimit: number =
    campaignConfig.channelConfig?.email?.dailyLimit ?? 10;
  const template: string = campaignConfig.emailTemplate || DEFAULT_TEMPLATE;
  const subjectTemplate: string =
    campaignConfig.emailSubject || DEFAULT_SUBJECT;

  // Pick an email sender — prefer Resend, then Gmail SMTP (multi-account or legacy single)
  const resendKey = process.env.RESEND_API_KEY;
  const gmailAccounts =
    (credentials.gmail_smtp_accounts ?? []).length > 0
      ? credentials.gmail_smtp_accounts!
      : credentials.gmail_smtp
      ? [
          {
            email: (credentials.gmail_smtp as any).email,
            password: (credentials.gmail_smtp as any).password,
          },
        ]
      : [];

  const warmedEmailAccounts =
    (credentials.warmed_email_accounts ?? []).length > 0
      ? credentials.warmed_email_accounts!
      : [];

  const smtpAccounts = [...gmailAccounts, ...warmedEmailAccounts].filter(
    (a) => a.email && a.password
  );

  if (!resendKey && smtpAccounts.length === 0) {
    return NextResponse.json(
      {
        error:
          "No email sender configured — set RESEND_API_KEY or add a Gmail/warmed-email account in Settings",
      },
      { status: 400 }
    );
  }

  // Build one tool per sender (round-robin later)
  const senders = resendKey
    ? [
        {
          kind: "resend" as const,
          tool: createDirectEmailTool({
            resendApiKey: resendKey,
            fromEmail: process.env.RESEND_FROM_EMAIL ?? "hello@example.com",
            fromName: org.name,
            organizationId: organizationId as unknown as string,
            convex,
          }),
        },
      ]
    : smtpAccounts.map((a) => ({
        kind: "gmail" as const,
        tool: createGmailEmailTool({
          gmailAddress: a.email,
          gmailAppPassword: a.password,
          fromName: org.name,
          organizationId: organizationId as unknown as string,
          convex,
        }),
      }));

  const businesses = await convex.query(api.businesses.listForPipeline, {
    organizationId,
    status: "ready",
    limit: dailyLimit * 3, // grab extra to allow for filtering
  });

  const startedAt = Date.now();
  const hardTimeMs = 260_000;
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const biz of businesses) {
    if (sent >= dailyLimit) break;
    if (Date.now() - startedAt > hardTimeMs) break;

    if (!biz.email) {
      skipped++;
      continue;
    }
    if ((biz.rating ?? 0) < 3.5) {
      skipped++;
      continue;
    }
    if (biz.outreachStatus?.emailSentAt) {
      skipped++;
      continue;
    }

    const recipientName = deriveRecipientName(biz);
    const body = applyMergeFields(template, biz, {
      recipientName,
      businessName: biz.name,
    });
    const subject = applyMergeFields(subjectTemplate, biz, {
      recipientName,
      businessName: biz.name,
    });

    const sender = senders[sent % senders.length];
    try {
      const result = await (sender.tool as any).execute({
        businessId: biz._id,
        recipientEmail: biz.email,
        recipientName,
        businessName: biz.name,
        subject: subject.slice(0, 78),
        body,
      });
      if (result?.success === false) {
        errors.push(`${biz.name}: ${result?.error ?? "unknown"}`);
        skipped++;
      } else {
        sent++;
      }
    } catch (err: any) {
      errors.push(`${biz.name}: ${err?.message ?? "unknown"}`);
      skipped++;
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    errors: errors.slice(0, 10),
  });
}
