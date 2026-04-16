"use client";

import { useEffect, useState } from "react";

export interface ImpersonationState {
  isImpersonating: boolean;
  orgId: string | null;       // Convex _id
  clerkOrgId: string | null;  // Clerk org ID (for org queries)
  orgName: string | null;
  roleView: "admin" | "member" | null;
}

const COOKIE_NAME = "admin_impersonation";

function readImpersonationCookie(): ImpersonationState {
  if (typeof document === "undefined") {
    return { isImpersonating: false, orgId: null, clerkOrgId: null, orgName: null, roleView: null };
  }
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) {
    return { isImpersonating: false, orgId: null, clerkOrgId: null, orgName: null, roleView: null };
  }
  try {
    const raw = match.split("=").slice(1).join("=");
    // Decode base64 → JSON string → parse
    const value = atob(raw);
    const parsed = JSON.parse(value);
    return {
      isImpersonating: true,
      orgId: parsed.orgId ?? null,
      clerkOrgId: parsed.clerkOrgId ?? null,
      orgName: parsed.orgName ?? null,
      roleView: parsed.roleView ?? null,
    };
  } catch {
    return { isImpersonating: false, orgId: null, clerkOrgId: null, orgName: null, roleView: null };
  }
}

export function useImpersonation(): ImpersonationState & { exit: () => Promise<void>; settled: boolean } {
  const [state, setState] = useState<ImpersonationState>(() => readImpersonationCookie());
  const [settled, setSettled] = useState(false);

  // Re-read cookie on mount (SSR renders with document=undefined, so useState
  // initializer returns isImpersonating:false. This effect corrects it after hydration.)
  useEffect(() => {
    setState(readImpersonationCookie());
    setSettled(true);
  }, []);

  // Re-read on focus (cookie may have changed in another tab)
  useEffect(() => {
    const refresh = () => setState(readImpersonationCookie());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const exit = async () => {
    await fetch("/api/admin/impersonate/exit", { method: "POST" });
    setState({ isImpersonating: false, orgId: null, clerkOrgId: null, orgName: null, roleView: null });
  };

  return { ...state, exit, settled };
}
