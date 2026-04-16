import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { verifyPixelSignature } from "@/lib/tracking/pixel-signature";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// 1x1 transparent GIF pixel
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

/**
 * Self-hosted open tracking pixel for Gmail SMTP emails.
 * Called when the recipient's email client loads the embedded image.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("id");
  const orgId = searchParams.get("org");
  const sig = searchParams.get("sig");

  // Always return the pixel (even if params are missing) to avoid broken images
  const pixelResponse = () =>
    new NextResponse(PIXEL, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Content-Length": String(PIXEL.length),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });

  if (!businessId || !orgId) return pixelResponse();

  // Reject unsigned/forged pixel requests — the real pixel URL has an HMAC sig
  // (see signPixelUrl in src/lib/tracking/pixel-signature.ts) that's stamped
  // into each outbound email at send time.
  if (!verifyPixelSignature(businessId, orgId, sig)) return pixelResponse();

  // Fire-and-forget: update open status without blocking the pixel response
  try {
    const id = businessId as Id<"businesses">;

    // Validate the business belongs to the claimed org before updating
    const business = await convex.query(api.businesses.getById, { id });
    if (!business || business.organizationId !== orgId) return pixelResponse();

    // Record the open event
    await convex.mutation(api.businesses.updateEmailStatus, {
      id,
      emailOpenedAt: Date.now(),
      incrementOpenCount: true,
    });
    if (business?.outreachStatus?.emailSentAt) {
      const sentDate = new Date(business.outreachStatus.emailSentAt);
      try {
        await convex.mutation(api.sendTimingAnalytics.recordOpen, {
          organizationId: orgId as Id<"organizations">,
          sentHourUTC: sentDate.getUTCHours(),
          sentDayOfWeek: sentDate.getUTCDay(),
        });
      } catch { /* non-fatal */ }
    }

    // A/B subject line tracking
    if (business?.subjectLineTests?.length) {
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

    // Trigger smart sequence advancement
    try {
      await convex.mutation(api.businesses.checkAndAdvanceSequence, {
        businessId: id,
      });
    } catch { /* non-fatal */ }
  } catch {
    // Never block the pixel response
  }

  return pixelResponse();
}
