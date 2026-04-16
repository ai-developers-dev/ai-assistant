import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * POST /api/team/update-role
 * Tenant admin changes a team member's Convex role.
 * Requires Clerk orgRole = "org:admin".
 */
export async function POST(req: Request) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (orgRole !== "org:admin") {
    return NextResponse.json({ error: "Only org admins can change roles" }, { status: 403 });
  }

  const { callerId, targetId, newRole } = await req.json();
  if (!callerId || !targetId || !newRole) {
    return NextResponse.json({ error: "Missing callerId, targetId, or newRole" }, { status: 400 });
  }

  try {
    await convex.mutation(api.users.updateRole, {
      callerId: callerId as Id<"users">,
      targetId: targetId as Id<"users">,
      newRole,
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
