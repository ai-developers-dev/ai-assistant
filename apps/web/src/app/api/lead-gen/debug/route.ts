// POST /api/lead-gen/debug
// Returns what the pipeline sees: env vars present, org keys that decrypt
// successfully, and a masked token preview per provider. Used to diagnose
// "why is the key not being found" issues.

import { NextRequest, NextResponse } from "next/server";
import {
  verifyScheduler,
  getConvex,
  loadOrgContext,
  tokenOf,
} from "../_lib/shared";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const maxDuration = 30;

function mask(s?: string): string {
  if (!s) return "(empty)";
  if (s.length <= 8) return "***";
  return `${s.slice(0, 4)}…${s.slice(-3)} (${s.length} chars)`;
}

export async function POST(req: NextRequest) {
  const unauthed = verifyScheduler(req);
  if (unauthed) return unauthed;

  const body = await req.json().catch(() => ({}));
  const organizationId = body.organizationId as Id<"organizations">;

  const envCheck = {
    CREDENTIAL_ENCRYPTION_KEY: mask(process.env.CREDENTIAL_ENCRYPTION_KEY),
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL ?? "(missing)",
    SCHEDULER_INTERNAL_SECRET: mask(process.env.SCHEDULER_INTERNAL_SECRET),
    RESEND_API_KEY: mask(process.env.RESEND_API_KEY),
    GOOGLE_API_KEY: mask(process.env.GOOGLE_API_KEY),
    GOOGLE_GENERATIVE_AI_API_KEY: mask(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
  };

  if (!organizationId) {
    return NextResponse.json({ envCheck, note: "pass organizationId to see org credentials" });
  }

  const convex = getConvex();
  let credSummary: Record<string, any> = {};
  let orgLoadError: string | null = null;
  try {
    const { org, credentials } = await loadOrgContext(convex, organizationId);
    credSummary = {
      orgName: org.name,
      decryptedProviders: Object.keys(credentials),
      outscraper: mask(tokenOf(credentials.outscraper)),
      firecrawl: mask(tokenOf(credentials.firecrawl)),
      apollo: mask(tokenOf(credentials.apollo)),
      hunter: mask(tokenOf(credentials.hunter)),
      openai: mask(tokenOf(credentials.openai)),
      google: mask(tokenOf(credentials.google)),
      gmail_smtp_accounts_count:
        (credentials.gmail_smtp_accounts ?? []).length,
      warmed_email_accounts_count:
        (credentials.warmed_email_accounts ?? []).length,
      rawKeysInDb: Object.keys(
        (org.providerKeys as Record<string, unknown>) ?? {}
      ),
    };
  } catch (err: any) {
    orgLoadError = err?.message || String(err);
  }

  return NextResponse.json({ envCheck, credSummary, orgLoadError });
}
