import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Outbound webhook dispatch for Zapier/Make/Slack/custom integrations.
 * Reads the org's `webhooks` array and POSTs to enabled URLs matching the event type.
 */
export const dispatch = internalAction({
  args: {
    organizationId: v.id("organizations"),
    event: v.string(), // "lead.scraped" | "lead.enriched" | "lead.emailed" | "lead.replied"
    payload: v.any(),  // Event-specific data
  },
  handler: async (ctx, { organizationId, event, payload }) => {
    const webhooks = await ctx.runQuery(internal.webhookDispatch.getOrgWebhooks, {
      organizationId,
    });

    if (!webhooks || webhooks.length === 0) return { dispatched: 0 };

    const matching = webhooks.filter((w) => w.enabled && w.event === event);
    if (matching.length === 0) return { dispatched: 0 };

    let dispatched = 0;
    for (const webhook of matching) {
      try {
        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Event": event,
            "X-Webhook-Timestamp": String(Date.now()),
          },
          body: JSON.stringify({
            event,
            timestamp: new Date().toISOString(),
            organizationId,
            data: payload,
          }),
        });

        if (!response.ok) {
          console.error(`[webhook] ${event} → ${webhook.url} failed: ${response.status}`);
        } else {
          dispatched++;
        }
      } catch (err: any) {
        console.error(`[webhook] ${event} → ${webhook.url} error: ${err.message}`);
      }
    }

    return { dispatched };
  },
});

export const getOrgWebhooks = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const org = await ctx.db.get(organizationId);
    return (org?.webhooks as Array<{ event: string; url: string; enabled: boolean }>) ?? [];
  },
});
