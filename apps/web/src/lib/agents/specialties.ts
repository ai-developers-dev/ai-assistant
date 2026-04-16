import type { ToolProfile } from "@/lib/tools/catalog";

export interface AgentSpecialty {
  id: string;
  label: string;
  description: string;
  icon: string;
  defaultProfile: ToolProfile;
  defaultTools: string[];
  promptSnippet: string;
}

export const AGENT_SPECIALTIES: AgentSpecialty[] = [
  {
    id: "research",
    label: "Research Agent",
    description: "Web search, deep research, data gathering",
    icon: "Search",
    defaultProfile: "research",
    defaultTools: ["web_search", "deep_search", "read_webpage", "map_website"],
    promptSnippet:
      "You are a research specialist. Excel at finding, verifying, and synthesizing information from multiple sources.",
  },
  {
    id: "coding",
    label: "Coding Agent",
    description: "Code generation, debugging, technical tasks",
    icon: "Code",
    defaultProfile: "automation",
    defaultTools: ["execute_code", "install_package", "web_search"],
    promptSnippet:
      "You are a coding specialist. Write clean, efficient, well-tested code.",
  },
  {
    id: "image_generation",
    label: "Image Generator",
    description: "Visual content creation and editing",
    icon: "Image",
    defaultProfile: "minimal",
    defaultTools: ["web_search"],
    promptSnippet:
      "You are an image creation specialist. Help create, describe, and plan visual content.",
  },
  {
    id: "web_development",
    label: "Web Developer",
    description: "Next.js, Tailwind CSS, shadcn/ui, Python, HTML/CSS/JS",
    icon: "Globe",
    defaultProfile: "automation",
    defaultTools: ["web_search", "deep_search", "read_webpage", "map_website", "execute_code"],
    promptSnippet:
      "You are a web development specialist. Build professional, responsive websites and web applications using modern frameworks including Next.js, React, Tailwind CSS, shadcn/ui, HTML/CSS/JS, and Python backend services. You excel at full-stack development with component libraries and utility-first CSS.",
  },
  {
    id: "data_analysis",
    label: "Data Analyst",
    description: "Spreadsheets, calculations, data visualization",
    icon: "BarChart",
    defaultProfile: "research",
    defaultTools: ["calculator", "read_file", "execute_code"],
    promptSnippet:
      "You are a data analysis specialist. Analyze data, compute statistics, and visualize results.",
  },
  {
    id: "writing",
    label: "Content Writer",
    description: "Articles, documents, reports, proposals",
    icon: "FileText",
    defaultProfile: "research",
    defaultTools: ["web_search", "deep_search", "read_webpage"],
    promptSnippet:
      "You are a writing specialist. Create polished, well-structured written content.",
  },
  {
    id: "testing",
    label: "Testing Agent",
    description: "QA, test planning, verification",
    icon: "CheckSquare",
    defaultProfile: "automation",
    defaultTools: ["execute_code", "web_search", "browser_action"],
    promptSnippet:
      "You are a QA testing specialist. Plan tests, verify functionality, and report issues.",
  },
  {
    id: "automation",
    label: "Automation Agent",
    description: "Browser automation, booking, workflows",
    icon: "Zap",
    defaultProfile: "full",
    defaultTools: ["browser_action", "book_reservation", "execute_code"],
    promptSnippet:
      "You are an automation specialist. Automate workflows, browser tasks, and bookings.",
  },
  {
    id: "video_production",
    label: "Video Producer",
    description: "Video scripts, storyboards, production planning",
    icon: "Video",
    defaultProfile: "standard",
    defaultTools: ["web_search"],
    promptSnippet:
      "You are a video production specialist. Script, storyboard, and plan video content.",
  },
  {
    id: "presentation",
    label: "Presentation Designer",
    description: "Slide decks and visual presentations",
    icon: "Presentation",
    defaultProfile: "standard",
    defaultTools: ["web_search"],
    promptSnippet:
      "You are a presentation specialist. Create compelling slide decks and visual stories.",
  },
  {
    id: "general",
    label: "General Assistant",
    description: "Versatile agent for any task",
    icon: "Sparkles",
    defaultProfile: "standard",
    defaultTools: ["web_search", "calculator", "deep_search", "read_webpage"],
    promptSnippet: "You are a versatile assistant. Handle any task efficiently.",
  },
  {
    id: "prospecting",
    label: "Google Prospecting Agent",
    description: "Find leads via Google Custom Search API",
    icon: "Target",
    defaultProfile: "automation",
    defaultTools: ["google_prospect_search", "web_search", "deep_search", "read_webpage", "map_website"],
    promptSnippet:
      "You are a Google prospecting specialist. Use the Google Custom Search API to find business leads, research companies, extract contact information, and save all findings to the leads database. Always save discovered leads using the google_prospect_search tool.",
  },
  {
    id: "meta_prospecting",
    label: "Meta Prospecting Agent",
    description: "Find leads via Meta/Facebook Marketing API",
    icon: "Target",
    defaultProfile: "automation",
    defaultTools: ["meta_prospect_search", "web_search", "deep_search"],
    promptSnippet:
      "You are a Meta/Facebook prospecting specialist. Use the Meta Marketing API to find business pages, extract contact information, analyze audiences, and save all findings to the leads database.",
  },
  {
    id: "linkedin_prospecting",
    label: "LinkedIn Prospecting Agent",
    description: "Find leads via LinkedIn API",
    icon: "Linkedin",
    defaultProfile: "automation",
    defaultTools: ["linkedin_prospect_search", "web_search", "deep_search"],
    promptSnippet:
      "You are a LinkedIn prospecting specialist. Use the LinkedIn API to find professionals, decision-makers, and companies. Extract profile information and save all findings to the leads database.",
  },
  {
    id: "cold_email",
    label: "Cold Email Agent",
    description: "Send cold emails via Instantly.ai from collected leads",
    icon: "Mail",
    defaultProfile: "automation",
    defaultTools: ["send_cold_email", "get_email_campaign_status", "web_search"],
    promptSnippet:
      "You are a cold email outreach specialist using Instantly.ai. Read leads from the database, help craft personalized email sequences, add leads to campaigns, and monitor campaign performance. Always verify lead quality before adding to campaigns.",
  },
  {
    id: "seo",
    label: "SEO Agent",
    description: "Keyword research, content optimization, site audits",
    icon: "TrendingUp",
    defaultProfile: "research",
    defaultTools: ["web_search", "deep_search", "read_webpage", "map_website"],
    promptSnippet:
      "You are an SEO specialist. Excel at keyword research, content optimization, site audits, competitor SEO analysis, meta tags, and content gap identification.",
  },
  {
    id: "social_media",
    label: "Social Media Agent",
    description: "Platform content, calendars, hashtag strategy",
    icon: "Share2",
    defaultProfile: "standard",
    defaultTools: ["web_search", "deep_search"],
    promptSnippet:
      "You are a social media specialist. Create platform-specific content, content calendars, captions/hooks, hashtag strategy, and trend analysis.",
  },
  {
    id: "marketing",
    label: "Marketing Agent",
    description: "Campaigns, ad copy, funnels, email sequences",
    icon: "Megaphone",
    defaultProfile: "research",
    defaultTools: ["web_search", "deep_search", "read_webpage"],
    promptSnippet:
      "You are a marketing specialist. Excel at campaign planning, ad copy for Google/Meta/LinkedIn, funnel design, email sequences, A/B tests, and KPI tracking.",
  },
  {
    id: "reservation",
    label: "Reservation Agent",
    description: "Book hotels, restaurants, and travel via browser automation",
    icon: "Globe",
    defaultProfile: "full",
    defaultTools: [
      "browser_action",
      "book_reservation",
      "web_search",
      "read_webpage",
      "map_website",
    ],
    promptSnippet:
      "You are a reservation and booking specialist. Use the browser to log into booking services (OpenTable, Resy, Expedia, Booking.com, Marriott, Traveligo, etc.) with stored credentials, search for availability, compare options, and complete reservations as instructed. Always confirm booking details with the user before finalizing. Use web search and page reading to find the best deals.",
  },
  {
    id: "insights",
    label: "Insights Agent",
    description: "Analyzes completed tasks, agent performance, and recommends improvements",
    icon: "TrendingUp",
    defaultProfile: "research",
    defaultTools: ["web_search", "deep_search", "calculator", "save_insight"],
    promptSnippet:
      "You are an insights and optimization specialist. Analyze completed scheduled tasks, agent execution history, team performance metrics, and overall platform usage. Identify patterns, failures, bottlenecks, and opportunities. Provide actionable recommendations to improve each agent's effectiveness, suggest new automations, flag underperforming tasks, and recommend configuration changes. Be specific and data-driven in your analysis. ALWAYS use the save_insight tool to record each recommendation so it appears on the Insights page.",
  },
  {
    id: "customer_support",
    label: "Customer Support Agent",
    description: "FAQ docs, help desk, knowledge base",
    icon: "Headphones",
    defaultProfile: "standard",
    defaultTools: ["web_search", "deep_search"],
    promptSnippet:
      "You are a customer support specialist. Create FAQ docs, help desk responses, ticket pattern analysis, knowledge base articles, and canned responses.",
  },
  {
    id: "prompt_engineer",
    label: "Prompt Engineer",
    description: "Reviews and improves agent prompts for better results",
    icon: "FileText",
    defaultProfile: "research",
    defaultTools: ["web_search"],
    promptSnippet:
      "You are a prompt engineering specialist. Analyze agent prompts and outreach message templates, identify weaknesses, and suggest specific improvements to increase response rates and conversion.",
  },
  {
    id: "lead_gen_agent",
    label: "Lead Gen Agent",
    description: "Find businesses in any vertical, enrich with owner & social data, run email + Meta + LinkedIn outreach. Configure via Campaign Wizard.",
    icon: "Target",
    defaultProfile: "full",
    defaultTools: ["google_places_search", "enrich_business", "web_search", "read_webpage", "send_cold_email", "meta_friend_request", "linkedin_connect", "post_to_reddit", "post_to_meta_group", "find_social_groups"],
    promptSnippet:
      "You are a lead generation agent. Follow the campaign configuration to find, enrich, and contact businesses in the specified vertical. Use google_places_search to find businesses in the next pending city. Call enrich_business on each new business to find the owner name, Meta page, and LinkedIn profile. Then run outreach based on the configured channels. Always personalize messages using real review data.",
  },
];

export function getSpecialty(id: string): AgentSpecialty | undefined {
  return AGENT_SPECIALTIES.find((s) => s.id === id);
}

export function getSpecialtyLabel(id: string): string {
  return getSpecialty(id)?.label ?? id;
}
