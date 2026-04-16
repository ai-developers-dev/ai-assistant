import { tool } from "ai";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { ConvexHttpClient } from "convex/browser";

export function createLogDecisionTool(config: { organizationId: string; convex: ConvexHttpClient }) {
  return tool({
    description: "Log a decision about a business (sent email, skipped, or deferred). Call this for EVERY business you process to track performance.",
    parameters: z.object({
      agentName: z.string().describe("Name of the agent making the decision"),
      businessId: z.string().optional().describe("Business ID if applicable"),
      decision: z.enum(["sent", "skipped", "deferred"]),
      reason: z.string().describe("Why this decision was made (e.g., 'no email found', 'rating below 3.5', 'personalized email sent with review hook')"),
      metadata: z.any().optional().describe("Extra data like { subjectLine, hookType, personalizationElements }"),
    }),
    execute: async ({ agentName, businessId, decision, reason, metadata }) => {
      try {
        await config.convex.mutation(api.agentDecisionLog.create, {
          organizationId: config.organizationId as any,
          agentName,
          businessId: businessId as any,
          decision,
          reason,
          metadata,
        });
        return { success: true, logged: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });
}
