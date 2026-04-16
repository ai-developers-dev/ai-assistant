// Shared types and constants

export type Plan = "free" | "pro" | "team" | "enterprise";

export type AgentType =
  | "general"
  | "images"
  | "documents"
  | "slides"
  | "chat"
  | "sheets"
  | "websites"
  | "videos"
  | "tools";

export type UserRole = "admin" | "member" | "viewer";

export const PLAN_DISPLAY_NAMES: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
  team: "Team",
  enterprise: "Enterprise",
};
