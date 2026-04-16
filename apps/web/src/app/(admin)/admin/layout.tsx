"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { api } from "../../../../convex/_generated/api";
import {
  Shield,
  Sparkles,
  LayoutDashboard,
  Building2,
  Users,
  BarChart3,
  Tag,
  Bot,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Organizations", href: "/admin/organizations", icon: Building2 },
  { label: "Platform Users", href: "/admin/platform-users", icon: Users },
  { label: "Usage Analytics", href: "/admin/analytics", icon: BarChart3 },
  { label: "Promo Codes", href: "/admin/promo-codes", icon: Tag },
  { label: "Agent Config", href: "/admin/agent-config", icon: Bot },
];

function AdminSidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const router = useRouter();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border/60 bg-card/30">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border/60 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20">
          <Shield className="h-4 w-4 text-amber-700" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none">Admin Panel</p>
          <p className="text-[10px] text-amber-700 mt-0.5">
            {role === "super_admin" ? "Super Admin" : "Staff"}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {ADMIN_NAV.map(({ label, href, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-amber-500/15 text-amber-700 font-medium"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border/60 px-2 py-3 space-y-0.5">
        <Link
          href="/home"
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-4 w-4 shrink-0" />
          Tenant Dashboard
        </Link>
        <button
          onClick={() => signOut(() => router.push("/sign-in"))}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-red-500/10 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const platformUser = useQuery(
    api.admin.checkAccess,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  useEffect(() => {
    if (isLoaded && user && platformUser === null) {
      router.push("/home");
    }
  }, [isLoaded, user, platformUser, router]);

  if (!isLoaded || platformUser === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-amber-700 animate-pulse" />
          </div>
          <p className="text-sm text-muted-foreground/60">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (platformUser === null) return null;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AdminSidebar role={platformUser.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Admin header bar */}
        <header className="flex h-14 items-center justify-between border-b border-border/60 bg-card/30 px-6 shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-700" />
            <span className="text-sm font-semibold text-amber-700">
              {platformUser.role === "super_admin" ? "Super Admin" : "Platform Staff"}
            </span>
            <span className="text-xs text-muted-foreground">
              — {platformUser.role === "super_admin" ? "Full Access" : "Staff Access"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{user?.emailAddresses?.[0]?.emailAddress}</p>
        </header>
        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
