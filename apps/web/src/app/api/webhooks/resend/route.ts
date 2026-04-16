import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Resend webhook event types we handle
type ResendEvent =
  | { type: "email.delivered"; data: { email_id: string; to: string[] } }
  | { type: "email.opened"; data: { email_id: string; to: string[] } }
  | { type: "email.clicked"; data: { email_id: string; to: string[]; click: { link: string } } }
  | { type: "email.bounced"; data: { email_id: string; to: string[] } }
  | { type: "email.complained"; data: { email_id: string; to: string[] } }
  | { type: "email.unsubscribed"; data: { email_id: string; to: string[] } };

export async function POST(req: NextRequest) {
  try {
    // Verify webhook signature using Svix
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    const rawBody = await req.text();

    if (!secret) {
      // In production, absence of the secret is a misconfiguration that would
      // let anyone forge webhook events. Reject outright.
      if (process.env.NODE_ENV === "production") {
        console.error("[resend-webhook] RESEND_WEBHOOK_SECRET missing in production");
        return NextResponse.json(
          { error: "Server misconfiguration" },
          { status: 503 }
        );
      }
      // In dev/staging, log a loud warning so we notice.
      console.warn(
        "[resend-webhook] RESEND_WEBHOOK_SECRET not set — accepting unsigned webhook. Only safe in local dev."
      );
    } else {
      const svixId = req.headers.get("svix-id");
      const svixTimestamp = req.headers.get("svix-timestamp");
      const svixSignature = req.headers.get("svix-signature");

      if (!svixId || !svixTimestamp || !svixSignature) {
        return NextResponse.json({ error: "Missing Svix headers" }, { status: 401 });
      }

      try {
        const wh = new Webhook(secret);
        wh.verify(rawBody, {
          "svix-id": svixId,
          "svix-timestamp": svixTimestamp,
          "svix-signature": svixSignature,
        });
      } catch (err) {
        console.error("[resend-webhook] Svix signature verification failed:", err);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const event = JSON.parse(rawBody) as ResendEvent;

    // Extract the Resend email_id from the event
    const messageId = event.data?.email_id;
    if (!messageId) {
      return NextResponse.json({ ok: true });
    }

    // Find the business record that has this messageId across all orgs
    // We search by messageId — stored as lastEmailMessageId when the email was sent
    // Since we don't have orgId in the webhook, we do a broad query via a helper
    // that scans for the messageId. This is acceptable given low webhook volume.
    const business = await findBusinessByMessageId(messageId);

    if (!business) {
      // Not found — could be a test send or already cleaned up
      return NextResponse.json({ ok: true });
    }

    const id = business._id as Id<"businesses">;
    const now = Date.now();

    switch (event.type) {
      case "email.opened":
        await convex.mutation(api.businesses.updateEmailStatus, {
          id,
          emailOpenedAt: business.emailOpenedAt ?? now,
          incrementOpenCount: true,
        });
        // Track A/B subject line opens
        if (business.subjectLineTests?.length) {
          const lastVariant = business.subjectLineTests[business.subjectLineTests.length - 1];
          if (lastVariant?.variant) {
            try {
              await convex.mutation(api.businesses.incrementSubjectLineOpen, {
                id,
                variant: lastVariant.variant,
              });
            } catch { /* non-fatal */ }
          }
        }
        // Track send timing analytics for opens (using original send time slot)
        if (business.outreachStatus?.emailSentAt) {
          try {
            const sentDate = new Date(business.outreachStatus.emailSentAt);
            await convex.mutation(api.sendTimingAnalytics.recordOpen, {
              organizationId: business.organizationId as Id<"organizations">,
              sentHourUTC: sentDate.getUTCHours(),
              sentDayOfWeek: sentDate.getUTCDay(),
            });
          } catch { /* non-fatal */ }
        }
        // Trigger smart sequence advancement (may early-advance if 48h+ with no reply)
        await convex.mutation(api.businesses.checkAndAdvanceSequence, {
          businessId: id,
        });
        break;

      case "email.bounced":
        await convex.mutation(api.businesses.updateEmailStatus, {
          id,
          emailStatus: "bounced",
        });
        // Trigger smart sequence advancement (will skip email steps)
        await convex.mutation(api.businesses.checkAndAdvanceSequence, {
          businessId: id,
        });
        break;

      case "email.complained":
        await convex.mutation(api.businesses.updateEmailStatus, {
          id,
          emailStatus: "unsubscribed",
        });
        break;

      case "email.unsubscribed":
        await convex.mutation(api.businesses.updateEmailStatus, {
          id,
          emailStatus: "unsubscribed",
        });
        break;

      // email.delivered and email.clicked are tracked passively — no DB update needed
      // unless you want click counts; add here if desired
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[resend-webhook]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function findBusinessByMessageId(messageId: string) {
  // Looks up business via the by_lastEmailMessageId index (O(1) indexed lookup).
  try {
    // Use internal search: fetch the business that has lastEmailMessageId === messageId
    // This is done via a Convex query that accepts messageId and searches within an org.
    // Since we don't know the org, we use a global search query.
    const result = await convex.query(api.businesses.findByMessageIdGlobal, { messageId });
    return result;
  } catch {
    return null;
  }
}
