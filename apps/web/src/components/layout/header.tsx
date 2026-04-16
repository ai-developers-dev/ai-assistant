"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import {
  CreditCard,
  LogOut,
  Settings,
  User,
  Zap,
  Search,
  Bell,
} from "lucide-react";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { MobileNav } from "./mobile-nav";

export function Header() {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const { org } = useEffectiveOrg();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const initials = getInitials(user.fullName || user.emailAddresses[0]?.emailAddress || "U");

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/50 bg-background/70 backdrop-blur-2xl px-4 md:px-6">
      <div className="flex items-center gap-3 md:gap-4">
        <MobileNav />
        {org && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground truncate max-w-[140px] md:max-w-none">
              {org.name}
            </span>
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-widest font-medium border-primary/30 text-primary/80"
            >
              {org.plan}
            </Badge>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="hidden md:flex items-center max-w-sm flex-1 mx-8">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Search projects, agents..."
            className="w-full h-9 pl-9 pr-4 rounded-lg bg-muted/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30 transition-all"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/40 bg-muted/80 px-1.5 py-0.5 rounded border border-border/30">
            /
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Usage Display */}
        {org && (
          <Link href="/settings">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/8 border border-primary/15 hover:bg-primary/12 transition-all cursor-pointer">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary">
                {org.monthlyRequestCount ?? 0}/{(org.monthlyRequestLimit ?? 50) >= 999999 ? "\u221E" : (org.monthlyRequestLimit ?? 50)}
              </span>
              <span className="text-[10px] text-primary/60">requests</span>
            </div>
          </Link>
        )}

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary pulse-dot" />
        </button>

        {/* User Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted/50 transition-all"
          >
            <Avatar className="h-8 w-8 ring-2 ring-border">
              <AvatarImage
                src={user.imageUrl}
                alt={user.fullName || "User"}
              />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-60 rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/20 z-50 overflow-hidden">
              <div className="p-3.5 border-b border-border/50 bg-muted/30">
                <p className="text-sm font-semibold truncate">
                  {user.fullName || "User"}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {user.emailAddresses[0]?.emailAddress}
                </p>
              </div>
              <div className="p-1.5">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    openUserProfile();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  Profile
                </button>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Settings
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  Billing
                </Link>
                <div className="border-t border-border/50 my-1" />
                <button
                  onClick={() => signOut({ redirectUrl: "/" })}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
