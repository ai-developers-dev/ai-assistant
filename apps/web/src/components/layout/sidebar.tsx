"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import {
  Sparkles,
  Home,
  Bot,
  Clock,
  KanbanSquare,
  LayoutTemplate,
  Trophy,
  TrendingUp,
  Plus,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  Folder,
  Target,
  FileText,
  Inbox,
} from "lucide-react";
import { useState } from "react";

export const NAV_ITEMS = [
  { label: "Home", href: "/home", icon: Home },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Tasks", href: "/tasks", icon: KanbanSquare },
  { label: "Scheduled", href: "/scheduled", icon: Clock },
  { label: "Activity", href: "/leads", icon: Target },
  { label: "Inbox", href: "/inbox", icon: Inbox },

  { label: "Templates", href: "/templates", icon: LayoutTemplate },
  { label: "Insights", href: "/insights", icon: TrendingUp },
  { label: "Showcase", href: "/showcase", icon: Trophy },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useUser();
  const { org } = useEffectiveOrg();

  const platformUser = useQuery(
    api.admin.checkAccess,
    user?.id ? { clerkUserId: user.id } : "skip"
  );

  const projects = useQuery(
    api.projects.getRecent,
    org?._id ? { organizationId: org._id, limit: 8 } : "skip"
  );

  return (
    <aside
      className={cn(
        // Hidden below md — mobile users get the MobileNav drawer instead.
        "hidden md:flex flex-col h-full border-r border-border/50 bg-background/70 backdrop-blur-2xl transition-all duration-300 ease-in-out",
        collapsed ? "w-[68px]" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
        {!collapsed && (
          <Link href="/home" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 ring-1 ring-primary/20">
              <Sparkles className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm text-sidebar-foreground tracking-tight">
                AgentPlatform
              </span>
              <span className="text-[10px] text-muted-foreground leading-none">
                AI Workspace
              </span>
            </div>
          </Link>
        )}
        {collapsed && (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 ring-1 ring-primary/20 mx-auto">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "p-1.5 rounded-lg hover:bg-sidebar-accent/60 text-muted-foreground transition-colors",
            collapsed && "absolute -right-3 top-5 bg-sidebar border border-sidebar-border z-10 shadow-lg"
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* New Project Button */}
      <div className="p-3">
        <Link href="/project/new">
          <Button
            className={cn(
              "w-full gap-2 bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20 shadow-none",
              collapsed && "px-0 justify-center"
            )}
            size={collapsed ? "icon" : "default"}
            variant="ghost"
          >
            <Plus className="h-4 w-4" />
            {!collapsed && <span className="font-medium">New Project</span>}
          </Button>
        </Link>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 overflow-hidden flex flex-col">
        <div className="px-2.5 py-1 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/40",
                  collapsed && "justify-center px-0"
                )}
              >
                <item.icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>

        {/* Projects List */}
        {!collapsed && (
          <div className="flex-1 overflow-hidden flex flex-col mt-2">
            <div className="flex items-center justify-between px-5 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                Projects
              </span>
              <span className="text-[10px] text-muted-foreground/50">
                {projects?.length || 0}
              </span>
            </div>
            <ScrollArea className="flex-1 px-2.5">
              <div className="space-y-0.5 pb-4">
                {projects?.map((project: Doc<"projects">) => {
                  const isActive = pathname === `/project/${project._id}`;
                  return (
                    <Link
                      key={project._id}
                      href={`/project/${project._id}`}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-150",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                      )}
                    >
                      <Folder className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      <span className="truncate text-[13px]">{project.name}</span>
                      {project.agentConfig?.proMode && (
                        <Badge
                          variant="secondary"
                          className="ml-auto text-[9px] px-1 py-0 bg-primary/20 text-primary border-0"
                        >
                          Pro
                        </Badge>
                      )}
                    </Link>
                  );
                })}
                {projects && projects.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-6 px-3">
                    <Folder className="h-5 w-5 text-muted-foreground/30" />
                    <p className="text-[11px] text-muted-foreground/50 text-center">
                      No projects yet
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </nav>

      {/* Footer: Admin + Settings */}
      <div className="border-t border-sidebar-border p-2.5 space-y-0.5">
        {platformUser && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-all duration-150",
              collapsed && "justify-center px-0",
              pathname?.startsWith("/admin") &&
                "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            )}
          >
            <Shield className={cn("h-4 w-4 shrink-0", pathname?.startsWith("/admin") && "text-amber-700")} />
            {!collapsed && <span>Admin</span>}
          </Link>
        )}
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-all duration-150",
            collapsed && "justify-center px-0",
            pathname?.startsWith("/settings") &&
              "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          )}
        >
          <Settings className={cn("h-4 w-4 shrink-0", pathname?.startsWith("/settings") && "text-primary")} />
          {!collapsed && <span>Settings</span>}
        </Link>
      </div>
    </aside>
  );
}
