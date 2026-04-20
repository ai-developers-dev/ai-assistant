// POST /api/lead-gen/outreach
// Sends Meta friend-request DMs or LinkedIn connection requests via browser
// automation. These tools require Playwright, which doesn't run on Vercel
// serverless out of the box — so this route currently returns a "not
// available in this environment" response. Run the pipeline against a
// self-hosted Next.js instance (with Playwright installed) to use these.

import { NextRequest, NextResponse } from "next/server";
import {
  verifyScheduler,
  getConvex,
  loadOrgContext,
} from "../_lib/shared";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { createMetaFriendRequestTool } from "@/lib/tools/meta-outreach-tools";
import { createLinkedInConnectTool } from "@/lib/tools/linkedin-outreach-tools";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const unauthed = verifyScheduler(req);
  if (unauthed) return unauthed;

  const body = await req.json();
  const organizationId = body.organizationId as Id<"organizations">;
  const channel = body.channel as "meta" | "linkedin";
  const campaignConfig = body.campaignConfig ?? {};

  if (!organizationId || !["meta", "linkedin"].includes(channel)) {
    return NextResponse.json(
      { error: "organizationId and channel=meta|linkedin required" },
      { status: 400 }
    );
  }

  const convex = getConvex();
  const { credentials } = await loadOrgContext(convex, organizationId);

  const accounts =
    channel === "meta"
      ? credentials.meta_accounts ?? []
      : credentials.linkedin_accounts ?? [];

  if (accounts.length === 0) {
    return NextResponse.json(
      {
        sent: 0,
        skipped: 0,
        message: `No ${channel} accounts configured. Skipping.`,
      }
    );
  }

  // Vercel serverless does not ship with a browser. If this endpoint is
  // deployed on Vercel, the Playwright launch will fail — surface a clear
  // message so the pipeline marks the step failed with an actionable reason.
  try {
    const tool =
      channel === "meta"
        ? createMetaFriendRequestTool({
            accounts: accounts.map((a) => ({
              email: a.email,
              password: a.password,
            })),
            organizationId,
            convex,
          })
        : createLinkedInConnectTool({
            accounts: accounts.map((a) => ({
              email: a.email,
              password: a.password,
            })),
            organizationId,
            convex,
          });

    const limitPerAccount: number = Math.min(
      10,
      campaignConfig.channelConfig?.[channel]?.dailyLimit ?? 2
    );

    const result = await (tool as any).execute({ limitPerAccount });
    return NextResponse.json({
      sent: result?.sent ?? 0,
      skipped: result?.skipped ?? 0,
      accounts: accounts.length,
      detail: result?.message,
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const isLaunchFailure = /executablePath|chromium|browser|Target|Failed to launch/i.test(
      msg
    );
    return NextResponse.json(
      {
        sent: 0,
        skipped: 0,
        error: isLaunchFailure
          ? `Browser automation unavailable on this host. ${channel} outreach requires Playwright (self-hosted Next.js). Underlying error: ${msg.slice(0, 200)}`
          : msg.slice(0, 500),
      },
      { status: isLaunchFailure ? 501 : 500 }
    );
  }
}
