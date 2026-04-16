import { tool } from "ai";
import type { Tool } from "ai";
import { calculatorTool } from "@/lib/tools/web-search";
import { firecrawlSearchTool, firecrawlDeepSearchTool, firecrawlScrapeTool, firecrawlMapTool } from "@/lib/tools/firecrawl-tools";
import { browserActionTool } from "@/lib/tools/browser-tools";
import { bookReservationTool } from "@/lib/tools/booking-tools";
import { executeCodeTool, installPackageTool } from "@/lib/tools/code-execution";
import {
  createSaveArtifactTool,
} from "@/lib/tools/save-artifact";
import {
  createAgentPlanTool,
  createUpdatePlanTool,
  createAgentReflectTool,
} from "@/lib/tools/agent-tools";

// ── Types ────────────────────────────────────────────────────────────

export type ToolProfile = "minimal" | "standard" | "research" | "automation" | "full";

export type ToolSection = "research" | "creation" | "automation" | "memory" | "meta";

export interface ToolCatalogEntry {
  id: string;
  label: string;
  description: string;
  section: ToolSection;
  profiles: ToolProfile[];
}

export interface DynamicToolConfig {
  textAccumulator: { current: string };
  dynamicTools?: Record<string, any>;
}

// ── Catalog ──────────────────────────────────────────────────────────

