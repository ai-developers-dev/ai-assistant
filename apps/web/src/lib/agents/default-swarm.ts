/**
 * Default swarm presets for quick team setup.
 */

export const DEFAULT_SWARM_CONFIG = {
  mainAgent: {
    name: "Nexus",
    description: "Your AI swarm leader",
    avatar: "Bot",
    modelId: "deepseek/deepseek-chat-v3-0324",
    personality:
      "Professional, efficient. Break complex requests into sub-tasks and delegate to the right specialist. Synthesize results into actionable responses.",
  },
  subAgents: [
    {
      name: "Scout",
      specialty: "prospecting",
      modelId: "deepseek/deepseek-chat-v3-0324",
      toolProfile: "research",
    },
    {
      name: "Scholar",
      specialty: "research",
      modelId: "deepseek/deepseek-chat-v3-0324",
      toolProfile: "research",
    },
    {
      name: "Coder",
      specialty: "coding",
      modelId: "anthropic/claude-haiku-4.5",
      toolProfile: "automation",
    },
    {
      name: "Pixel",
      specialty: "image_generation",
      modelId: "openai/gpt-4o-mini",
      toolProfile: "minimal",
    },
    {
      name: "Scribe",
      specialty: "writing",
      modelId: "anthropic/claude-haiku-4.5",
      toolProfile: "research",
    },
    {
      name: "WebDev",
      specialty: "web_development",
      modelId: "google/gemini-2.5-flash",
      toolProfile: "research",
    },
  ],
};

export interface SwarmPreset {
  label: string;
  description: string;
  agents: Array<{
    name: string;
    specialty: string;
  }>;
}

export const SWARM_PRESETS: Record<string, SwarmPreset> = {
  sales: {
    label: "Sales Swarm",
    description: "Prospecting, research, outreach, and marketing",
    agents: [
      { name: "Scout", specialty: "prospecting" },
      { name: "Scholar", specialty: "research" },
      { name: "Scribe", specialty: "writing" },
      { name: "Marketer", specialty: "marketing" },
    ],
  },
  developer: {
    label: "Developer Swarm",
    description: "Coding, web dev, testing, and research",
    agents: [
      { name: "Coder", specialty: "coding" },
      { name: "WebDev", specialty: "web_development" },
      { name: "Tester", specialty: "testing" },
      { name: "Scholar", specialty: "research" },
    ],
  },
  content: {
    label: "Content Swarm",
    description: "Writing, SEO, social media, and images",
    agents: [
      { name: "Scribe", specialty: "writing" },
      { name: "SEO Pro", specialty: "seo" },
      { name: "Social", specialty: "social_media" },
      { name: "Pixel", specialty: "image_generation" },
    ],
  },
  prospecting: {
    label: "Prospecting Swarm",
    description: "Google, Meta, LinkedIn prospecting with cold email outreach",
    agents: [
      { name: "Google Scout", specialty: "prospecting" },
      { name: "Meta Scout", specialty: "meta_prospecting" },
      { name: "LinkedIn Scout", specialty: "linkedin_prospecting" },
      { name: "Emailer", specialty: "cold_email" },
    ],
  },
};
