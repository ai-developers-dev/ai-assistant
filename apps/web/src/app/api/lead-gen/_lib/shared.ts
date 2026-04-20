// ════════════════════════════════════════════════════════════════════════
// Shared helpers for the /api/lead-gen/* endpoints.
// ════════════════════════════════════════════════════════════════════════
//
// Every endpoint is called by the Convex leadGenPipeline via the
// X-Scheduler-Secret header, so there is no Clerk session. We verify
// the shared secret and then load the org's decrypted provider keys.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  decryptProviderKeys,
  type DecryptedProviderKeys,
} from "@/lib/credentials/provider-keys";

export function verifyScheduler(req: Request): Response | null {
  const secret = req.headers.get("x-scheduler-secret");
  if (
    !secret ||
    !process.env.SCHEDULER_INTERNAL_SECRET ||
    secret !== process.env.SCHEDULER_INTERNAL_SECRET
  ) {
    return new Response(
      JSON.stringify({ error: "Unauthorized — scheduler secret required" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}

export function getConvex(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

export async function loadOrgContext(
  convex: ConvexHttpClient,
  organizationId: Id<"organizations">
): Promise<{
  org: any;
  credentials: DecryptedProviderKeys;
}> {
  const org = await convex.query(api.organizations.getById, {
    id: organizationId,
  });
  if (!org) throw new Error(`Org ${organizationId} not found`);
  const credentials = decryptProviderKeys(
    (org.providerKeys ?? {}) as Record<string, any>,
    organizationId as unknown as string
  );
  return { org, credentials };
}

// Helper to extract a single token from a credential record (string, OAuth, or api_key shape)
export function tokenOf(cred: any): string | undefined {
  if (!cred) return undefined;
  if (typeof cred === "string") return cred;
  if (typeof cred === "object" && "token" in cred) return cred.token as string;
  return undefined;
}
