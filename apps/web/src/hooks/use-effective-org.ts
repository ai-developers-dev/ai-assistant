"use client";

import { useOrganization } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useImpersonation } from "./use-impersonation";

/**
 * Returns the effective organization for the current session.
 * When a platform admin is impersonating a tenant, this returns the
 * impersonated org. Otherwise, returns the Clerk active org.
 */
export function useEffectiveOrg() {
  const { organization } = useOrganization();
  const {
    isImpersonating,
    clerkOrgId: impersonatedClerkOrgId,
    orgId: impersonatedOrgId,
    orgName: impersonatedOrgName,
    roleView,
    settled: impersonationSettled,
  } = useImpersonation();

  const effectiveClerkOrgId = isImpersonating
    ? impersonatedClerkOrgId
    : organization?.id;

  const org = useQuery(
    api.organizations.getCurrent,
    effectiveClerkOrgId ? { clerkOrgId: effectiveClerkOrgId } : "skip"
  );

  return {
    org,
    effectiveClerkOrgId,
    isImpersonating,
    impersonationSettled,
    impersonatedOrgName,
    roleView,
  };
}
