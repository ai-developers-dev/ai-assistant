// POST /api/lead-gen/scrape
// Scrapes pending cities for a lead-gen task, up to dailyResults.
// Called by leadGenPipeline.runStep0Scrape.

import { NextRequest, NextResponse } from "next/server";
import {
  verifyScheduler,
  getConvex,
  loadOrgContext,
  tokenOf,
} from "../_lib/shared";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { createScrapeAllVerticalsTool, resetScrapeCounter } from "@/lib/tools/google-places-tools";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const unauthed = verifyScheduler(req);
  if (unauthed) return unauthed;

  const body = await req.json();
  const organizationId = body.organizationId as Id<"organizations">;
  const campaignConfig = body.campaignConfig ?? {};
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId required" }, { status: 400 });
  }

  const convex = getConvex();
  const { credentials } = await loadOrgContext(convex, organizationId);

  const outscraperKey = tokenOf(credentials.outscraper);
  if (!outscraperKey) {
    return NextResponse.json(
      { error: "No Outscraper API key configured for this organization." },
      { status: 400 }
    );
  }

  const dailyTarget: number = campaignConfig.dailyResults ?? 25;
  const verticals: string[] = campaignConfig.verticals ?? [];
  if (verticals.length === 0) {
    return NextResponse.json({
      totalSaved: 0,
      citiesProcessed: 0,
      message: "No verticals configured",
    });
  }

  // Reset the module-level shared counter so we start fresh this run
  resetScrapeCounter();

  const scrapeTool = createScrapeAllVerticalsTool({
    apiKey: outscraperKey,
    organizationId,
    convex,
    dailyLimit: dailyTarget,
    totalVerticals: verticals.length,
  });

  let totalSaved = 0;
  let citiesProcessed = 0;
  const cityLog: Array<{ city: string; saved: number }> = [];
  const startedAt = Date.now();
  const hardTimeMs = 260_000; // Leave headroom under Vercel's 300s cap

  // Loop through pending cities until dailyTarget hit or no more cities or time budget exhausted
  while (totalSaved < dailyTarget) {
    if (Date.now() - startedAt > hardTimeMs) {
      console.warn("[lead-gen/scrape] time budget exhausted — stopping early");
      break;
    }
    const next = await convex.query(api.cityCampaigns.getNextPending, {
      organizationId,
    });
    if (!next) break;

    await convex.mutation(api.cityCampaigns.markScraping, {
      cityId: next._id,
    });

    try {
      const result = await (scrapeTool as any).execute({
        city: next.cityName,
        state: next.stateCode,
        verticals,
        cityId: next._id,
      });
      const saved = typeof result?.totalSaved === "number" ? result.totalSaved : 0;
      totalSaved += saved;
      citiesProcessed++;
      cityLog.push({ city: next.cityName, saved });
      await convex.mutation(api.cityCampaigns.markDone, {
        cityId: next._id,
        businessesFound: saved,
      });

      if (result?.limitReached) break;
    } catch (err: any) {
      console.error(`[lead-gen/scrape] city ${next.cityName} failed:`, err);
      try {
        await convex.mutation(api.cityCampaigns.markFailed, {
          cityId: next._id,
        });
      } catch {
        // best-effort
      }
    }
  }

  return NextResponse.json({
    totalSaved,
    citiesProcessed,
    cities: cityLog,
  });
}
