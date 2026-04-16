import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** Minimal HTML escape for reflecting user-provided values into markup. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * GET — Shows a confirmation page instead of immediately unsubscribing.
 * This prevents false unsubscribes from link prefetchers (Gmail, Outlook).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const email = searchParams.get("email");
  const orgId = searchParams.get("orgId");

  if (!email || !orgId) {
    return htmlResponse(errorPage("Invalid unsubscribe link."), 400);
  }

  return htmlResponse(confirmationPage(email, orgId), 200);
}

/**
 * POST — Processes the actual unsubscribe.
 * Supports two modes:
 * 1. RFC 8058 one-click: body is "List-Unsubscribe=One-Click" (from email client)
 * 2. Form submission: body has email + orgId fields (from confirmation page)
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  let email: string | null = null;
  let orgId: string | null = null;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await req.formData();
    const bodyText = formData.get("List-Unsubscribe")?.toString();

    if (bodyText === "One-Click") {
      // RFC 8058 one-click unsubscribe — extract from URL query params
      const { searchParams } = req.nextUrl;
      email = searchParams.get("email");
      orgId = searchParams.get("orgId");
    } else {
      // Form submission from confirmation page
      email = formData.get("email")?.toString() ?? null;
      orgId = formData.get("orgId")?.toString() ?? null;
    }
  }

  if (!email || !orgId) {
    return htmlResponse(errorPage("Invalid unsubscribe request."), 400);
  }

  try {
    const business = await convex.query(api.businesses.findByEmail, {
      organizationId: orgId as Id<"organizations">,
      email,
    });

    if (business) {
      await convex.mutation(api.businesses.updateEmailStatus, {
        id: business._id as Id<"businesses">,
        emailStatus: "unsubscribed",
      });
    }

    return htmlResponse(
      successPage("You've been successfully unsubscribed. You won't receive any more emails from us."),
      200
    );
  } catch {
    return htmlResponse(
      errorPage("Something went wrong. Please try again or reply to the email to unsubscribe."),
      500
    );
  }
}

function htmlResponse(html: string, status: number) {
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html" },
  });
}

function pageShell(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f9f9f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 8px; padding: 40px; max-width: 480px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    h1 { font-size: 20px; color: #1a1a1a; margin-bottom: 12px; }
    p { font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 16px; }
    .btn { display: inline-block; background: #1a1a1a; color: white; padding: 12px 32px; border-radius: 6px; font-size: 15px; font-weight: 500; border: none; cursor: pointer; text-decoration: none; }
    .btn:hover { background: #333; }
    .muted { font-size: 13px; color: #888; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">${content}</div>
</body>
</html>`;
}

function confirmationPage(email: string, orgId: string): string {
  const safeEmail = escapeHtml(email);
  const safeOrgId = escapeHtml(orgId);
  return pageShell(
    "Unsubscribe",
    `<h1>Unsubscribe</h1>
    <p>Click the button below to unsubscribe <strong>${safeEmail}</strong> from future emails.</p>
    <form method="POST" action="/api/unsubscribe">
      <input type="hidden" name="email" value="${safeEmail}" />
      <input type="hidden" name="orgId" value="${safeOrgId}" />
      <button type="submit" class="btn">Confirm Unsubscribe</button>
    </form>
    <p class="muted">If you didn't request this, you can safely close this page.</p>`
  );
}

function successPage(message: string): string {
  return pageShell("Unsubscribed", `<h1>Unsubscribed</h1><p>${message}</p>`);
}

function errorPage(message: string): string {
  return pageShell("Unsubscribe", `<h1>Unsubscribe</h1><p>${message}</p>`);
}
