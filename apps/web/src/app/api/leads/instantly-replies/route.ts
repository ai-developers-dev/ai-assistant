import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const INSTANTLY_API_BASE = "https://api.instantly.ai/api/v2";

export async function POST(req: Request) {
  try {
    const { organizationId } = await req.json();
    if (!organizationId) return NextResponse.json({ error: "Missing organizationId" }, { status: 400 });

    const org = await convex.query(api.organizations.getById, { id: organizationId as Id<"organizations"> });
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    const apiKey = (org.providerKeys as Record<string, unknown>)?.instantly
      ? null // encrypted, skip — use env fallback
      : null;
    const key = apiKey || process.env.INSTANTLY_API_KEY;
    if (!key) return NextResponse.json({ error: "No Instantly API key configured" }, { status: 400 });

    // Fetch replied leads from Instantly v2 API
    const res = await fetch(`${INSTANTLY_API_BASE}/leads?status=REPLIED&limit=100`, {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Instantly API error: ${res.status}` }, { status: 502 });
    }

    const data: { data?: InstantlyLead[]; leads?: InstantlyLead[] } = await res.json();
    const leads: InstantlyLead[] = data?.data ?? data?.leads ?? [];

    let synced = 0;
    for (const lead of leads) {
      if (!lead.email) continue;

      // Find the business by email
      const business = await convex.query(api.businesses.findByEmail, {
        organizationId: organizationId as Id<"organizations">,
        email: lead.email,
      });

      if (!business) continue;

      const repliedAt = lead.timestamp_replied ? new Date(lead.timestamp_replied).getTime() : Date.now();
      const repliedBy = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email;

      await convex.mutation(api.businesses.markOutreachReply, {
        id: business._id,
        channel: "email",
        repliedAt,
        repliedBy,
      });
      synced++;
    }

    return NextResponse.json({ success: true, synced, total: leads.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[instantly-replies] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface InstantlyLead {
  email: string;
  first_name?: string;
  last_name?: string;
  timestamp_replied?: string;
}
