import { tool } from "ai";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { ConvexHttpClient } from "convex/browser";

export function createGetBusinessesByStatusTool(config: { organizationId: string; convex: ConvexHttpClient }) {
  return tool({
    description: "Get businesses filtered by status. Use status='new' to find unenriched businesses for the Research Agent. Use status='ready' for outreach-ready businesses.",
    parameters: z.object({
      status: z.enum(["new", "enriching", "ready", "all_sent"]).describe("Business status to filter by"),
      limit: z.number().min(1).max(100).default(50).describe("Max businesses to return"),
    }),
    execute: async ({ status, limit }) => {
      try {
        const businesses = await config.convex.query(api.businesses.list, {
          organizationId: config.organizationId as any,
          status,
          limit,
        });
        return {
          success: true,
          count: businesses.length,
          businesses: businesses.map((b: any) => ({
            id: b._id,
            name: b.name,
            city: b.address?.city,
            state: b.address?.state,
            website: b.website,
            phone: b.phone,
            email: b.email,
            category: b.vertical || b.categories?.[0],
            rating: b.rating,
            reviewCount: b.reviewCount,
            googlePlaceId: b.googlePlaceId,
            ownerName: b.ownerName,
            metaPageUrl: b.metaPageUrl,
            linkedinOwnerUrl: b.linkedinOwnerUrl,
          })),
        };
      } catch (err: any) {
        return { success: false, error: err.message, count: 0, businesses: [] };
      }
    },
  });
}
