"use client";

import { useImpersonation } from "@/hooks/use-impersonation";
import { useRouter } from "next/navigation";
import { Shield, X } from "lucide-react";

export function ImpersonationBanner() {
  const { isImpersonating, orgName, roleView, exit } = useImpersonation();
  const router = useRouter();

  if (!isImpersonating) return null;

  const handleExit = async () => {
    await exit();
    router.push("/admin/organizations");
    router.refresh();
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-4 bg-amber-500/15 border-b border-amber-500/30 px-6 py-2">
      <div className="flex items-center gap-2 text-amber-700">
        <Shield className="h-3.5 w-3.5 shrink-0" />
        <span className="text-xs font-semibold">
          Admin View:&nbsp;
          <span className="font-bold">{orgName}</span>
          &nbsp;
          <span className="font-normal opacity-70">(viewing as {roleView})</span>
        </span>
      </div>
      <button
        onClick={handleExit}
        className="flex items-center gap-1 rounded-md bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-500/30 transition-colors"
      >
        <X className="h-3 w-3" />
        Exit Impersonation
      </button>
    </div>
  );
}
