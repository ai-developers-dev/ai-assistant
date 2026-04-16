import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

const http = httpRouter();

// ── Clerk Webhook Handler ──
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
    if (!WEBHOOK_SECRET) {
      return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });
    }

    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Missing svix headers", { status: 400 });
    }

    const body = await request.text();
    const wh = new Webhook(WEBHOOK_SECRET);

    let evt: any;
    try {
      evt = wh.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch (err) {
      console.error("Webhook verification failed:", err);
      return new Response("Webhook verification failed", { status: 400 });
    }

    const eventType = evt.type;

    switch (eventType) {
      case "organization.created":
        await ctx.runMutation(internal.organizations.createFromClerk, {
          clerkOrgId: evt.data.id,
          name: evt.data.name,
          slug: evt.data.slug || undefined,
          imageUrl: evt.data.image_url || undefined,
        });
        break;

      case "organization.updated":
        await ctx.runMutation(internal.organizations.updateFromClerk, {
          clerkOrgId: evt.data.id,
          name: evt.data.name,
          slug: evt.data.slug || undefined,
          imageUrl: evt.data.image_url || undefined,
        });
        break;

      case "organization.deleted":
        await ctx.runMutation(internal.organizations.deleteFromClerk, {
          clerkOrgId: evt.data.id,
        });
        break;

      case "organizationMembership.created":
        await ctx.runMutation(internal.users.addToOrganization, {
          clerkUserId: evt.data.public_user_data.user_id,
          clerkOrgId: evt.data.organization.id,
          email: evt.data.public_user_data.identifier || "",
          name:
            [
              evt.data.public_user_data.first_name,
              evt.data.public_user_data.last_name,
            ]
              .filter(Boolean)
              .join(" ") || undefined,
          imageUrl: evt.data.public_user_data.image_url || undefined,
          role: mapClerkRole(evt.data.role),
        });
        break;

      case "organizationMembership.updated":
        await ctx.runMutation(internal.users.updateMembership, {
          clerkUserId: evt.data.public_user_data.user_id,
          clerkOrgId: evt.data.organization.id,
          role: mapClerkRole(evt.data.role),
        });
        break;

      case "organizationMembership.deleted":
        await ctx.runMutation(internal.users.removeFromOrganization, {
          clerkUserId: evt.data.public_user_data.user_id,
          clerkOrgId: evt.data.organization.id,
        });
        break;

      case "user.updated":
        await ctx.runMutation(internal.users.updateFromClerk, {
          clerkUserId: evt.data.id,
          email: evt.data.email_addresses?.[0]?.email_address || "",
          name:
            [evt.data.first_name, evt.data.last_name]
              .filter(Boolean)
              .join(" ") || undefined,
          imageUrl: evt.data.image_url || undefined,
        });
        break;

      case "user.deleted":
        await ctx.runMutation(internal.users.deleteFromClerk, {
          clerkUserId: evt.data.id,
        });
        break;

      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    return new Response("OK", { status: 200 });
  }),
});

// ── Stripe Webhook Handler ──
http.route({
  path: "/stripe-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    await ctx.runMutation(internal.billing.handleStripeWebhook, {
      body,
      signature,
    });

    return new Response("OK", { status: 200 });
  }),
});

function mapClerkRole(
  clerkRole: string
): "admin" | "member" | "viewer" {
  switch (clerkRole) {
    case "org:admin":
      return "admin";
    case "org:member":
      return "member";
    case "org:viewer":
      return "viewer";
    default:
      return "member";
  }
}

export default http;