const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    id: "calculator",
    label: "Calculator",
    description: "Mathematical calculations",
    section: "research",
    profiles: ["minimal", "standard", "research", "automation", "full"],
  },
  {
    id: "web_search",
    label: "Web Search",
    description: "Search the web for information",
    section: "research",
    profiles: ["standard", "research", "automation", "full"],
  },
  {
    id: "deep_search",
    label: "Deep Search",
    description: "In-depth research on topics",
    section: "research",
    profiles: ["standard", "research", "automation", "full"],
  },
  {
    id: "read_webpage",
    label: "Read Webpage",
    description: "Extract content from web pages as clean markdown",
    section: "research",
    profiles: ["standard", "research", "automation", "full"],
  },
  {
    id: "map_website",
    label: "Map Website",
    description: "Discover all URLs on a website for targeted scraping",
    section: "research",
    profiles: ["research", "automation", "full"],
  },
  {
    id: "memory_save",
    label: "Memory Save",
    description: "Save information to persistent memory",
    section: "memory",
    profiles: ["research", "automation", "full"],
  },
  {
    id: "memory_search",
    label: "Memory Search",
    description: "Search persistent memory",
    section: "memory",
    profiles: ["research", "automation", "full"],
  },
  {
    id: "browser_action",
    label: "Browser Action",
    description: "Automated browser interactions",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "book_reservation",
    label: "Book Reservation",
    description: "Make reservations and bookings",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "read_file",
    label: "Read File",
    description: "Read uploaded file contents from project storage",
    section: "research",
    profiles: ["standard", "research", "automation", "full"],
  },
  {
    id: "execute_code",
    label: "Execute Code",
    description: "Run Python, JavaScript, or Bash in a cloud sandbox",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "install_package",
    label: "Install Package",
    description: "Install pip or npm packages in the code sandbox",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "google_prospect_search",
    label: "Google Prospect Search",
    description: "Find leads via Google Custom Search",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "meta_prospect_search",
    label: "Meta Prospect Search",
    description: "Find leads via Meta/Facebook API",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "linkedin_prospect_search",
    label: "LinkedIn Prospect Search",
    description: "Find leads via LinkedIn API",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "get_email_ready_businesses",
    label: "Email Ready Businesses",
    description: "Fetch businesses ready for email outreach",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "send_direct_email",
    label: "Send Direct Email",
    description: "Send personalized plain-text email via warmed Gmail/SMTP",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "google_places_search",
    label: "Outscraper Maps Search",
    description: "Find home service businesses in a city via Outscraper Google Maps",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "scrape_all_verticals",
    label: "Scrape All Verticals",
    description: "Scrape Google Maps for ALL verticals in a city with even distribution of daily target",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "enrich_business",
    label: "Enrich Business",
    description: "Find owner name, Meta page, and LinkedIn for a business",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "score_business_leads",
    label: "Score Business Leads",
    description: "Compute quality scores (0–100) for unscored business leads to prioritize outreach",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "outreach_sequence",
    label: "Outreach Sequence Queue",
    description: "View and manage the multi-touch outreach sequence — see what's due, skip, or prioritize",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "meta_friend_request",
    label: "Meta Message",
    description: "Send personalized messages to business Facebook Pages (10/day)",
    section: "automation",
    profiles: ["full"],
  },
  {
    id: "linkedin_connect",
    label: "LinkedIn Connect",
    description: "Send personalized LinkedIn connection requests to business owners (10/day)",
    section: "automation",
    profiles: ["full"],
  },
  {
    id: "save_insight",
    label: "Save Insight",
    description: "Save an AI-generated insight or recommendation to the database",
    section: "meta",
    profiles: ["research", "automation", "full"],
  },
  {
    id: "log_decision",
    label: "Log Decision",
    description: "Log agent decisions (sent/skipped/deferred) for every business processed",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "post_to_reddit",
    label: "Post to Reddit",
    description: "Post helpful content to Reddit communities for a business vertical",
    section: "automation",
    profiles: ["full"],
  },
  {
    id: "post_to_meta_group",
    label: "Post to Meta Group",
    description: "Post helpful content to Facebook groups for a business vertical",
    section: "automation",
    profiles: ["full"],
  },
  {
    id: "find_social_groups",
    label: "Find Social Groups",
    description: "Find relevant Reddit communities and Facebook groups for a business vertical",
    section: "research",
    profiles: ["automation", "full"],
  },
  {
    id: "find_youtube_videos",
    label: "Find YouTube Videos",
    description: "Search YouTube for relevant videos",
    section: "research",
    profiles: ["automation", "full"],
  },
  {
    id: "post_youtube_comment",
    label: "Post YouTube Comment",
    description: "Post a comment on a YouTube video",
    section: "automation",
    profiles: ["full"],
  },
  {
    id: "find_twitter_threads",
    label: "Find Twitter Threads",
    description: "Search Twitter/X for relevant tweets",
    section: "research",
    profiles: ["automation", "full"],
  },
  {
    id: "post_tweet",
    label: "Post Tweet",
    description: "Post a tweet on Twitter/X",
    section: "automation",
    profiles: ["full"],
  },
  {
    id: "post_to_discord",
    label: "Post to Discord",
    description: "Post a message to Discord via webhook",
    section: "automation",
    profiles: ["full"],
  },
  {
    id: "find_quora_questions",
    label: "Find Quora Questions",
    description: "Find relevant Quora questions for manual answering",
    section: "research",
    profiles: ["automation", "full"],
  },
  {
    id: "find_nextdoor_communities",
    label: "Find Nextdoor Communities",
    description: "Find Nextdoor community discussions",
    section: "research",
    profiles: ["automation", "full"],
  },
  {
    id: "get_businesses_by_status",
    label: "Get Businesses by Status",
    description: "Fetch businesses filtered by pipeline status (new, enriching, ready, all_sent)",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "get_campaign_summary",
    label: "Campaign Summary",
    description: "Get a complete snapshot of campaign progress: city scraping, business counts, and today's activity",
    section: "automation",
    profiles: ["automation", "full"],
  },
  {
    id: "delegate_to_agent",
    label: "Delegate to Agent",
    description: "Delegate sub-tasks to specialist agents",
    section: "meta",
    profiles: ["full"],
  },
  {
    id: "save_artifact",
    label: "Save Artifact",
    description: "Save generated content as downloadable files",
    section: "creation",
    profiles: ["minimal", "standard", "research", "automation", "full"],
  },
  {
    id: "agent_plan",
    label: "Agent Plan",
    description: "Create an execution plan",
    section: "meta",
    profiles: ["minimal", "standard", "research", "automation", "full"],
  },
  {
    id: "update_plan",
    label: "Update Plan",
    description: "Update plan step status",
    section: "meta",
    profiles: ["minimal", "standard", "research", "automation", "full"],
  },
  {
    id: "agent_reflect",
    label: "Agent Reflect",
    description: "Reflect on progress and adjust",
    section: "meta",
    profiles: ["minimal", "standard", "research", "automation", "full"],
  },
];

