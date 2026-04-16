import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const organizationId = searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json({ error: "Missing organizationId" }, { status: 400 });
  }

  try {
    const businesses = await convex.query(api.businesses.list, {
      organizationId: organizationId as Id<"organizations">,
      limit: 5000,
    });

    if (!businesses || businesses.length === 0) {
      return NextResponse.json({ error: "No leads to export" }, { status: 404 });
    }

    // Build CSV
    const headers = [
      "Name", "Address", "City", "State", "Zip", "Phone", "Email", "Website",
      "Owner Name", "Owner Title", "Rating", "Review Count", "Categories",
      "Lead Score", "Status", "Pipeline Stage",
      "Facebook Page", "LinkedIn", "LinkedIn Owner",
      "Website Quality Score", "Needs Upgrade",
      "Email Sent", "Meta Sent", "LinkedIn Sent",
      "Email Replied", "Reply Classification",
      "Best Review Quote", "Best Review Author",
      "Strengths", "Weaknesses", "Sentiment Score",
      "Created At", "Updated At",
    ];

    const rows = businesses.map((b: any) => [
      b.name || "",
      b.address?.street || "",
      b.address?.city || "",
      b.address?.state || "",
      b.address?.zip || "",
      b.phone || "",
      b.email || "",
      b.website || "",
      b.ownerName || "",
      b.ownerTitle || "",
      b.rating ?? "",
      b.reviewCount ?? "",
      (b.categories || []).join("; "),
      b.leadScore ?? "",
      b.status || "",
      b.pipelineStage || "",
      b.metaPageUrl || "",
      b.linkedinUrl || "",
      b.linkedinOwnerUrl || "",
      b.websiteQuality?.score ?? "",
      b.websiteQuality?.needsUpgrade || "",
      b.outreachStatus?.emailSentAt ? new Date(b.outreachStatus.emailSentAt).toISOString() : "",
      b.outreachStatus?.metaSentAt ? new Date(b.outreachStatus.metaSentAt).toISOString() : "",
      b.outreachStatus?.linkedinSentAt ? new Date(b.outreachStatus.linkedinSentAt).toISOString() : "",
      b.outreachStatus?.emailRepliedAt ? new Date(b.outreachStatus.emailRepliedAt).toISOString() : "",
      b.replyClassification || "",
      b.reviewInsights?.bestQuote || "",
      b.reviewInsights?.bestQuoteAuthor || "",
      (b.reviewInsights?.strengths || []).join("; "),
      (b.reviewInsights?.weaknesses || []).join("; "),
      b.reviewInsights?.sentimentScore ?? "",
      new Date(b.createdAt).toISOString(),
      new Date(b.updatedAt).toISOString(),
    ]);

    const escapeCsv = (val: string | number) => {
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const csv = [
      headers.map(escapeCsv).join(","),
      ...rows.map((row: any[]) => row.map(escapeCsv).join(",")),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="leads-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
