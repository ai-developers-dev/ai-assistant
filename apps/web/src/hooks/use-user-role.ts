"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffectiveOrg } from "./use-effective-org";

export type OrgRole = "admin" | "member" | "viewer" | null;

/**
 * Returns the current user's role in the active Clerk organization.
 * Returns null while loading or if no org/user is selected.
 */
export function useUserRole(): { role: OrgRole; isAdmin: boolean; isViewer: boolean; isLoaded: boolean } {
  const { user } = useUser();
  const { effectiveClerkOrgId } = useEffectiveOrg();

  const currentUser = useQuery(
    api.users.getCurrent,
    effectiveClerkOrgId && user?.id
      ? { clerkOrgId: effectiveClerkOrgId, clerkUserId: user.id }
      : "skip"
  );

  const isLoaded = currentUser !== undefined;
  const role = (currentUser?.role as OrgRole) ?? null;

  return {
    role,
    isAdmin: role === "admin",
    isViewer: role === "viewer",
    isLoaded,
  };
}