// ── Static tool registry (tools that don't need per-request config) ──

const STATIC_TOOLS: Record<string, any> = {
  web_search: firecrawlSearchTool,
  calculator: calculatorTool,
  deep_search: firecrawlDeepSearchTool,
  read_webpage: firecrawlScrapeTool,
  map_website: firecrawlMapTool,
  browser_action: browserActionTool,
  book_reservation: bookReservationTool,
  execute_code: executeCodeTool,
  install_package: installPackageTool,
};

// ── Profile hierarchy (each profile includes tools from lower profiles) ──

const PROFILE_HIERARCHY: Record<ToolProfile, ToolProfile[]> = {
  minimal: ["minimal"],
  standard: ["minimal", "standard"],
  research: ["minimal", "standard", "research"],
  automation: ["minimal", "standard", "research", "automation"],
  full: ["minimal", "standard", "research", "automation", "full"],
};

// ── Resolver ─────────────────────────────────────────────────────────

/**
 * Resolves the final set of tools based on agent profile, explicit enabled
 * list, and per-request dynamic config (text accumulator, memory tools, etc.).
 */
export function resolveTools(
  profile: ToolProfile,
  enabledToolOverrides: string[] | undefined,
  config: DynamicToolConfig
): Record<string, any> {
  const tools: Record<string, any> = {};

  // Always include per-request tools that need config
  tools.save_artifact = createSaveArtifactTool(config.textAccumulator);
  tools.agent_plan = createAgentPlanTool();
  tools.update_plan = createUpdatePlanTool();
  tools.agent_reflect = createAgentReflectTool();

  // Inject dynamic tools (memory, delegation) — they're gated by the caller
  if (config.dynamicTools) {
    Object.assign(tools, config.dynamicTools);
  }

  // If explicit overrides are provided, use them (backward compat with enabledTools)
  if (enabledToolOverrides && enabledToolOverrides.length > 0) {
    for (const toolId of enabledToolOverrides) {
      if (STATIC_TOOLS[toolId]) {
        tools[toolId] = STATIC_TOOLS[toolId];
      }
    }
    return tools;
  }

  // Otherwise, resolve from profile
  const allowedProfiles = PROFILE_HIERARCHY[profile] || PROFILE_HIERARCHY.standard;

  for (const entry of TOOL_CATALOG) {
    // Check if the tool belongs to an allowed profile level
    const inProfile = entry.profiles.some((p) => allowedProfiles.includes(p));
    if (!inProfile) continue;

    // Static tools come from registry; dynamic/per-request tools are already injected
    if (STATIC_TOOLS[entry.id]) {
      tools[entry.id] = STATIC_TOOLS[entry.id];
    }
    // Dynamic tools (memory_save, memory_search, delegate_to_agent, save_artifact, etc.)
    // are already in `tools` from the dynamic injection above — no action needed
  }

  return tools;
}

/**
 * Get catalog metadata for UI display (tool picker, profile info, etc.)
 */
export function getCatalogEntries(): ToolCatalogEntry[] {
  return TOOL_CATALOG;
}

/**
 * Get which tools a profile includes (for UI display).
 */
export function getToolsForProfile(profile: ToolProfile): string[] {
  const allowedProfiles = PROFILE_HIERARCHY[profile] || PROFILE_HIERARCHY.standard;
  return TOOL_CATALOG
    .filter((entry) => entry.profiles.some((p) => allowedProfiles.includes(p)))
    .map((entry) => entry.id);
}
