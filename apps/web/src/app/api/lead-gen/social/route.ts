// POST /api/lead-gen/social
// Placeholder step for future social-posting (Reddit, Meta groups,
// LinkedIn groups, YouTube comments, Twitter, Discord, Quora, Nextdoor).
// Most of those tools need browser automation + per-channel OAuth, so v1
// just reports which channels are enabled and returns success. Replace
// this with per-channel orchestration when the tools are Vercel-compatible.

import { NextRequest, NextResponse } from "next/server";
import { verifyScheduler } from "../_lib/shared";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const unauthed = verifyScheduler(req);
  if (unauthed) return unauthed;

  const body = await req.json();
  const campaignConfig = body.campaignConfig ?? {};
  const social = campaignConfig.socialPresence ?? {};

  const enabledChannels = Object.entries(social)
    .filter(([k, v]) => k.startsWith("postTo") && v === true)
    .map(([k]) => k.replace(/^postTo/, ""));

  return NextResponse.json({
    posted: 0,
    skipped: enabledChannels.length,
    detail:
      enabledChannels.length > 0
        ? `Social posting not yet available in this deployment. Configured channels: ${enabledChannels.join(", ")}.`
        : "No social channels enabled.",
  });
}
