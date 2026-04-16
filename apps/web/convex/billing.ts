import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { PLAN_DEFAULTS } from "./organizations";

// Map Stripe price IDs to plan tiers.
// Update these when you create Stripe products.
const PRICE_TO_PLAN: Record<string, "starter" | "pro" | "enterprise"> = {
  // Starter — $20/month
  price_starter: "starter",
  // Pro — $50/month
  price_pro: "pro",
  // Enterprise — custom
  price_enterprise: "enterprise",
};

function getPlanForPriceId(priceId: string): "starter" | "pro" | "enterprise" | null {
  // Check exact match first, then check env-var overrides
  if (PRICE_TO_PLAN[priceId]) return PRICE_TO_PLAN[priceId];

  // Allow runtime configuration via env vars
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return "starter";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return "enterprise";

  return null;
}

export const handleStripeWebhook = internalMutation({
  args: {
    body: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    // Stripe webhook processing
    // In production, verify the signature with Stripe SDK
    let event: any;
    try {
      event = JSON.parse(args.body);
    } catch {
      console.error("Failed to parse Stripe webhook body");
      return;
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const orgId = session.metadata?.organizationId;
        if (!orgId) break;

        const org = await ctx.db
          .query("organizations")
          .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", orgId))
          .unique();

        if (org) {
          // Determine plan from the subscription's price
          const priceId = session.metadata?.priceId;
          const plan = priceId ? getPlanForPriceId(priceId) : null;
          const defaults = plan ? PLAN_DEFAULTS[plan] : null;

          await ctx.db.patch(org._id, {
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            ...(plan && defaults
              ? {
                  plan,
                  monthlyRequestLimit: defaults.monthlyRequestLimit,
                  monthlyRequestCount: 0,
                  currentBillingPeriodStart: Date.now(),
                  maxProjects: defaults.maxProjects,
                  maxStorageBytes: defaults.maxStorageBytes,
                  maxTeamMembers: defaults.maxTeamMembers,
                  maxScheduledTasks: defaults.maxScheduledTasks,
                }
              : {}),
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const org = await ctx.db
          .query("organizations")
          .withIndex("by_stripeCustomerId", (q) =>
            q.eq("stripeCustomerId", customerId)
          )
          .unique();

        if (org) {
          const priceId = subscription.items?.data?.[0]?.price?.id;
          const plan = priceId ? getPlanForPriceId(priceId) : null;
          const defaults = plan ? PLAN_DEFAULTS[plan] : null;

          await ctx.db.patch(org._id, {
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            stripeCurrentPeriodEnd:
              subscription.current_period_end * 1000,
            ...(plan && defaults
              ? {
                  plan,
                  monthlyRequestLimit: defaults.monthlyRequestLimit,
                  maxProjects: defaults.maxProjects,
                  maxStorageBytes: defaults.maxStorageBytes,
                  maxTeamMembers: defaults.maxTeamMembers,
                  maxScheduledTasks: defaults.maxScheduledTasks,
                }
              : {}),
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const org = await ctx.db
          .query("organizations")
          .withIndex("by_stripeCustomerId", (q) =>
            q.eq("stripeCustomerId", customerId)
          )
          .unique();

        if (org) {
          const defaults = PLAN_DEFAULTS.free;
          // Downgrade to free
          await ctx.db.patch(org._id, {
            plan: "free",
            stripeSubscriptionId: undefined,
            stripePriceId: undefined,
            stripeCurrentPeriodEnd: undefined,
            monthlyRequestLimit: defaults.monthlyRequestLimit,
            maxProjects: defaults.maxProjects,
            maxStorageBytes: defaults.maxStorageBytes,
            maxTeamMembers: defaults.maxTeamMembers,
            maxScheduledTasks: defaults.maxScheduledTasks,
          });
        }
        break;
      }
    }
  },
});
