// POST /api/lead-gen/enrich
// Enriches businesses with status='new': finds owner name, email, socials.
// Called by leadGenPipeline.runStep1Enrich.

import { NextRequest, NextResponse } from "next/server";
import {
  verifyScheduler,
  getConvex,
  loadOrgContext,
  tokenOf,
} from "../_lib/shared";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { createBusinessEnrichmentTool } from "@/lib/tools/business-enrichment-tools";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const unauthed = verifyScheduler(req);
  if (unauthed) return unauthed;

  const body = await req.json();
  const organizationId = body.organizationId as Id<"organizations">;
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId required" }, { status: 400 });
  }

  const convex = getConvex();
  const { credentials } = await loadOrgContext(convex, organizationId);

  const firecrawlKey = tokenOf(credentials.firecrawl);
  if (!firecrawlKey) {
    return NextResponse.json(
      { error: "No Firecrawl API key configured — cannot enrich" },
      { status: 400 }
    );
  }

  const enrichTool = createBusinessEnrichmentTool({
    firecrawlApiKey: firecrawlKey,
    outscraperApiKey: tokenOf(credentials.outscraper),
    hunterApiKey: tokenOf(credentials.hunter),
    apolloApiKey: tokenOf(credentials.apollo),
    organizationId,
    convex,
  });

  // Pull unenriched businesses (status='new')
  const businesses = await convex.query(api.businesses.listForPipeline, {
    organizationId,
    status: "new",
    limit: 25, // cap per run to stay under 300s
  });

  const hardTimeMs = 260_000;
  const startedAt = Date.now();
  let enriched = 0;
  let failed = 0;

  for (const biz of businesses) {
    if (Date.now() - startedAt > hardTimeMs) {
      console.warn("[lead-gen/enrich] time budget exhausted");
      break;
    }
    try {
      await (enrichTool as any).execute({
        businessId: biz._id,
        businessName: biz.name,
        city: biz.address.city,
        state: biz.address.state,
        website: biz.website,
        category: biz.categories?.[0],
        googlePlaceId: biz.googlePlaceId,
      });
      enriched++;
    } catch (err: any) {
      console.error(`[lead-gen/enrich] ${biz.name}:`, err);
      failed++;
    }
  }

  return NextResponse.json({
    attempted: enriched + failed,
    enriched,
    failed,
  });
}
