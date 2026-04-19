import { tool } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import nodemailer from "nodemailer";
import { validateEmailContent } from "./spam-filter";
import { composeEmail } from "./email-compose";
import { renderEmailTemplate } from "./email-merge";

// ── Send Direct Email via Gmail SMTP ──────────────────────────────────

export function createGmailEmailTool(config: {
  gmailAddress: string;
  gmailAppPassword: string;
  fromName?: string;
  organizationId: string;
  convex: ConvexHttpClient;
  physicalAddress?: string;
}) {
  const { gmailAddress, gmailAppPassword, fromName, organizationId, convex, physicalAddress } = config;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailAddress,
      pass: gmailAppPassword,
    },
  });

  return tool({
    description: "Send a personalized HTML cold email via Gmail SMTP with a compliant unsubscribe link. Records the send in the database so the business is not emailed again.",
    parameters: z.object({
      businessId: z.string().describe("Convex _id of the business record"),
      recipientEmail: z.string().email().describe("Email address to send to"),
      recipientName: z.string().describe("First name of the recipient (for personalization)"),
      businessName: z.string().describe("Name of the business being emailed"),
      subject: z.string().max(80).describe("Email subject line (no spam trigger words like FREE, GUARANTEED, etc.)"),
      body: z.string().max(2000).describe("Plain-text version of the email body (under 150 words). Will be wrapped in a clean HTML template automatically."),
    }),
    execute: async ({ businessId, recipientEmail, recipientName, businessName, subject, body }) => {
      try {
        ({ subject, body } = await renderEmailTemplate(convex, businessId, subject, body, { recipientName, businessName }));
        // Check warmup-aware daily send limit
        let effectiveLimit = parseInt(process.env.GMAIL_DAILY_LIMIT ?? "50", 10);
        try {
          const warmup = await convex.query(api.emailWarmup.getEffectiveLimit, {
            accountEmail: gmailAddress,
          });
          if (warmup && warmup.remaining !== undefined) {
            effectiveLimit = warmup.limit;
            if (warmup.remaining <= 0) {
              return {
                success: false,
                businessId,
                businessName,
                error: `Email warmup limit reached (${warmup.stage}: ${warmup.limit}/day). Sent today: ${warmup.sentToday}/${warmup.limit}.`,
              };
            }
          }
        } catch { /* warmup not configured — fall back to static limit */ }

        const todayCount = await convex.query(api.businesses.getDailyOutreachCount, {
          organizationId: organizationId as Id<"organizations">,
          channel: "email",
          date: new Date().toISOString().slice(0, 10),
        });
        const sent = typeof todayCount === "number" ? todayCount : todayCount.sent;
        if (sent >= effectiveLimit) {
          return {
            success: false,
            businessId,
            businessName,
            error: `Daily email limit reached (${sent}/${effectiveLimit}). Gmail allows up to 500 emails/day.`,
          };
        }

        // Spam check — reject emails that would land in spam
        const spamCheck = validateEmailContent(subject, body);
        if (!spamCheck.pass) {
          return {
            success: false,
            businessId,
            error: `Email blocked by spam filter (score: ${spamCheck.score}/100)`,
            spamScore: spamCheck.score,
            issues: spamCheck.issues,
            suggestions: spamCheck.suggestions,
            message: "Rewrite the email avoiding these issues and try again.",
          };
        }

        // Gmail SMTP has no webhook-based open tracking, so embed the pixel.
        const composed = composeEmail({
          businessId,
          organizationId,
          recipientEmail,
          body,
          fromName,
          physicalAddress,
          includeTrackingPixel: true,
        });

        const info = await transporter.sendMail({
          from: fromName ? `${fromName} <${gmailAddress}>` : gmailAddress,
          to: recipientEmail,
          subject,
          text: composed.text,
          html: composed.html,
          headers: composed.headers,
        });

        const messageId = info.messageId ?? null;

        // Record the send in Convex
        await convex.mutation(api.businesses.updateOutreachStatus, {
          id: businessId as Id<"businesses">,
          channel: "email",
          sentAt: Date.now(),
        });

        // Store the message ID for tracking
        if (messageId) {
          await convex.mutation(api.businesses.updateEmailStatus, {
            id: businessId as Id<"businesses">,
            lastEmailMessageId: messageId,
          });
        }

        // Record full email content for review
        try {
          await convex.mutation(api.businesses.recordSentEmail, {
            id: businessId as Id<"businesses">,
            subject,
            body,
            provider: "gmail",
            messageId: messageId || undefined,
          });
        } catch { /* non-fatal */ }

        // Increment warmup counter + daily outreach counter + send timing analytics
        try {
          await convex.mutation(api.emailWarmup.incrementSent, { accountEmail: gmailAddress });
        } catch { /* warmup not configured */ }
        try {
          await convex.mutation(api.businesses.incrementOutreachDailyCount, {
            organizationId: organizationId as Id<"organizations">,
            channel: "email",
          });
        } catch { /* non-fatal */ }
        try {
          await convex.mutation(api.sendTimingAnalytics.recordSend, {
            organizationId: organizationId as Id<"organizations">,
          });
        } catch { /* non-fatal */ }

        return {
          success: true,
          businessId,
          businessName,
          recipientEmail,
          subject,
          messageId,
          provider: "gmail",
        };
      } catch (err: any) {
        return {
          success: false,
          businessId,
          businessName,
          error: err?.message ?? String(err),
        };
      }
    },
  });
}
