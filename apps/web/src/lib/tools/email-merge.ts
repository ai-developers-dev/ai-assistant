import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type MergeableBusiness = {
  name?: string;
  ownerName?: string;
  vertical?: string;
  categories?: string[];
  rating?: number;
  address?: { city?: string };
  reviewInsights?: { bestQuote?: string };
  reviews?: Array<{ text: string; rating: number }>;
};

function pickBestReview(business: MergeableBusiness): string {
  const quote = business.reviewInsights?.bestQuote;
  if (quote) return quote;
  const reviews = business.reviews ?? [];
  const top = [...reviews].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
  return top?.text ?? "";
}

export function applyMergeFields(text: string, business: MergeableBusiness, fallbacks: { recipientName?: string; businessName?: string } = {}): string {
  const values: Record<string, string> = {
    ownerName: business.ownerName || fallbacks.recipientName || "there",
    businessName: business.name || fallbacks.businessName || "your business",
    rating: business.rating != null ? String(business.rating) : "5",
    bestReview: pickBestReview(business),
    city: business.address?.city || "",
    vertical: business.vertical || business.categories?.[0] || "",
  };
  return text.replace(/\{\{\s*(ownerName|businessName|rating|bestReview|city|vertical)\s*\}\}/g, (_, k) => values[k] ?? "");
}

export async function renderEmailTemplate(
  convex: ConvexHttpClient,
  businessId: string,
  subject: string,
  body: string,
  fallbacks: { recipientName?: string; businessName?: string } = {},
): Promise<{ subject: string; body: string }> {
  const hasMerge = /\{\{/.test(subject) || /\{\{/.test(body);
  if (!hasMerge) return { subject, body };
  try {
    const business = await convex.query(api.businesses.getById, { id: businessId as Id<"businesses"> });
    if (!business) return { subject, body };
    return {
      subject: applyMergeFields(subject, business as MergeableBusiness, fallbacks),
      body: applyMergeFields(body, business as MergeableBusiness, fallbacks),
    };
  } catch {
    return { subject, body };
  }
}
