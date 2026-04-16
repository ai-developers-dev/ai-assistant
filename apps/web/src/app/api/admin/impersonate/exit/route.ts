import { NextResponse } from "next/server";

/**
 * POST /api/admin/impersonate/exit
 * Clears the impersonation cookie and returns the admin to their normal session.
 */
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set("admin_impersonation", "", {
    path: "/",
    maxAge: 0,
  });
  return res;
}
