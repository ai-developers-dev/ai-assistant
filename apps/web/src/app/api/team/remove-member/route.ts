import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * POST /api/team/remove-member
 * Tenant admin removes a team member from the org in Convex.
 * Note: Clerk membership removal must also be done via Clerk dashboard
 * or by adding clerkClient.organizations.deleteOrganizationMembership() here.
 */
export async function POST(req: Request) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (orgRole !== "org:admin") {
    return NextResponse.json({ error: "Only org admins can remove members" }, { status: 403 });
  }

  const { callerId, targetId } = await req.json();
  if (!callerId || !targetId) {
    return NextResponse.json({ error: "Missing callerId or targetId" }, { status: 400 });
  }

  try {
    await convex.mutation(api.users.removeFromOrg, {
      callerId: callerId as Id<"users">,
      targetId: targetId as Id<"users">,
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
