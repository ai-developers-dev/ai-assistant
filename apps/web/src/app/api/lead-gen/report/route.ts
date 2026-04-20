// POST /api/lead-gen/report
// Produces the daily Marketing Manager report from Convex stats.
// v1: deterministic text built from stats. Future: pipe through an LLM
// for narrative + recommendations.

import { NextRequest, NextResponse } from "next/server";
import { verifyScheduler, getConvex } from "../_lib/shared";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const unauthed = verifyScheduler(req);
  if (unauthed) return unauthed;

  const body = await req.json();
  const organizationId = body.organizationId as Id<"organizations">;
  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId required" },
      { status: 400 }
    );
  }

  const convex = getConvex();
  const stats = await convex.query(api.businesses.getStatsForPipeline, {
    organizationId,
  });

  const cities = await convex.query(api.cityCampaigns.list, {
    organizationId,
  });
  const cityStats = {
    total: cities.length,
    done: cities.filter((c: any) => c.status === "done").length,
    pending: cities.filter((c: any) => c.status === "pending").length,
    scraping: cities.filter((c: any) => c.status === "scraping").length,
    failed: cities.filter((c: any) => c.status === "failed").length,
  };

  const conversionRate =
    stats.emailSent > 0
      ? ((stats.emailReplied / stats.emailSent) * 100).toFixed(1)
      : "0.0";

  const summary = [
    "DAILY CAMPAIGN REPORT",
    "━━━━━━━━━━━━━━━━━━━━",
    "📊 PIPELINE",
    `- Cities: ${cityStats.done}/${cityStats.total} done (${cityStats.pending} pending)`,
    `- Businesses found: ${stats.total}`,
    `- Enriched (ready): ${stats.ready} (${stats.new} awaiting enrichment)`,
    `- With email: ${stats.withEmail}`,
    `- Emails sent: ${stats.emailSent}`,
    `- Email replies: ${stats.emailReplied} (${conversionRate}% reply rate)`,
    `- Meta DMs sent: ${stats.metaSent}`,
    `- LinkedIn requests sent: ${stats.linkedinSent}`,
    "",
    "⚠️  STATUS",
    cityStats.failed > 0 ? `- ${cityStats.failed} city scrape(s) failed` : "- No city failures",
    stats.withEmail < stats.total * 0.3
      ? `- Low email-discovery rate (${Math.round((stats.withEmail / Math.max(1, stats.total)) * 100)}%) — check Apollo/Hunter/Firecrawl keys`
      : "- Email discovery healthy",
  ].join("\n");

  return NextResponse.json({
    summary,
    stats,
    cityStats,
  });
}
