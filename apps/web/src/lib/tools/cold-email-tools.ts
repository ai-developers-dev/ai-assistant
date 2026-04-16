import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

interface ColdEmailConfig {
  apiKey: string;
  organizationId: Id<"organizations">;
  convex: ConvexHttpClient;
}

const INSTANTLY_API_BASE = "https://api.instantly.ai/api/v1";

/**
 * Factory: creates a tool to add leads to Instantly.ai campaigns.
 */
export function createSendColdEmailTool(config: ColdEmailConfig) {
  return tool({
    description:
      "Add leads to an Instantly.ai email campaign. You can provide leads directly or filter leads from the database by status/source. Leads are marked as 'contacted' after being added.",
    parameters: z.object({
      campaignId: z
        .string()
        .describe("The Instantly.ai campaign ID to add leads to"),
      leads: z
        .array(
          z.object({
            email: z.string(),
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            companyName: z.string().optional(),
          })
        )
        .optional()
        .describe("Direct list of leads to add"),
      filter: z
        .object({
          status: z
            .enum(["new", "contacted", "qualified", "converted", "rejected"])
            .optional(),
          source: z
            .enum(["google", "meta", "linkedin", "manual"])
            .optional(),
        })
        .optional()
        .describe(
          "Filter to pull leads from the database (e.g. { status: 'new' })"
        ),
    }),
    execute: async ({ campaignId, leads: directLeads, filter }) => {
      try {
        let leadsToSend: Array<{
          email: string;
          first_name?: string;
          last_name?: string;
          company_name?: string;
        }> = [];

        const leadIds: string[] = [];

        // If filter provided, read leads from Convex
        if (filter && !directLeads?.length) {
          const dbLeads = await config.convex.query(api.leads.listByStatus, {
            organizationId: config.organizationId,
            status: filter.status || "new",
            limit: 100,
          });

          for (const lead of dbLeads) {
            if (!lead.email) continue;

            const nameParts = lead.name.split(" ");
            leadsToSend.push({
              email: lead.email,
              first_name: nameParts[0],
              last_name: nameParts.slice(1).join(" ") || undefined,
              company_name: lead.company,
            });
            leadIds.push(lead._id);
          }
        } else if (directLeads?.length) {
          leadsToSend = directLeads.map((l) => ({
            email: l.email,
            first_name: l.firstName,
            last_name: l.lastName,
            company_name: l.companyName,
          }));
        }

        if (leadsToSend.length === 0) {
          return {
            __coldEmail: false,
            error:
              "No leads to send. Either provide leads directly or use a filter that matches existing leads with email addresses.",
            added: 0,
          };
        }

        // POST to Instantly API
        const res = await fetch(`${INSTANTLY_API_BASE}/lead/add`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: config.apiKey,
            campaign_id: campaignId,
            skip_if_in_workspace: true,
            leads: leadsToSend,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          return {
            __coldEmail: false,
            error: `Instantly API error (${res.status}): ${err.slice(0, 300)}`,
            added: 0,
          };
        }

        const result = await res.json();

        // Update lead statuses to "contacted" in Convex
        for (const leadId of leadIds) {
          try {
            await config.convex.mutation(api.leads.updateStatus, {
              id: leadId as Id<"leads">,
              status: "contacted",
            });
          } catch (err: any) {
            console.error("[cold_email] Failed to update lead status:", err);
          }
        }

        return {
          __coldEmail: true,
          campaignId,
          added: leadsToSend.length,
          dbLeadsUpdated: leadIds.length,
          instantlyResponse: result,
        };
      } catch (err: any) {
        console.error("[cold_email] Failed:", err);
        return {
          __coldEmail: false,
          error: `Failed to add leads to campaign: ${err.message?.slice(0, 300)}`,
          added: 0,
        };
      }
    },
  });
}

/**
 * Factory: creates a tool to check Instantly.ai campaign status/analytics.
 */
export function createGetEmailCampaignStatusTool(config: ColdEmailConfig) {
  return tool({
    description:
      "Check Instantly.ai campaign stats including leads count, emails sent, opened, replied, and bounced.",
    parameters: z.object({
      campaignId: z
        .string()
        .optional()
        .describe(
          "Specific campaign ID to check. If omitted, lists all campaigns."
        ),
    }),
    execute: async ({ campaignId }) => {
      try {
        if (!campaignId) {
          // List all campaigns
          const res = await fetch(
            `${INSTANTLY_API_BASE}/campaign/list?api_key=${encodeURIComponent(config.apiKey)}`
          );

          if (!res.ok) {
            const err = await res.text();
            return {
              __campaignStatus: false,
              error: `Instantly API error (${res.status}): ${err.slice(0, 300)}`,
            };
          }

          const campaigns = await res.json();
          return {
            __campaignStatus: true,
            campaigns: campaigns,
          };
        }

        // Get campaign analytics summary
        const params = new URLSearchParams({
          api_key: config.apiKey,
          campaign_id: campaignId,
        });

        const res = await fetch(
          `${INSTANTLY_API_BASE}/analytics/campaign/summary?${params}`
        );

        if (!res.ok) {
          const err = await res.text();
          return {
            __campaignStatus: false,
            error: `Instantly API error (${res.status}): ${err.slice(0, 300)}`,
          };
        }

        const analytics = await res.json();
        return {
          __campaignStatus: true,
          campaignId,
          analytics,
        };
      } catch (err: any) {
        console.error("[campaign_status] Failed:", err);
        return {
          __campaignStatus: false,
          error: `Failed to fetch campaign status: ${err.message?.slice(0, 300)}`,
        };
      }
    },
  });
}
