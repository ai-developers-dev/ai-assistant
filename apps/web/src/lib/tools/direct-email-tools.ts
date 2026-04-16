import { tool } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { validateEmailContent } from "./spam-filter";
import { composeEmail } from "./email-compose";

// ── Get Email Ready Businesses ────────────────────────────────────────

export function createGetEmailReadyBusinessesTool(config: {
  organizationId: string;
  convex: ConvexHttpClient;
}) {
  const { organizationId, convex } = config;

  return tool({
    description: "Fetch businesses that are ready for email outreach — have an email address and have not been emailed yet. Returns businesses sorted by lead score (highest quality first).",
    parameters: z.object({
      limit: z.number().min(1).max(50).default(20).describe("Max number of businesses to return (default 20)"),
    }),
    execute: async ({ limit }) => {
      try {
        const businesses = await convex.query(api.businesses.getReadyForOutreach, {
          organizationId: organizationId as Id<"organizations">,
          channel: "email",
          limit,
        });

        if (!businesses || businesses.length === 0) {
          return { businesses: [], count: 0 };
        }

        const mapped = businesses.map((b: any) => ({
          _id: b._id,
          name: b.name,
          ownerName: b.ownerName ?? null,
          email: b.email ?? null,
          website: b.website ?? null,
          city: b.address?.city ?? null,
          state: b.address?.state ?? null,
          categories: b.categories ?? [],
          rating: b.rating ?? null,
          reviewCount: b.reviewCount ?? null,
          reviews: Array.isArray(b.reviews) ? b.reviews.slice(0, 3) : [],
          facebookData: b.facebookData ?? null,
          linkedinData: b.linkedinData ?? null,
          reviewInsights: b.reviewInsights ?? null,
          websiteQuality: b.websiteQuality ?? null,
          leadScore: b.leadScore ?? null,
        }));

        return { businesses: mapped, count: mapped.length };
      } catch (err: any) {
        return { businesses: [], count: 0, error: err?.message ?? String(err) };
      }
    },
  });
}

// ── Send Direct Email via Resend ──────────────────────────────────────

export function createDirectEmailTool(config: {
  resendApiKey: string;
  fromEmail: string;
  fromName?: string;
  organizationId: string;
  convex: ConvexHttpClient;
  physicalAddress?: string;
}) {
  const { resendApiKey, fromEmail, fromName, organizationId, convex, physicalAddress } = config;

  return tool({
    description: "Send a personalized HTML cold email via Resend with open/click tracking and a compliant unsubscribe link. Records the send in the database so the business is not emailed again.",
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
        // Check warmup-aware daily send limit
        let effectiveLimit = parseInt(process.env.RESEND_DAILY_LIMIT ?? "50", 10);
        let warmupInfo = "";
        try {
          const warmup = await convex.query(api.emailWarmup.getEffectiveLimit, {
            accountEmail: fromEmail,
          });
          if (warmup && warmup.remaining !== undefined) {
            effectiveLimit = warmup.limit;
            if (warmup.remaining <= 0) {
              return {
                success: false,
                businessId,
                businessName,
                error: `Email warmup limit reached (${warmup.stage}: ${warmup.limit}/day). ${warmup.isWarming ? "Domain is still warming up." : ""} Sent today: ${warmup.sentToday}/${warmup.limit}.`,
              };
            }
            warmupInfo = `[${warmup.stage}: ${warmup.sentToday}/${warmup.limit}]`;
          }
        } catch {
          // Warmup query failed — fall back to static env var limit
        }

        // Also check the daily outreach counter
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
            error: `Daily email limit reached (${sent}/${effectiveLimit}). ${warmupInfo}`,
          };
        }

        // Spam filter pre-check (parity with Gmail tool)
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

        const { Resend } = await import("resend");
        const resend = new Resend(resendApiKey);

        // Resend has its own open tracking via webhooks — no tracking pixel needed.
        const composed = composeEmail({
          businessId,
          organizationId,
          recipientEmail,
          body,
          fromName,
          physicalAddress,
          includeTrackingPixel: false,
        });

        const { data, error } = await resend.emails.send({
          from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
          to: recipientEmail,
          subject,
          html: composed.html,
          text: composed.text,
          headers: composed.headers,
        });

        if (error) {
          return { success: false, businessId, businessName, error: error.message };
        }

        const messageId = data?.id ?? null;

        // Record the send in Convex
        await convex.mutation(api.businesses.updateOutreachStatus, {
          id: businessId as Id<"businesses">,
          channel: "email",
          sentAt: Date.now(),
        });

        // Store the Resend message ID for open/click tracking
        if (messageId) {
          await convex.mutation(api.businesses.updateEmailStatus, {
            id: businessId as Id<"businesses">,
            lastEmailMessageId: messageId,
          });
        }

        // Increment warmup counter + daily outreach counter + send timing analytics
        try {
          await convex.mutation(api.emailWarmup.incrementSent, { accountEmail: fromEmail });
        } catch { /* warmup not configured for this account */ }
        try {
          await convex.mutation(api.businesses.incrementOutreachDailyCount, {
            organizationId: organizationId as Id<"organizations">,
            channel: "email",
          });
        } catch { /* counter update failed — non-fatal */ }
        try {
          await convex.mutation(api.sendTimingAnalytics.recordSend, {
            organizationId: organizationId as Id<"organizations">,
          });
        } catch { /* analytics recording failed — non-fatal */ }

        // Fire outbound webhooks for lead.emailed event
        try {
          const org = await convex.query(api.organizations.getById, {
            id: organizationId as Id<"organizations">,
          });
          const webhooks = (org?.webhooks as Array<{ event: string; url: string; enabled: boolean }>) ?? [];
          for (const wh of webhooks.filter((w) => w.enabled && w.event === "lead.emailed")) {
            fetch(wh.url, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Webhook-Event": "lead.emailed" },
              body: JSON.stringify({
                event: "lead.emailed",
                timestamp: new Date().toISOString(),
                organizationId,
                data: { businessId, businessName, recipientEmail, subject, messageId },
              }),
            }).catch(() => {});
          }
        } catch { /* non-fatal */ }

        return {
          success: true,
          businessId,
          businessName,
          recipientEmail,
          subject,
          messageId,
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
