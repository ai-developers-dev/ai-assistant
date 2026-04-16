import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * POST /api/admin/impersonate
 * Sets an impersonation cookie so the dashboard renders with a different tenant's data.
 * Only super_admin platform users may impersonate.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const platformUser = await convex.query(api.admin.checkAccess, { clerkUserId: userId });
  if (!platformUser) {
    return NextResponse.json({ error: "Forbidden — platform users only" }, { status: 403 });
  }
  if (platformUser.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden — super_admin only" }, { status: 403 });
  }

  const { organizationId, roleView, orgName } = await req.json();
  if (!organizationId || !roleView || !orgName) {
    return NextResponse.json({ error: "Missing organizationId, roleView, or orgName" }, { status: 400 });
  }

  // Verify org exists
  const org = await convex.query(api.organizations.getById, {
    id: organizationId as Id<"organizations">,
  });
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  // Build the Set-Cookie header manually to avoid Next.js double-encoding.
  // Next.js cookies.set() calls encodeURIComponent internally, which breaks
  // JSON and base64 values when the client tries to decode them.
  const payload = JSON.stringify({ orgId: organizationId, clerkOrgId: org.clerkOrgId, orgName, roleView });
  const b64 = Buffer.from(payload).toString("base64");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const setCookie = `admin_impersonation=${b64}; Path=/; SameSite=Strict; Max-Age=${60 * 60 * 8}${secure}`;

  const res = NextResponse.json({ success: true });
  res.headers.append("Set-Cookie", setCookie);
  return res;
}
