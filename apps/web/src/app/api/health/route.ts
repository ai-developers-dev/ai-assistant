import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

/**
 * Health probe for uptime monitoring.
 *
 * Returns 200 when Convex is reachable AND critical env vars are set.
 * Returns 503 with a per-service breakdown when anything is down.
 *
 * - `convex`: live check — runs api.health.ping (no DB reads)
 * - `resend`, `openrouter`, `clerk`: presence check of env vars
 *   (actual API pings would cost money on every probe)
 *
 * Safe to call unauthenticated; only returns configuration status,
 * no tenant data.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHECK_TIMEOUT_MS = 3000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Convex — live query ping
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    checks.convex = { ok: false, detail: "NEXT_PUBLIC_CONVEX_URL not set" };
  } else {
    try {
      const client = new ConvexHttpClient(convexUrl);
      const result = await withTimeout(client.query(api.health.ping, {}), CHECK_TIMEOUT_MS, "convex.ping");
      checks.convex = { ok: !!result?.ok };
    } catch (err: any) {
      checks.convex = { ok: false, detail: err?.message?.slice(0, 200) ?? "unknown error" };
    }
  }

  // Config presence checks — no outbound API calls (those cost money / quota)
  checks.resend = process.env.RESEND_API_KEY
    ? { ok: true }
    : { ok: false, detail: "RESEND_API_KEY not configured" };

  checks.openrouter = process.env.OPENROUTER_API_KEY
    ? { ok: true }
    : { ok: false, detail: "OPENROUTER_API_KEY not configured" };

  checks.clerk = process.env.CLERK_SECRET_KEY
    ? { ok: true }
    : { ok: false, detail: "CLERK_SECRET_KEY not configured" };

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { ok: allOk, services: checks, at: Date.now() },
    { status: allOk ? 200 : 503 }
  );
}
