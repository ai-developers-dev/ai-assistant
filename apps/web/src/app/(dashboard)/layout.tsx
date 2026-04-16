"use client";

import { useAuth, useOrganization, useOrganizationList, useUser, OrganizationSwitcher } from "@clerk/nextjs";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sparkles, AlertTriangle } from "lucide-react";
import { Toaster } from "sonner";
import { useImpersonation } from "@/hooks/use-impersonation";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { SetupChecker } from "@/components/setup/setup-checker";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ALL hooks must be called unconditionally at the top — no early returns before hooks
  const { isLoaded, isSignedIn } = useAuth();
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { isImpersonating, settled: impersonationSettled } = useImpersonation();
  const { user } = useUser();
  const { org } = useEffectiveOrg();
  const pathname = usePathname();
  const router = useRouter();
  const { createOrganization, setActive, isLoaded: orgListLoaded, userMemberships } = useOrganizationList({ userMemberships: true });
  const [autoCreating, setAutoCreating] = useState(false);

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  // Auto-create org for new users with no organizations
  const handleAutoCreateOrg = useCallback(async () => {
    if (autoCreating || !createOrganization || !setActive || !user) return;
    setAutoCreating(true);
    try {
      const name = `${user.firstName || user.username || "My"}'s Workspace`;
      const newOrg = await createOrganization({ name });
      await setActive({ organization: newOrg.id });
      router.push("/onboarding");
    } catch (err) {
      console.error("Auto-create org failed:", err);
      setAutoCreating(false);
    }
  }, [autoCreating, createOrganization, setActive, user, router]);

  useEffect(() => {
    if (orgListLoaded && orgLoaded && !organization && impersonationSettled && !isImpersonating) {
      const hasOrgs = userMemberships?.data && userMemberships.data.length > 0;
      if (!hasOrgs && !autoCreating) {
        handleAutoCreateOrg();
      }
    }
  }, [orgListLoaded, orgLoaded, organization, impersonationSettled, isImpersonating, userMemberships, autoCreating, handleAutoCreateOrg]);

  // Enforce onboarding — redirect to /onboarding if not completed
  useEffect(() => {
    if (org && (org as any).onboardingCompleted === false && pathname !== "/onboarding" && !pathname.startsWith("/settings")) {
      router.push("/onboarding");
    }
  }, [org, pathname, router]);

  // Trial banner calculation
  const trialEndsAt = (org as any)?.trialEndsAt;
  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt - Date.now()) / (24 * 60 * 60 * 1000))) : null;
  const showTrialBanner = trialDaysLeft !== null && trialDaysLeft <= 3 && trialDaysLeft >= 0;

  // --- Early returns AFTER all hooks ---

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            </div>
            <div className="absolute inset-0 h-10 w-10 rounded-xl border-2 border-primary/30 animate-ping" />
          </div>
          <p className="text-sm text-muted-foreground/60">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) return null;

  // If no organization selected and auto-create is in progress, show loading
  if (orgLoaded && !organization && impersonationSettled && !isImpersonating) {
    if (autoCreating) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            </div>
            <p className="text-sm text-muted-foreground/60">Setting up your workspace...</p>
          </div>
        </div>
      );
    }

    // Fallback: show org switcher for users with existing orgs
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 p-8 rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl max-w-md w-full shadow-2xl shadow-black/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold">Select an Organization</h2>
            <p className="text-sm text-muted-foreground">
              Select an organization to get started.
            </p>
          </div>
          <OrganizationSwitcher
            afterCreateOrganizationUrl="/onboarding"
            afterSelectOrganizationUrl="/home"
          />
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Toaster position="top-right" richColors closeButton />
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <ImpersonationBanner />
          {showTrialBanner && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {trialDaysLeft === 0
                ? "Your Pro trial expires today. Upgrade to keep your campaigns running."
                : `Your Pro trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""}. Upgrade to keep your campaigns running.`}
              <a href="/settings#billing" className="ml-auto text-amber-800 hover:underline font-medium">Upgrade →</a>
            </div>
          )}
          <SetupChecker />
          <Header />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
