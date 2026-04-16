import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { organizationId, leads } = body;

    if (!organizationId || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: "Missing organizationId or leads array" }, { status: 400 });
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const lead of leads.slice(0, 1000)) { // Cap at 1000
      try {
        if (!lead.name || !lead.city || !lead.state) {
          skipped++;
          continue;
        }

        const result = await convex.mutation(api.businesses.createFromServer, {
          organizationId: organizationId as Id<"organizations">,
          googlePlaceId: lead.googlePlaceId || `import_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: lead.name,
          address: {
            street: lead.address || lead.street || undefined,
            city: lead.city,
            state: lead.state,
            zip: lead.zip || undefined,
            formatted: `${lead.city}, ${lead.state}`,
          },
          phone: lead.phone || undefined,
          email: lead.email || undefined,
          website: lead.website || undefined,
          categories: lead.categories
            ? (typeof lead.categories === "string" ? lead.categories.split(";").map((c: string) => c.trim()) : lead.categories)
            : ["imported"],
          rating: lead.rating ? parseFloat(lead.rating) : undefined,
          reviewCount: lead.reviewCount ? parseInt(lead.reviewCount) : undefined,
          ownerName: lead.ownerName || lead.owner || undefined,
          vertical: lead.vertical || lead.category || undefined,
        });

        if (result.created) imported++;
        else skipped++;
      } catch (err: any) {
        errors.push(`${lead.name}: ${err.message?.slice(0, 50)}`);
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: leads.length,
      errors: errors.slice(0, 10),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
