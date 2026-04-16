import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * POST /api/admin/create-tenant
 *
 * Creates a real Clerk organization + sends an email invitation to the owner.
 * The Clerk webhook (organization.created) will automatically create the Convex
 * org record. When the invitee accepts and signs in, organizationMembership.created
 * fires and creates their Convex user record.
 *
 * Body: { name, slug?, ownerEmail, plan }
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify caller is a platform user
  const platformUser = await convex.query(api.admin.checkAccess, {
    clerkUserId: userId,
  });
  if (!platformUser || platformUser.role !== "super_admin") {
    return NextResponse.json({ error: "Only super admins can create tenants." }, { status: 403 });
  }

  const { name, slug, ownerEmail, plan } = await req.json();
  if (!name || !ownerEmail) {
    return NextResponse.json({ error: "name and ownerEmail are required." }, { status: 400 });
  }

  const client = await clerkClient();

  // 1. Create the Clerk organization (created by the platform admin)
  let org: Awaited<ReturnType<typeof client.organizations.createOrganization>>;
  try {
    org = await client.organizations.createOrganization({
      name,
      createdBy: userId,
    });
  } catch (err: any) {
    const msg = err?.errors?.[0]?.message ?? err.message ?? "Failed to create organization";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 2. Set the plan on the Convex org once the webhook creates it
  //    (webhook fires async, so we store desired plan in org metadata for now
  //     and also update via Convex mutation after a short moment)
  //    We'll pass plan in the invitation redirect URL so the webhook can pick it up,
  //    OR we patch the Convex record after webhook fires. For simplicity: store in
  //    Clerk org publicMetadata so we can read it in the webhook.
  try {
    await client.organizations.updateOrganizationMetadata(org.id, {
      publicMetadata: { plan: plan ?? "free" },
    });
  } catch {
    // Non-fatal — plan will default to free, admin can change it manually
  }

  // 3. Invite the owner by email as org:admin
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    await client.organizations.createOrganizationInvitation({
      organizationId: org.id,
      emailAddress: ownerEmail,
      role: "org:admin",
      redirectUrl: `${appUrl}/sign-in`,
    });
  } catch (err: any) {
    // Org was created — return partial success so admin knows
    const msg = err?.errors?.[0]?.message ?? err.message ?? "Failed to send invitation";
    return NextResponse.json({
      success: true,
      orgId: org.id,
      warning: `Organization created but invitation failed: ${msg}. Invite the user manually from Clerk dashboard.`,
    });
  }

  return NextResponse.json({
    success: true,
    orgId: org.id,
    message: `Organization created and invitation sent to ${ownerEmail}.`,
  });
}
