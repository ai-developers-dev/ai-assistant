"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useEffectiveOrg } from "@/hooks/use-effective-org";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AGENT_SPECIALTIES } from "@/lib/agents/specialties";
import {
  Clock,
  Plus,
  Pause,
  Play,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  X,
  Bot,
  Zap,
  AlertTriangle,
  ExternalLink,
  Key,
  Target,
  Settings2,
  DollarSign,
  Mail,
} from "lucide-react";
import Link from "next/link";

const CRON_OPTIONS = [
  // Simple intervals
  { value: "every_5m", label: "Every 5 minutes", group: "Intervals" },
  { value: "every_15m", label: "Every 15 minutes", group: "Intervals" },
  { value: "every_30m", label: "Every 30 minutes", group: "Intervals" },
  { value: "every_1h", label: "Every hour", group: "Intervals" },
  { value: "every_6h", label: "Every 6 hours", group: "Intervals" },
  { value: "every_12h", label: "Every 12 hours", group: "Intervals" },
  { value: "every_24h", label: "Every 24 hours", group: "Intervals" },
  // Daily (Central Time)
  { value: "daily_13pm", label: "Daily at 8 AM Central (CT)", group: "Central Time" },
  { value: "daily_14pm", label: "Daily at 9 AM Central (CT)", group: "Central Time" },
  { value: "daily_15pm", label: "Daily at 10 AM Central (CT)", group: "Central Time" },
  { value: "daily_17pm", label: "Daily at 12 PM Central (CT)", group: "Central Time" },
  { value: "daily_20pm", label: "Daily at 3 PM Central (CT)", group: "Central Time" },
  { value: "weekdays_14pm", label: "Weekdays at 9 AM Central (CT)", group: "Central Time" },
  // Daily (UTC)
  { value: "daily_6am", label: "Daily at 6 AM UTC", group: "Daily UTC" },
  { value: "daily_9am", label: "Daily at 9 AM UTC", group: "Daily UTC" },
  { value: "daily_12pm", label: "Daily at 12 PM UTC", group: "Daily UTC" },
  { value: "daily_21pm", label: "Daily at 9 PM UTC", group: "Daily UTC" },
  // Weekdays (UTC)
  { value: "weekdays_6am", label: "Weekdays at 6 AM UTC", group: "Weekdays UTC" },
  { value: "weekdays_9am", label: "Weekdays at 9 AM UTC", group: "Weekdays UTC" },
  { value: "weekdays_17pm", label: "Weekdays at 5 PM UTC", group: "Weekdays UTC" },
  // Specific days
  { value: "monday_9am", label: "Monday at 9 AM UTC", group: "Weekly" },
  { value: "tuesday_9am", label: "Tuesday at 9 AM UTC", group: "Weekly" },
  { value: "wednesday_9am", label: "Wednesday at 9 AM UTC", group: "Weekly" },
  { value: "thursday_9am", label: "Thursday at 9 AM UTC", group: "Weekly" },
  { value: "friday_9am", label: "Friday at 9 AM UTC", group: "Weekly" },
  { value: "friday_17pm", label: "Friday at 5 PM UTC", group: "Weekly" },
  { value: "saturday_10am", label: "Saturday at 10 AM UTC", group: "Weekly" },
  { value: "sunday_10am", label: "Sunday at 10 AM UTC", group: "Weekly" },
];

// Required APIs per agent specialty — shown as a reminder on the task card
const AGENT_REQUIRED_APIS: Record<string, Array<{ name: string; key: string; required: boolean; websiteUrl: string }>> = {
  lead_gen_agent: [
    { name: "Outscraper (Google Maps)", key: "outscraper", required: true,  websiteUrl: "https://outscraper.com" },
    { name: "Firecrawl (Enrichment)",   key: "firecrawl",  required: true,  websiteUrl: "https://www.firecrawl.dev" },
    { name: "Warmed Email (Gmail SMTP)", key: "warmed_email", required: false, websiteUrl: "https://myaccount.google.com/apppasswords" },
    { name: "Meta Login (Messages + Groups)", key: "meta", required: false, websiteUrl: "https://facebook.com" },
    { name: "LinkedIn Login (Connections)", key: "linkedin", required: false, websiteUrl: "https://linkedin.com" },
  ],
};

function isProviderConnected(providerKeys: Record<string, any> | undefined, key: string): boolean {
  if (!providerKeys) return false;
  const single = providerKeys[key];
  if (single && typeof single === "object" && (single.encryptedApiKey || single.encryptedAccessToken || single.type)) {
    return true;
  }
  const arr = providerKeys[`${key}_accounts`];
  if (Array.isArray(arr) && arr.length > 0) return true;
  return false;
}

// ── Daily cost estimator for lead gen tasks ──────────────────────────

interface CostLine {
  service: string;
  detail: string;
  dailyCost: number;
  isFree?: boolean;
  isFlat?: boolean;
}

const LLM_MODELS = [
  // Anthropic
  { id: "anthropic/claude-haiku-4.5",        label: "Claude Haiku 4.5",   inputPer1M: 0.80,  outputPer1M: 4,     tag: "fastest · Anthropic",      supportsOAuth: false },
  { id: "anthropic/claude-sonnet-4",         label: "Claude Sonnet 4",    inputPer1M: 3,     outputPer1M: 15,    tag: "balanced · Anthropic",     supportsOAuth: false },
  { id: "anthropic/claude-opus-4",           label: "Claude Opus 4",      inputPer1M: 15,    outputPer1M: 75,    tag: "most capable · Anthropic", supportsOAuth: false },
  // OpenAI
  { id: "openai/gpt-4o",                     label: "GPT-4o",             inputPer1M: 2.50,  outputPer1M: 10,    tag: "balanced · OpenAI",        supportsOAuth: false },
  { id: "openai/gpt-4o-mini",                label: "GPT-4o Mini",        inputPer1M: 0.15,  outputPer1M: 0.60,  tag: "fast · OpenAI",            supportsOAuth: false },
  { id: "openai/gpt-4.1",                    label: "GPT-4.1",            inputPer1M: 2,     outputPer1M: 8,     tag: "smart · OpenAI",           supportsOAuth: false },
  // Google
  { id: "google/gemini-2.5-flash",           label: "Gemini 2.5 Flash",   inputPer1M: 0.15,  outputPer1M: 0.60,  tag: "fast · Google",            supportsOAuth: false },
  { id: "google/gemini-2.5-flash-lite",      label: "Gemini Flash Lite",  inputPer1M: 0.02,  outputPer1M: 0.10,  tag: "cheapest · Google",        supportsOAuth: false },
  // OpenRouter (DeepSeek, Meta, Mistral)
  { id: "deepseek/deepseek-chat-v3-0324",    label: "DeepSeek V3",        inputPer1M: 0.27,  outputPer1M: 1.10,  tag: "budget · OpenRouter",      supportsOAuth: false },
  { id: "deepseek/deepseek-r1",              label: "DeepSeek R1",        inputPer1M: 0.55,  outputPer1M: 2.19,  tag: "reasoning · OpenRouter",   supportsOAuth: false },
  { id: "mistralai/mistral-medium-3",        label: "Mistral Medium 3",   inputPer1M: 0.40,  outputPer1M: 2,     tag: "balanced · OpenRouter",    supportsOAuth: false },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B",     inputPer1M: 0.12,  outputPer1M: 0.30,  tag: "budget · OpenRouter",      supportsOAuth: false },
];

const AGENT_ROLES = [
  {
    key: "nexus",
    name: "Nexus",
    role: "Orchestrator",
    description: "Routes and coordinates all agents. No creative output.",
    inputTokens: 2500,
    outputTokens: 400,
    recommendedModel: "openai/gpt-4o-mini",
    recommendReason: "Reliable tool-calling and delegation",
  },
  {
    key: "marketingManager",
    name: "Marketing Manager",
    role: "Planner & Reporter",
    description: "Writes campaign plans, message templates, and KPI reports.",
    inputTokens: 5000,
    outputTokens: 2000,
    recommendedModel: "openai/gpt-4o-mini",
    recommendReason: "Strong writing + analysis for plans and reports",
  },
  {
    key: "scrapingAgent",
    name: "Scraping Agent",
    role: "Data Collection",
    description: "Calls Google Maps + enrichment tools in sequence.",
    inputTokens: 4000,
    outputTokens: 800,
    recommendedModel: "openai/gpt-4o-mini",
    recommendReason: "Reliable tool-calling for scraping pipeline",
  },
  {
    key: "researchAgent",
    name: "Research Agent",
    role: "Data Enrichment",
    description: "Enriches businesses with owner name, email, Facebook, LinkedIn profiles.",
    inputTokens: 3000,
    outputTokens: 600,
    recommendedModel: "openai/gpt-4o-mini",
    recommendReason: "Reliable tool-calling for enrichment pipeline",
  },
  {
    key: "metaOutreach",
    name: "Meta Outreach Agent",
    role: "Facebook Messaging",
    description: "Writes personalized Facebook DMs with real review hooks.",
    inputTokens: 2000,
    outputTokens: 1200,
    recommendedModel: "openai/gpt-4o-mini",
    recommendReason: "Persuasive, personalized writing gets replies",
  },
  {
    key: "linkedinOutreach",
    name: "LinkedIn Outreach Agent",
    role: "LinkedIn Connections",
    description: "Writes concise personalized connection notes (under 300 chars).",
    inputTokens: 2000,
    outputTokens: 800,
    recommendedModel: "openai/gpt-4o-mini",
    recommendReason: "Concise persuasive writing under strict char limit",
  },
  {
    key: "coldEmail",
    name: "Cold Email Agent",
    role: "Email Sending",
    description: "Writes personalized plain-text emails per business via warmed Gmail SMTP.",
    inputTokens: 2000,
    outputTokens: 1500,
    recommendedModel: "openai/gpt-4o-mini",
    recommendReason: "Writing quality matters — GPT-4o produces more natural, human-sounding emails",
  },
  {
    key: "socialPresence",
    name: "Social Presence Agent",
    role: "Community Posting",
    description: "Posts to Reddit, Facebook Groups, LinkedIn Groups, YouTube, and other platforms.",
    inputTokens: 3000,
    outputTokens: 1500,
    recommendedModel: "openai/gpt-4o-mini",
    recommendReason: "Creative, platform-aware content for community engagement",
  },
  {
    key: "promptEngineer",
    name: "Prompt Engineer",
    role: "Template Optimizer",
    description: "Analyzes response rates and rewrites outreach templates.",
    inputTokens: 3500,
    outputTokens: 2000,
    recommendedModel: "openai/gpt-4.1",
    recommendReason: "Deep analysis + creative improvement needs smart model",
  },
];

function estimateLeadGenDailyCost(campaignConfig: {
  dailyResults: number;
  outreachChannels: string[];
  agentModels?: Record<string, string>;
}): {
  lines: CostLine[];
  total: number;
  monthlyTotal: number;
  agentCosts: Array<{ key: string; name: string; role: string; modelId: string; modelLabel: string; dailyCost: number }>;
  totalAgentCost: number;
} {
  const n = campaignConfig.dailyResults || 50;
  const channels = campaignConfig.outreachChannels || [];

  const lines: CostLine[] = [
    {
      service: "Outscraper",
      detail: `${n} businesses × $0.003`,
      dailyCost: n * 0.003,
    },
    {
      service: "Firecrawl",
      detail: `~${n} enrichment scrapes × $0.001`,
      dailyCost: n * 0.001,
    },
  ];

  if (channels.includes("email")) {
    lines.push({ service: "Direct Email (SMTP)", detail: "Gmail app password — free", dailyCost: 0, isFree: true });
  }

  if (channels.includes("meta")) {
    lines.push({ service: "Meta Outreach", detail: "Browser automation", dailyCost: 0, isFree: true });
  }

  if (channels.includes("linkedin")) {
    lines.push({ service: "LinkedIn Outreach", detail: "Browser automation", dailyCost: 0, isFree: true });
  }

  // Per-agent LLM costs
  const agentCosts = AGENT_ROLES.map((role) => {
    const modelId = campaignConfig.agentModels?.[role.key] ?? role.recommendedModel;
    const model = LLM_MODELS.find((m) => m.id === modelId) ?? LLM_MODELS[0];
    // Scale scraping agent token usage by dailyResults
    const inputScale = role.key === "scrapingAgent" ? 1 + (n / 50) * 0.5 : 1;
    const dailyCost =
      ((role.inputTokens * inputScale) / 1_000_000) * model.inputPer1M +
      (role.outputTokens / 1_000_000) * model.outputPer1M;
    return { key: role.key, name: role.name, role: role.role, modelId, modelLabel: model.label, dailyCost };
  });

  const totalAgentCost = agentCosts.reduce((sum, a) => sum + a.dailyCost, 0);
  const total = lines.reduce((sum, l) => sum + l.dailyCost, 0);
  return { lines, total, monthlyTotal: (total + totalAgentCost) * 30, agentCosts, totalAgentCost };
}

// ── Campaign config type ──────────────────────────────────────────────

type PostFrequency = "daily" | "weekly" | "monthly";

interface SocialChannel {
  find: boolean;
  join: boolean;
  post: boolean;
  postCount: number;
  postFrequency: PostFrequency;
}

interface ConsumerSocialPresence {
  reddit: SocialChannel;
  facebook: SocialChannel;
  linkedin: SocialChannel;
  nextdoor: SocialChannel;
  quora: SocialChannel;
  twitter: SocialChannel;
  discord: SocialChannel;
  youtube: SocialChannel;
}

interface ConsumerConfig {
  campaignMode: "consumer";
  promotions: string[];
  states: string[];
  socialPresence: ConsumerSocialPresence;
}

interface OutreachChannelConfig {
  enabled: boolean;
  dailyLimit: number;
  selectedAccounts: string[]; // email addresses of accounts to use
}

interface CampaignConfig {
  campaignMode?: "b2b";
  serviceOffering?: string;       // preset id OR "other"
  serviceOfferingDetails?: string; // free-form: custom name (when "other") OR extra details (when preset)
  verticals: string[];
  states: string[];
  cityCount: number;
  dailyResults: number;
  dataFields: string[];
  outreachChannels: string[];
  /** Per-channel config (accounts + daily limit) */
  channelConfig?: {
    email?: OutreachChannelConfig;
    meta?: OutreachChannelConfig;
    linkedin?: OutreachChannelConfig;
  };
  emailTemplate?: string;
  agentModels?: Record<string, string>; // agentKey → modelId
  socialPresence: {
    // Reddit
    findRedditGroups: boolean;
    joinRedditGroups: boolean;
    postToReddit: boolean;
    redditPostCount: number;
    redditPostFrequency: "daily" | "weekly" | "monthly";
    // Facebook Groups
    findMetaGroups: boolean;
    joinMetaGroups: boolean;
    postToMetaGroups: boolean;
    metaPostCount: number;
    metaPostFrequency: "daily" | "weekly" | "monthly";
    // LinkedIn Groups
    findLinkedinGroups: boolean;
    joinLinkedinGroups: boolean;
    postToLinkedinGroups: boolean;
    linkedinPostCount: number;
    linkedinPostFrequency: "daily" | "weekly" | "monthly";
    // Nextdoor
    findNextdoor: boolean;
    joinNextdoor: boolean;
    postToNextdoor: boolean;
    nextdoorPostCount: number;
    nextdoorPostFrequency: "daily" | "weekly" | "monthly";
    // Quora
    findQuora: boolean;
    followQuora: boolean;
    postToQuora: boolean;
    quoraPostCount: number;
    quoraPostFrequency: "daily" | "weekly" | "monthly";
    // X / Twitter
    findTwitter: boolean;
    followTwitter: boolean;
    postToTwitter: boolean;
    twitterPostCount: number;
    twitterPostFrequency: "daily" | "weekly" | "monthly";
    // Discord
    findDiscord: boolean;
    joinDiscord: boolean;
    postToDiscord: boolean;
    discordPostCount: number;
    discordPostFrequency: "daily" | "weekly" | "monthly";
    // YouTube
    findYoutube: boolean;
    subscribeYoutube: boolean;
    postToYoutube: boolean;
    youtubePostCount: number;
    youtubePostFrequency: "daily" | "weekly" | "monthly";
  };
}

const SERVICE_OFFERINGS = [
  // Web & Digital
  { group: "Web & Digital", id: "website_design", label: "Website Design & Development", pitch: "professional website design and development services" },
  { group: "Web & Digital", id: "seo", label: "SEO / Search Engine Optimization", pitch: "SEO services to help them rank higher on Google and get more organic traffic" },
  { group: "Web & Digital", id: "website_lead_gen", label: "Website + Lead Generation", pitch: "a done-for-you website and lead generation system to bring in more customers" },
  { group: "Web & Digital", id: "ppc_google_ads", label: "PPC / Google Ads Management", pitch: "Google Ads management to drive targeted traffic and leads to their business" },
  { group: "Web & Digital", id: "social_media_mgmt", label: "Social Media Management", pitch: "social media management to grow their online presence and engage customers" },
  { group: "Web & Digital", id: "reputation_mgmt", label: "Reputation Management", pitch: "online reputation management to get more 5-star reviews and protect their brand" },
  { group: "Web & Digital", id: "email_marketing", label: "Email Marketing", pitch: "email marketing campaigns to stay top-of-mind with customers and drive repeat business" },
  // Financial
  { group: "Financial", id: "business_loans", label: "Business Loans & Financing", pitch: "fast business funding and loans to help them grow, hire, or cover cash flow gaps" },
  { group: "Financial", id: "merchant_services", label: "Merchant Services / Payment Processing", pitch: "lower-cost payment processing to save them money on every transaction" },
  { group: "Financial", id: "accounting", label: "Accounting & Bookkeeping", pitch: "professional bookkeeping and accounting services to keep their finances clean and tax-ready" },
  { group: "Financial", id: "payroll", label: "Payroll & HR Services", pitch: "payroll and HR services to save them time and ensure they stay compliant" },
  { group: "Financial", id: "tax_prep", label: "Tax Preparation & Planning", pitch: "business tax preparation and planning to minimize what they owe and avoid surprises" },
  // Technology
  { group: "Technology", id: "it_managed", label: "IT Services / Managed IT", pitch: "managed IT services to keep their systems running, secure, and supported" },
  { group: "Technology", id: "crm_software", label: "CRM / Business Software", pitch: "CRM and business automation software to help them manage leads, customers, and follow-ups" },
  { group: "Technology", id: "voip_phone", label: "VoIP / Business Phone Systems", pitch: "modern VoIP phone systems to cut their phone bill and add powerful calling features" },
  { group: "Technology", id: "cybersecurity", label: "Cybersecurity Services", pitch: "cybersecurity services to protect their business data and customer information" },
  // Other B2B Services
  { group: "B2B Services", id: "commercial_cleaning", label: "Commercial Cleaning / Janitorial", pitch: "reliable commercial cleaning services to keep their workspace spotless and professional" },
  { group: "B2B Services", id: "staffing", label: "Staffing & Recruiting", pitch: "staffing and recruiting services to help them find and hire qualified employees fast" },
  { group: "B2B Services", id: "commercial_real_estate", label: "Commercial Real Estate", pitch: "commercial real estate services to help them find the right space for their business" },
  { group: "B2B Services", id: "solar_commercial", label: "Commercial Solar", pitch: "commercial solar installations to reduce their electricity costs and go green" },
  { group: "B2B Services", id: "signage", label: "Business Signage", pitch: "custom business signage to increase visibility and attract more walk-in customers" },
];

const DAILY_RESULTS_TARGET_OPTIONS = [25, 50, 100, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000];

const DEFAULT_EMAIL_TEMPLATE = `Hi {{ownerName}},

I came across {{businessName}} and was impressed by your {{rating}}-star rating. One of your customers said: "{{bestReview}}"

I help {{vertical}} businesses in {{city}} get more customers through modern websites and local SEO.

Would you be open to a quick chat this week?

Best,
[Your Name]`;

const DEFAULT_CAMPAIGN_CONFIG: CampaignConfig = {
  serviceOffering: "",
  serviceOfferingDetails: "",
  verticals: [],
  states: [],
  cityCount: 100,
  dailyResults: 250,
  dataFields: ["name", "phone", "reviews", "ownerName"],
  outreachChannels: [],
  emailTemplate: DEFAULT_EMAIL_TEMPLATE,
  agentModels: Object.fromEntries(AGENT_ROLES.map((r) => [r.key, r.recommendedModel])),
  socialPresence: {
    findRedditGroups: false,
    joinRedditGroups: false,
    postToReddit: false,
    redditPostCount: 5,
    redditPostFrequency: "daily",
    findMetaGroups: false,
    joinMetaGroups: false,
    postToMetaGroups: false,
    metaPostCount: 5,
    metaPostFrequency: "daily",
    findLinkedinGroups: false,
    joinLinkedinGroups: false,
    postToLinkedinGroups: false,
    linkedinPostCount: 3,
    linkedinPostFrequency: "weekly",
    findNextdoor: false,
    joinNextdoor: false,
    postToNextdoor: false,
    nextdoorPostCount: 3,
    nextdoorPostFrequency: "weekly",
    findQuora: false,
    followQuora: false,
    postToQuora: false,
    quoraPostCount: 3,
    quoraPostFrequency: "weekly",
    findTwitter: false,
    followTwitter: false,
    postToTwitter: false,
    twitterPostCount: 5,
    twitterPostFrequency: "daily",
    findDiscord: false,
    joinDiscord: false,
    postToDiscord: false,
    discordPostCount: 3,
    discordPostFrequency: "weekly",
    findYoutube: false,
    subscribeYoutube: false,
    postToYoutube: false,
    youtubePostCount: 3,
    youtubePostFrequency: "weekly",
  },
};

const DEFAULT_SOCIAL_CHANNEL: SocialChannel = { find: false, join: false, post: false, postCount: 5, postFrequency: "weekly" };

const DEFAULT_CONSUMER_CONFIG: ConsumerConfig = {
  campaignMode: "consumer",
  promotions: [],
  states: [],
  socialPresence: {
    reddit:   { ...DEFAULT_SOCIAL_CHANNEL, postCount: 5, postFrequency: "daily" },
    facebook: { ...DEFAULT_SOCIAL_CHANNEL, postCount: 5, postFrequency: "daily" },
    linkedin: { ...DEFAULT_SOCIAL_CHANNEL, postCount: 3, postFrequency: "weekly" },
    nextdoor: { ...DEFAULT_SOCIAL_CHANNEL, postCount: 3, postFrequency: "weekly" },
    quora:    { ...DEFAULT_SOCIAL_CHANNEL, postCount: 3, postFrequency: "weekly" },
    twitter:  { ...DEFAULT_SOCIAL_CHANNEL, postCount: 5, postFrequency: "daily" },
    discord:  { ...DEFAULT_SOCIAL_CHANNEL, postCount: 3, postFrequency: "weekly" },
    youtube:  { ...DEFAULT_SOCIAL_CHANNEL, postCount: 3, postFrequency: "weekly" },
  },
};

const PROMOTION_CATEGORIES = [
  {
    label: "Insurance",
    items: [
      "Auto Insurance",
      "Home Insurance",
      "Life Insurance",
      "Health Insurance",
      "Renters Insurance",
      "Business Insurance",
      "Medicare / Supplemental Insurance",
      "Travel Insurance",
      "Pet Insurance",
    ],
  },
  {
    label: "Financial Services",
    items: [
      "Investment Services",
      "Retirement Planning",
      "401(k) / IRA Rollover",
      "Wealth Management",
      "Tax Planning",
      "Credit Repair",
      "Debt Consolidation",
      "Personal Loans",
      "Mortgage / Refinancing",
      "Annuities",
    ],
  },
  {
    label: "Real Estate",
    items: [
      "Home Buying",
      "Home Selling",
      "Real Estate Investment",
      "Property Management",
      "Vacation Rentals",
    ],
  },
  {
    label: "Health & Wellness",
    items: [
      "Weight Loss Programs",
      "Supplements / Vitamins",
      "Mental Health Services",
      "Telehealth / Online Doctors",
      "Senior Care / Assisted Living",
      "Addiction Recovery",
      "Fitness Programs",
      "Dental Plans",
      "Vision Plans",
    ],
  },
  {
    label: "Home & Auto",
    items: [
      "Home Security Systems",
      "Solar Energy",
      "Home Warranty",
      "Extended Auto Warranty",
      "Internet / Cable Bundles",
      "Energy Savings Programs",
      "Roofing & Siding Leads",
    ],
  },
  {
    label: "Education & Career",
    items: [
      "Online Degree Programs",
      "Trade School / Vocational",
      "Professional Certifications",
      "Student Loan Refinancing",
      "Career Coaching",
      "Work From Home Opportunities",
    ],
  },
  {
    label: "Legal & Government",
    items: [
      "Personal Injury Claims",
      "Mass Tort / Class Action",
      "Social Security Disability",
      "Workers Compensation",
      "VA Benefits",
      "Estate Planning / Wills",
    ],
  },
  {
    label: "Other Consumer",
    items: [
      "Prepaid / MVNO Phone Plans",
      "Identity Theft Protection",
      "Subscription Boxes",
      "E-Commerce / Products",
      "Sweepstakes / Giveaways",
      "Franchise Opportunities",
      "Network Marketing / MLM",
    ],
  },
];

const CONSUMER_PLATFORMS: Array<{
  key: keyof ConsumerSocialPresence;
  label: string;
  searchTips: (promos: string, states: string) => string;
  postTips: (promoList: string[], states: string) => string;
}> = [
  {
    key: "reddit",
    label: "Reddit",
    searchTips: (promos, states) =>
      `  • Search subreddits about: ${promos}, personal finance, consumer advice, state/city subs for ${states}
  • Cast WIDE net — r/personalfinance, r/Insurance, r/FirstTimeHomeBuyer, r/povertyfinance, r/Frugal, r/legaladvice, lifestyle subs (parenting, veterans, seniors, young professionals), state subs (r/texas, r/florida, etc.)`,
    postTips: (promoList) =>
      `  • Post style: helpful, conversational, question-based or experience-sharing — NOT promotional
  • Examples: "What should I look for when shopping for ${promoList[0]}?", "I saved $X by doing Y — here's how", "Questions to ask before signing up for [topic]"
  • NEVER: affiliate links, company names, direct CTAs, anything that reads like an ad`,
  },
  {
    key: "facebook",
    label: "Facebook Groups",
    searchTips: (promos, states) =>
      `  • Search Facebook for groups about: ${promos}, personal finance, local community groups in ${states}
  • Be BROAD — neighborhood groups, buy/sell groups, parent groups, veterans groups, senior groups, coupon/deals groups all reach the right audience
  • Prioritize geographic groups matching: ${states}`,
    postTips: (promoList) =>
      `  • Post style: friendly community-member tone — NOT a sales rep
  • Examples: "Anyone in [State] have experience with ${promoList[0]}?", "Quick tip for anyone shopping for [topic]...", "Happy to answer questions — just went through this process"
  • Reference state/city to feel local. NEVER post prices, company names, or hard CTAs`,
  },
  {
    key: "linkedin",
    label: "LinkedIn Groups",
    searchTips: (promos, _states) =>
      `  • Search LinkedIn groups about: ${promos}, personal finance, professional development, employee benefits
  • BROAD targets: HR professional groups (discuss benefits), entrepreneur groups (insurance), young professional groups (investing), alumni groups`,
    postTips: (promoList) =>
      `  • Post style: professional, insight-driven, educational — not casual or promotional
  • Examples: "3 things people overlook when choosing ${promoList[0]}", "Industry insight: why [misconception] costs consumers more", "Questions to ask before committing to [product]"`,
  },
  {
    key: "nextdoor",
    label: "Nextdoor",
    searchTips: (promos, states) =>
      `  • Nextdoor is hyper-local — focus on neighborhoods in your target states: ${states}
  • Perfect for: home insurance, auto insurance, solar, home warranty, senior care, home services
  • Search for active neighborhood groups in cities within: ${states}`,
    postTips: (promoList) =>
      `  • Post style: neighbor-to-neighbor — personal, local, helpful
  • Examples: "Neighbors — has anyone compared ${promoList[0]} recently? Sharing what I found...", "Quick tip for [City] residents about [topic]"
  • Always mention the specific city/neighborhood. NEVER post like a business`,
  },
  {
    key: "quora",
    label: "Quora",
    searchTips: (promos, _states) =>
      `  • Search Quora for existing questions about: ${promos}, consumer advice, how-to guides
  • Find high-traffic questions (1,000+ views) that have weak or outdated answers
  • These answers get indexed by Google and drive long-term organic traffic`,
    postTips: (promoList) =>
      `  • Answer style: thorough, helpful, expert-sounding — cite real data or stats where possible
  • Target questions like: "What is the best ${promoList[0]} for X?", "How do I compare [topic]?", "What should I know before buying [product]?"
  • Add genuine value — Quora readers can spot shallow answers immediately
  • ⚠️ Quora answers are indexed by Google — quality matters here more than volume`,
  },
  {
    key: "twitter",
    label: "X / Twitter",
    searchTips: (promos, states) =>
      `  • Search X/Twitter for conversations about: ${promos}, consumer questions, people asking for recommendations
  • Use search: "[topic] recommendations", "[topic] help", "[topic] in [State]", "looking for [product]"
  • Find recent tweets (last 48 hours) where people are actively asking questions`,
    postTips: (promoList) =>
      `  • Engagement style: reply helpfully to people asking questions about ${promoList.join(", ")}
  • Also post original educational threads: "5 things to know before buying ${promoList[0]} 🧵"
  • Use relevant hashtags but don't overdo it (2-3 max)
  • NEVER reply with promotional content — only genuine, helpful answers`,
  },
  {
    key: "discord",
    label: "Discord",
    searchTips: (promos, _states) =>
      `  • Search for Discord servers related to: ${promos}, personal finance, real estate, veterans, young professionals
  • Use disboard.org and discord.com/discovery to find relevant public servers
  • Target servers with active #advice, #questions, or #general channels`,
    postTips: (promoList) =>
      `  • Engage in relevant channels — answer questions about ${promoList.join(", ")} when they come up naturally
  • Post helpful content in appropriate channels (tips, guides, resources)
  • Build community presence over time — Discord is relationship-driven
  • NEVER spam or post in off-topic channels`,
  },
  {
    key: "youtube",
    label: "YouTube",
    searchTips: (promos, _states) =>
      `  • Search YouTube for videos about: ${promos}, how-to guides, comparison videos, explainers
  • Target videos with 10,000+ views where consumers are asking questions in comments
  • Look for videos titled: "Best ${promos}", "How to choose [topic]", "[topic] explained", "Is [product] worth it?"`,
    postTips: (promoList) =>
      `  • Comment style: add genuine value to the conversation — answer questions other viewers asked
  • Examples: "Great video! One thing I'd add about ${promoList[0]} is...", replying to "anyone know if X is better than Y?" with a thorough answer
  • Build credibility with helpful comments — YouTube comment sections on finance/insurance videos get thousands of eyes
  • NEVER post links or promotional content in comments`,
  },
];

function generateConsumerPrompt(config: ConsumerConfig): string {
  const { promotions, states, socialPresence } = config;
  const promoList = (promotions ?? []).length > 0 ? promotions : ["general consumer services"];
  const stateScope = (states ?? []).length > 0 ? (states ?? []).join(", ") : "all 50 US states";
  const promoNames = promoList.join(", ");

  const activePlatforms = CONSUMER_PLATFORMS.filter(
    (p) => socialPresence[p.key]?.find || socialPresence[p.key]?.join || socialPresence[p.key]?.post
  );

  let stepNum = 1;
  const steps: string[] = [];

  if (activePlatforms.length > 0) {
    steps.push(`═══════════════════════════════════════
STEP ${stepNum++} — COMMUNITY DISCOVERY
═══════════════════════════════════════
Target promotions: ${promoNames}
Geography focus: ${stateScope}
Active platforms: ${activePlatforms.map((p) => p.label).join(", ")}

Your goal: find active online communities across ALL platforms above where consumers discuss, ask about, or seek advice on: ${promoNames}.

Community selection philosophy — BE BROAD:
  • Don't limit to communities explicitly about the product
  • Find communities where the TARGET AUDIENCE naturally gathers
  • Example: a first-time homebuyers Facebook group → needs home insurance + mortgage
  • Example: a military veterans Discord → needs VA benefits + life insurance + financial planning
  • Example: a parenting subreddit → needs life insurance + health insurance + college savings

Record each community found (platform, name, URL, member count) in your working notes for use in the posting steps below.`);
  }

  for (const platform of activePlatforms) {
    const ch = socialPresence[platform.key];
    if (!ch) continue;
    const lines: string[] = [];

    if (ch.find || ch.join) {
      lines.push(`DISCOVER & ${ch.join ? "JOIN" : "TRACK"} COMMUNITIES:
${platform.searchTips(promoNames, stateScope)}
${ch.join ? `  • Join/subscribe to each relevant community found` : "  • Note found communities for use in posting steps"}`);
    }

    if (ch.post) {
      lines.push(`POST CONTENT (${ch.postCount} posts/${ch.postFrequency}):
  • Check how many posts have been made this ${ch.postFrequency} — only post if quota has NOT been met yet
${platform.postTips(promoList, stateScope)}`);
    }

    steps.push(`═══════════════════════════════════════
STEP ${stepNum++} — ${platform.label.toUpperCase()} PRESENCE
═══════════════════════════════════════
${lines.join("\n\n")}`);
  }

  const postingPlatforms = activePlatforms.filter((p) => socialPresence[p.key]?.post);
  steps.push(`═══════════════════════════════════════
STEP ${stepNum} — FINAL REPORT
═══════════════════════════════════════
📢 COMMUNITY PRESENCE
  • New communities discovered this run: [N breakdown by platform]
  • Total communities joined (all-time): [N breakdown by platform]
  • Posts made this run:
${postingPlatforms.map((p) => {
    const ch = socialPresence[p.key]!;
    return `    - ${p.label}: [N] / ${ch.postCount} ${ch.postFrequency} quota`;
  }).join("\n") || "    - No posting platforms configured"}

⚠️ ERRORS / SKIPPED
  • Communities skipped (low relevance or already tracked): [N]
  • Post failures: [N] — [brief reason if known]`);

  return `You are the Consumer Lead Generation Agent running the social community presence campaign.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMPAIGN PARAMETERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode:       Consumer Leads
Promotions: ${promoList.map((p, i) => `${i + 1}. ${p}`).join(" | ")}
Geography:  ${stateScope}
Platforms:  ${activePlatforms.length > 0 ? activePlatforms.map((p) => p.label).join(", ") : "None configured"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MISSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Build authentic presence across online communities where consumers seek advice on: ${promoNames}. Contribute genuinely helpful, non-promotional content. Goal: awareness and trust — not direct selling. Every platform has different norms — adapt tone accordingly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION NOTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• post_to_reddit and post_to_meta_group save post records automatically — no separate save needed
• Keep track of how many posts you've made on each platform this run to enforce the quota limits
• Community discovery results (group names/URLs) should be noted in your working context for use in posting steps

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION STEPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${steps.join("\n\n")}`;
}

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

const VERTICAL_CATEGORIES = [
  {
    label: "Automotive",
    items: [
      "Auto Body Shop",
      "Auto Repair Shop",
      "Car Dealership",
      "Car Detailing Service",
      "Car Rental Agency",
      "Car Wash",
      "Motorcycle Dealership",
      "RV Dealership",
      "Tire Shop",
      "Towing Company",
      "Truck Dealership",
      "Used Car Dealership",
    ],
  },
  {
    label: "Food & Hospitality",
    items: [
      "Bakery",
      "Bar / Nightclub",
      "Brewery / Taproom",
      "Buffet Restaurant",
      "Catering Company",
      "Coffee Shop",
      "Fast Food Restaurant",
      "Fine Dining Restaurant",
      "Food Truck",
      "Hotel",
      "Ice Cream Shop",
      "Pizza Restaurant",
      "Restaurant",
      "Seafood Restaurant",
      "Sports Bar",
      "Steakhouse",
      "Sushi Restaurant",
      "Winery / Vineyard",
    ],
  },
  {
    label: "Health & Wellness",
    items: [
      "Chiropractor",
      "Dentist",
      "Dermatologist",
      "Gym / Fitness Studio",
      "Med Spa",
      "Mental Health Therapist",
      "Optometrist",
      "Personal Trainer",
      "Physical Therapist",
      "Plastic Surgeon",
      "Urgent Care Clinic",
      "Veterinarian",
      "Weight Loss Clinic",
    ],
  },
  {
    label: "Home Services",
    items: [
      "Chimney Sweep",
      "Cleaning Service",
      "Electrician",
      "Flooring Company",
      "Foundation Repair",
      "Garage Door Company",
      "General Contractor",
      "Gutter Company",
      "Home Inspector",
      "HVAC Contractor",
      "Landscaping Company",
      "Lawn Care Service",
      "Painting Contractor",
      "Pest Control",
      "Plumber",
      "Pool & Spa Service",
      "Pressure Washing Service",
      "Roofing Contractor",
      "Solar Panel Installer",
      "Tree Service",
      "Window & Door Company",
    ],
  },
  {
    label: "Professional Services",
    items: [
      "Accounting Firm",
      "Business Consultant",
      "Commercial Real Estate",
      "Financial Advisor",
      "Insurance Agent",
      "IT Support Company",
      "Law Firm",
      "Marketing Agency",
      "Mortgage Broker",
      "Real Estate Agent",
      "Staffing Agency",
      "Tax Preparation Service",
      "Web Design Agency",
    ],
  },
  {
    label: "Retail & Other",
    items: [
      "Bridal Shop",
      "Childcare / Daycare",
      "Event Venue",
      "Florist",
      "Furniture Store",
      "Gun Shop",
      "Jewelry Store",
      "Moving Company",
      "Music School",
      "Photography Studio",
      "Print Shop",
      "Salon / Barbershop",
      "Security Company",
      "Storage Facility",
      "Tattoo Shop",
      "Trucking Company",
      "Tutoring Center",
    ],
  },
];

function generateLeadGenPrompt(config: CampaignConfig): string {
  const { verticals, states, cityCount, dailyResults, dataFields, outreachChannels, socialPresence, serviceOffering, serviceOfferingDetails } = config;
  const vList = (verticals ?? []).length > 0 ? verticals : ["business"];
  const vName = vList.join(", ");
  const vNameShort = vList.length === 1 ? vList[0] : `${vList[0]} (and other verticals)`;
  const stateScope = (states ?? []).length > 0 ? (states ?? []).join(", ") : "all 50 US states";
  const hasEnrich = dataFields.includes("ownerName") || dataFields.includes("metaPage") || dataFields.includes("linkedin") || dataFields.includes("email");

  const enrichFields = [
    dataFields.includes("ownerName") && "owner full name and title",
    dataFields.includes("email") && "business email address",
    dataFields.includes("metaPage") && "Facebook/Meta business page URL",
    dataFields.includes("linkedin") && "LinkedIn owner profile URL",
  ].filter(Boolean).join(", ");

  const dataCollected = [
    dataFields.includes("name") && "business name + full address",
    dataFields.includes("phone") && "phone number",
    dataFields.includes("email") && "email address",
    dataFields.includes("website") && "website URL",
    dataFields.includes("reviews") && "Google review count + average rating",
    dataFields.includes("ownerName") && "owner name",
    dataFields.includes("metaPage") && "Facebook page URL",
    dataFields.includes("linkedin") && "LinkedIn profile URL",
  ].filter(Boolean).join(", ");

  // Resolve service offering pitch for use in outreach steps
  const servicePreset = SERVICE_OFFERINGS.find((s) => s.id === serviceOffering);
  const isOther = serviceOffering === "other";
  const serviceLabel = isOther
    ? (serviceOfferingDetails?.trim() || "our services")
    : (servicePreset?.label || null);
  const servicePitch = isOther
    ? (serviceOfferingDetails?.trim() || null)
    : servicePreset
      ? servicePreset.pitch + (serviceOfferingDetails?.trim() ? `. Specifically: ${serviceOfferingDetails.trim()}` : "")
      : null;

  let stepNum = 1;
  const steps: string[] = [];

  // ── STEP 1: City Selection ─────────────────────────────────────────────
  steps.push(`═══════════════════════════════════════
STEP ${stepNum++} — CITY SELECTION (run ONCE per session)
═══════════════════════════════════════
Target geography: ${stateScope}
City count goal: Top ${cityCount} largest cities by population

ACTION: Call get_city_campaign_progress() — returns:
  • nextCity: the next pending city ({ _id, cityName, stateCode }) — null if all cities are done
  • progress: { done, pending, scraping, failed, total, businessesFound, initialized }

• If progress.initialized is false → campaign not yet initialized; tell the user to click "Initialize Campaign" on the /leads dashboard, then stop
• If nextCity is null → all cities are complete; report campaign finished and stop
• Record nextCity._id as the cityId for all mark_city_status calls this session`);

  // ── STEP 2: Prospecting ────────────────────────────────────────────────
  steps.push(`═══════════════════════════════════════
STEP ${stepNum++} — PROSPECTING (repeat for each city until daily target is hit)
═══════════════════════════════════════
Verticals: ${vList.map((v, i) => `${i + 1}. "${v}"`).join(" | ")}
Daily target: ${dailyResults} NEW businesses total across all verticals

FOR EACH CITY (start from nextCity returned in Step 1):
  1. Call mark_city_status({ cityId: nextCity._id, status: "in_progress" })
  2. For EACH vertical in the list above:
     • Call google_places_search({ query: "[vertical] in [cityName, stateCode]", organizationId })
     • The tool automatically saves new businesses and skips duplicates — you do NOT need to save manually
     • Also try: "best [vertical] [cityName]", "[vertical] near [cityName]" for more coverage
  3. Note how many new businesses were saved (the tool returns a count)
  4. When all verticals are done for this city:
     • Call mark_city_status({ cityId, status: "done", businessesFound: N })
  5. Call get_city_campaign_progress() again to get the NEXT pending city
  6. Repeat until you reach ${dailyResults} new businesses OR no more pending cities`);

  // ── STEP 3: Enrichment ─────────────────────────────────────────────────
  if (hasEnrich) {
    steps.push(`═══════════════════════════════════════
STEP ${stepNum++} — ENRICHMENT
═══════════════════════════════════════
For each NEW business found in Step ${stepNum - 2}, enrich with: ${enrichFields}

• Call enrich_business({ businessId, name, website, city, state })
• The tool automatically updates the business record — you do NOT need to call any update function
• If a field cannot be found after 2 attempts, leave it null — do NOT fabricate data
• Track: how many businesses were enriched, owner names found, emails found, Meta pages found, LinkedIn profiles found`);
  }

  // ── STEP 4: Outreach ───────────────────────────────────────────────────
  if (outreachChannels.length > 0) {
    const outreachLines: string[] = [];

    if (outreachChannels.includes("email")) {
      const emailConfig = config.channelConfig?.email;
      const emailLimit = emailConfig?.dailyLimit ?? 50;
      const emailAccounts = emailConfig?.selectedAccounts?.length ?? 1;
      const totalEmailLimit = emailLimit * emailAccounts;
      outreachLines.push(`COLD EMAIL (${emailAccounts} account${emailAccounts !== 1 ? "s" : ""} — ${totalEmailLimit}/day total, ${emailLimit}/account):
  • Delegate to Cold Email Agent with businesses that have an email address
  • The Cold Email Agent will call get_email_ready_businesses and then write + send a unique plain-text email per business via send_direct_email
  • Hard daily limit: ${totalEmailLimit} sends — stop after ${totalEmailLimit} successful sends${servicePitch ? `\n  • Our pitch: ${servicePitch}\n  • Emails should open with something specific (reviewer name, city, rating), then one outcome-focused sentence about ${serviceLabel}, then a soft CTA` : ""}`);
    }

    if (outreachChannels.includes("meta")) {
      const metaConfig = config.channelConfig?.meta;
      const metaLimit = metaConfig?.dailyLimit ?? 10;
      const metaAccounts = metaConfig?.selectedAccounts?.length ?? 1;
      const totalMetaLimit = metaLimit * metaAccounts;
      outreachLines.push(`META MESSAGES (Facebook — ${metaAccounts} account${metaAccounts !== 1 ? "s" : ""}, ${totalMetaLimit}/day total):
  • Target: businesses with a Facebook page URL found in Step ${stepNum - 1}
  • Hard limit: ${totalMetaLimit} messages per day — stop after ${totalMetaLimit}
  • Call meta_friend_request({ businessId, ... }) for each eligible business — it logs the result automatically
  • Personalize each message: owner's first name + business name + a real Google review snippet${servicePitch ? `\n  • Our pitch: ${servicePitch}\n  • Open with a genuine compliment or observation about their business, then naturally introduce how we help with ${serviceLabel}` : ""}
  • NEVER send a generic template message`);
    }

    if (outreachChannels.includes("linkedin")) {
      const linkedinConfig = config.channelConfig?.linkedin;
      const linkedinLimit = linkedinConfig?.dailyLimit ?? 10;
      const linkedinAccounts = linkedinConfig?.selectedAccounts?.length ?? 1;
      const totalLinkedinLimit = linkedinLimit * linkedinAccounts;
      outreachLines.push(`LINKEDIN CONNECTIONS (${linkedinAccounts} account${linkedinAccounts !== 1 ? "s" : ""}, ${totalLinkedinLimit}/day total):
  • Target: businesses with a LinkedIn owner profile URL found in Step ${stepNum - 1}
  • Hard limit: ${totalLinkedinLimit} connection requests per day — stop after ${totalLinkedinLimit}
  • Call linkedin_connect({ businessId, ... }) for each eligible business — it logs the result automatically
  • Write a personalized note (UNDER 300 characters): reference their business name, city, or a real reviewer's name${servicePitch ? `\n  • Our pitch: ${servicePitch}\n  • Mention a specific detail about their business and hint at ${serviceLabel} without a hard pitch` : ""}
  • NEVER send a blank or generic connection note`);
    }

    steps.push(`═══════════════════════════════════════
STEP ${stepNum++} — OUTREACH
═══════════════════════════════════════
${outreachLines.join("\n\n")}`);
  }

  // ── STEP 5: Reddit ─────────────────────────────────────────────────────
  if (socialPresence.findRedditGroups || socialPresence.joinRedditGroups || socialPresence.postToReddit) {
    const redditLines: string[] = [];
    if (socialPresence.findRedditGroups) {
      redditLines.push(`DISCOVER SUBREDDITS:
  • Call find_social_groups({ verticals: ${JSON.stringify(vList)}, platforms: ["reddit"] })
  • Search for subreddits where: (a) potential customers of "${vNameShort}" businesses hang out, AND (b) subreddits for the business owners themselves
  • Note each subreddit name and URL for use in posting`);
    }
    if (socialPresence.joinRedditGroups) {
      redditLines.push(`JOIN SUBREDDITS:
  • Use browser automation to subscribe to each relevant subreddit found above
  • Prioritize subreddits with 10,000+ members`);
    }
    if (socialPresence.postToReddit) {
      const freq = socialPresence.redditPostFrequency;
      const count = socialPresence.redditPostCount;
      redditLines.push(`POST TO REDDIT (${count} posts/${freq}):
  • Check how many posts have been made this ${freq} — only post if quota has not been met
  • Call post_to_reddit({ subreddits, title, body, vertical, count }) — it saves post records automatically
  • Write VALUABLE content ONLY — tips, how-to guides, industry insights relevant to "${vNameShort}"
  • NEVER post promotional content or direct sales pitches — Reddit bans spam accounts
  • Vary post formats: question threads, tips lists, case studies, "what would you do" scenarios`);
    }
    steps.push(`═══════════════════════════════════════
STEP ${stepNum++} — REDDIT COMMUNITY PRESENCE
═══════════════════════════════════════
${redditLines.join("\n\n")}`);
  }

  // ── STEP 6: Facebook Groups ────────────────────────────────────────────
  if (socialPresence.findMetaGroups || socialPresence.joinMetaGroups || socialPresence.postToMetaGroups) {
    const metaLines: string[] = [];
    if (socialPresence.findMetaGroups) {
      metaLines.push(`DISCOVER FACEBOOK GROUPS:
  • Call find_social_groups({ verticals: ${JSON.stringify(vList)}, platforms: ["facebook"] })
  • Search for groups where: (a) customers of "${vNameShort}" businesses are active, AND (b) groups for the business owners/professionals themselves
  • Note each group name and URL; prioritize active groups with recent posts and 500+ members`);
    }
    if (socialPresence.joinMetaGroups) {
      metaLines.push(`JOIN FACEBOOK GROUPS:
  • Use browser automation to request to join each relevant group found above`);
    }
    if (socialPresence.postToMetaGroups) {
      const freq = socialPresence.metaPostFrequency;
      const count = socialPresence.metaPostCount;
      metaLines.push(`POST IN FACEBOOK GROUPS (${count} posts/${freq}):
  • Check how many posts have been made this ${freq} — only post if quota has not been met
  • Call post_to_meta_group({ groups, message, vertical, count }) — it saves post records automatically
  • Write VALUABLE content only — tips, questions, resources — NOT sales pitches
  • Tailor each post to the group's audience (customer-facing vs owner-facing tone)`);
    }
    steps.push(`═══════════════════════════════════════
STEP ${stepNum++} — FACEBOOK GROUP PRESENCE
═══════════════════════════════════════
${metaLines.join("\n\n")}`);
  }

  // ── STEP 7: LinkedIn Groups ─────────────────────────────────────────────
  if (socialPresence.findLinkedinGroups || socialPresence.joinLinkedinGroups || socialPresence.postToLinkedinGroups) {
    const linkedinLines: string[] = [];
    if (socialPresence.findLinkedinGroups) {
      linkedinLines.push(`DISCOVER LINKEDIN GROUPS:
  • Call find_social_groups({ verticals: ${JSON.stringify(vList)}, platforms: ["linkedin"] })
  • Search for LinkedIn groups where "${vNameShort}" business owners and decision-makers are active
  • Also find industry association groups and local business owner groups`);
    }
    if (socialPresence.joinLinkedinGroups) {
      linkedinLines.push(`JOIN LINKEDIN GROUPS:
  • Use browser automation to request to join each relevant LinkedIn group found above`);
    }
    if (socialPresence.postToLinkedinGroups) {
      const freq = socialPresence.linkedinPostFrequency;
      const count = socialPresence.linkedinPostCount;
      linkedinLines.push(`POST IN LINKEDIN GROUPS (${count} posts/${freq}):
  • Check how many posts have been made this ${freq} — only post if quota has not been met
  • Use linkedin_connect or browser automation to post to each target group
  • Write professional, insight-driven content — industry trends, tips for "${vNameShort}" owners, data-backed observations
  • LinkedIn audiences expect professional tone — no casual or promotional posts`);
    }
    steps.push(`═══════════════════════════════════════
STEP ${stepNum++} — LINKEDIN GROUP PRESENCE
═══════════════════════════════════════
${linkedinLines.join("\n\n")}`);
  }

  // ── STEP: Nextdoor ────────────────────────────────────────────────────
  if (socialPresence.findNextdoor || socialPresence.joinNextdoor || socialPresence.postToNextdoor) {
    const lines: string[] = [];
    if (socialPresence.findNextdoor || socialPresence.joinNextdoor) {
      lines.push(`DISCOVER NEXTDOOR COMMUNITIES:
  • Use web_search to find active Nextdoor neighborhoods in cities within: ${stateScope}
  • Focus on neighborhoods near the businesses you are targeting for the "${vNameShort}" vertical
  • Nextdoor is hyper-local — prioritize cities you are actively prospecting${socialPresence.joinNextdoor ? `\n  • Join each relevant neighborhood community` : ""}`);
    }
    if (socialPresence.postToNextdoor) {
      lines.push(`POST ON NEXTDOOR (${socialPresence.nextdoorPostCount} posts/${socialPresence.nextdoorPostFrequency}):
  • Check how many posts have been made this ${socialPresence.nextdoorPostFrequency} — only post if quota not yet met
  • Post as a neighbor — local, helpful, personal tone
  • Examples: "Neighbors — anyone used a local ${vNameShort} recently?", "Quick tip for [City] residents about choosing a good ${vNameShort}..."
  • Reference the specific city/neighborhood. NEVER post like a business.`);
    }
    steps.push(`═══════════════════════════════════════
STEP ${stepNum++} — NEXTDOOR PRESENCE
═══════════════════════════════════════
${lines.join("\n\n")}`);
  }

  // ── STEP: Quora ────────────────────────────────────────────────────────
  if (socialPresence.findQuora || socialPresence.followQuora || socialPresence.postToQuora) {
    const lines: string[] = [];
    if (socialPresence.findQuora || socialPresence.followQuora) {
      lines.push(`DISCOVER QUORA QUESTIONS & SPACES:
  • Search Quora for questions about: "${vNameShort}", how to choose a ${vNameShort}, best ${vNameShort} in [city], ${vNameShort} reviews
  • Target questions with 1,000+ views that have weak or outdated answers
  • These answers get indexed by Google — quality drives long-term traffic${socialPresence.followQuora ? `\n  • Follow relevant Quora Spaces` : ""}`);
    }
    if (socialPresence.postToQuora) {
      lines.push(`ANSWER ON QUORA (${socialPresence.quoraPostCount} answers/${socialPresence.quoraPostFrequency}):
  • Check how many answers have been posted this ${socialPresence.quoraPostFrequency} — only answer if quota not yet met
  • Write thorough, expert answers — cite specific tips for choosing a "${vNameShort}"
  • Target: "What should I look for in a ${vNameShort}?", "How do I find a reliable ${vNameShort}?", "Best ${vNameShort} in [City]?"`);
    }
    steps.push(`═══════════════════════════════════════
STEP ${stepNum++} — QUORA PRESENCE
═══════════════════════════════════════
${lines.join("\n\n")}`);
  }

  // ── STEP: X / Twitter ─────────────────────────────────────────────────
  if (socialPresence.findTwitter || socialPresence.followTwitter || socialPresence.postToTwitter) {
    const lines: string[] = [];
    if (socialPresence.findTwitter || socialPresence.followTwitter) {
      lines.push(`DISCOVER X / TWITTER CONVERSATIONS:
  • Search X for recent tweets (last 48h) about: "${vNameShort}", "looking for a ${vNameShort}", "need a ${vNameShort} recommendation", "${vNameShort} in [State]"
  • Find people actively asking for recommendations or sharing experiences${socialPresence.followTwitter ? `\n  • Follow relevant accounts and industry hashtags` : ""}`);
    }
    if (socialPresence.postToTwitter) {
      lines.push(`POST ON X / TWITTER (${socialPresence.twitterPostCount} posts/${socialPresence.twitterPostFrequency}):
  • Check how many posts have been made this ${socialPresence.twitterPostFrequency} — only post if quota not yet met
  • Reply helpfully to people asking about "${vNameShort}" — genuine answers only
  • Also post original educational threads: "5 things to know before hiring a ${vNameShort} 🧵"
  • Use 2–3 relevant hashtags max. NEVER reply with promotional content.`);
    }
    steps.push(`═══════════════════════════════════════
STEP ${stepNum++} — X / TWITTER PRESENCE
═══════════════════════════════════════
${lines.join("\n\n")}`);
  }

  // ── STEP: Discord ──────────────────────────────────────────────────────
  if (socialPresence.findDiscord || socialPresence.joinDiscord || socialPresence.postToDiscord) {
    const lines: string[] = [];
    if (socialPresence.findDiscord || socialPresence.joinDiscord) {
      lines.push(`DISCOVER DISCORD SERVERS:
  • Search disboard.org and discord.com/discovery for servers related to: "${vNameShort}", home improvement, local business, real estate, trade professionals
  • Target servers with active #advice, #recommendations, or #general channels and 500+ members${socialPresence.joinDiscord ? `\n  • Join relevant servers` : ""}`);
    }
    if (socialPresence.postToDiscord) {
      lines.push(`POST IN DISCORD (${socialPresence.discordPostCount} posts/${socialPresence.discordPostFrequency}):
  • Check how many posts have been made this ${socialPresence.discordPostFrequency} — only post if quota not yet met
  • Engage in relevant channels — answer questions, share tips related to "${vNameShort}"
  • Discord is relationship-driven — build presence gradually, never spam`);
    }
    steps.push(`═══════════════════════════════════════
STEP ${stepNum++} — DISCORD PRESENCE
═══════════════════════════════════════
${lines.join("\n\n")}`);
  }

  // ── STEP: YouTube ──────────────────────────────────────────────────────
  if (socialPresence.findYoutube || socialPresence.subscribeYoutube || socialPresence.postToYoutube) {
    const lines: string[] = [];
    if (socialPresence.findYoutube || socialPresence.subscribeYoutube) {
      lines.push(`DISCOVER YOUTUBE VIDEOS:
  • Search YouTube for videos about: "best ${vNameShort}", "how to choose a ${vNameShort}", "${vNameShort} tips", "${vNameShort} explained"
  • Target videos with 10,000+ views where people are asking questions in comments${socialPresence.subscribeYoutube ? `\n  • Subscribe to relevant channels` : ""}`);
    }
    if (socialPresence.postToYoutube) {
      lines.push(`COMMENT ON YOUTUBE (${socialPresence.youtubePostCount} comments/${socialPresence.youtubePostFrequency}):
  • Check how many comments have been posted this ${socialPresence.youtubePostFrequency} — only post if quota not yet met
  • Add genuinely helpful comments — answer viewer questions, add tips the video missed
  • Example: reply to "anyone know if X is better than Y?" with a thorough, helpful answer
  • NEVER post links or promotional content in comments`);
    }
    steps.push(`═══════════════════════════════════════
STEP ${stepNum++} — YOUTUBE PRESENCE
═══════════════════════════════════════
${lines.join("\n\n")}`);
  }

  // ── FINAL REPORT ──────────────────────────────────────────────────────
  steps.push(`═══════════════════════════════════════
STEP ${stepNum} — FINAL REPORT (always run this last)
═══════════════════════════════════════
Report the following numbers clearly:

📍 GEOGRAPHY
  • Cities targeted today: [list city + state]
  • Cities completed (all-time): [N] of ${cityCount}
  • Cities remaining: [N]

🏢 BUSINESSES
  • New businesses found today: [N]
  • Total in database (all-time): [N]
  • With email address: [N]
  • With owner name: [N]
  • With Facebook page: [N]
  • With LinkedIn profile: [N]

📬 OUTREACH${outreachChannels.includes("email") ? `\n  • Cold emails sent today: [N] / ${(config.channelConfig?.email?.dailyLimit ?? 50) * (config.channelConfig?.email?.selectedAccounts?.length ?? 1)}` : ""}${outreachChannels.includes("meta") ? `\n  • Meta messages sent today: [N] / ${(config.channelConfig?.meta?.dailyLimit ?? 10) * (config.channelConfig?.meta?.selectedAccounts?.length ?? 1)}` : ""}${outreachChannels.includes("linkedin") ? `\n  • LinkedIn connections sent today: [N] / ${(config.channelConfig?.linkedin?.dailyLimit ?? 10) * (config.channelConfig?.linkedin?.selectedAccounts?.length ?? 1)}` : ""}${outreachChannels.length === 0 ? "\n  • No outreach channels configured" : ""}

${(socialPresence.postToReddit || socialPresence.postToMetaGroups || socialPresence.postToLinkedinGroups || socialPresence.findRedditGroups || socialPresence.findMetaGroups || socialPresence.findLinkedinGroups) ? `📢 COMMUNITY PRESENCE${socialPresence.findRedditGroups ? `\n  • Reddit subreddits discovered: [N]` : ""}${socialPresence.joinRedditGroups ? `\n  • Subreddits joined (all-time): [N]` : ""}${socialPresence.postToReddit ? `\n  • Reddit posts this run: [N] (${socialPresence.redditPostCount}/${socialPresence.redditPostFrequency} quota)` : ""}${socialPresence.findMetaGroups ? `\n  • Facebook groups discovered: [N]` : ""}${socialPresence.joinMetaGroups ? `\n  • Facebook groups joined (all-time): [N]` : ""}${socialPresence.postToMetaGroups ? `\n  • Facebook group posts this run: [N] (${socialPresence.metaPostCount}/${socialPresence.metaPostFrequency} quota)` : ""}${socialPresence.findLinkedinGroups ? `\n  • LinkedIn groups discovered: [N]` : ""}${socialPresence.joinLinkedinGroups ? `\n  • LinkedIn groups joined (all-time): [N]` : ""}${socialPresence.postToLinkedinGroups ? `\n  • LinkedIn group posts this run: [N] (${socialPresence.linkedinPostCount}/${socialPresence.linkedinPostFrequency} quota)` : ""}\n\n` : ""}⚠️ ERRORS / SKIPPED
  • Duplicate businesses skipped: [N]
  • Enrichment failures: [N]
  • Outreach failures: [N] — [brief reason if known]`);

  return `You are the Lead Generation Agent running the daily campaign.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMPAIGN PARAMETERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Verticals:       ${vList.map((v, i) => `${i + 1}. ${v}`).join(" | ")}
Geography:       ${stateScope}
City target:     Top ${cityCount} largest cities (by population)
Daily goal:      ${dailyResults} NEW businesses per run
Data to collect: ${dataCollected || "business name, address"}${serviceLabel ? `
Service Offering: ${serviceLabel}${serviceOfferingDetails?.trim() ? `\nAdditional details: ${serviceOfferingDetails.trim()}` : ""}` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT WE ARE SELLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${servicePitch
  ? `We are offering: ${serviceLabel}
Value proposition: We help ${vNameShort} businesses with ${servicePitch}.

All outreach messages — cold emails, Facebook messages, LinkedIn connection notes — MUST reference this service naturally and specifically. Never say "I can help your business grow" generically. Always tie the pitch directly to what we offer.

Example personalization patterns:
• "I noticed your [business name] has great reviews — we help [vertical]s like yours get more leads through [service]"
• "Quick question — are you currently happy with how many [relevant outcome] you're getting per month?"
• Reference their real reviewer names, rating, or city to show you've actually looked at their business`
  : `⚠️ No service offering configured. Agents will use generic outreach language. For best results, set a specific service in the campaign config.`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATABASE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every tool saves its own results to the database automatically. You do NOT call any separate save/update functions.
• google_places_search → saves new businesses, skips duplicates automatically
• enrich_business → updates the business record with owner/social data automatically
• meta_friend_request / linkedin_connect / send_cold_email → log outreach results automatically
• post_to_reddit / post_to_meta_group → save post records automatically
• mark_city_status → updates city progress automatically
Your only job: call the right tools in the right order. The dashboard populates itself.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTION STEPS (follow in order)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${steps.join("\n\n")}`;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const absDiff = Math.abs(diff);
  const isFuture = diff < 0;
  const minutes = Math.floor(absDiff / 60000);
  if (minutes < 1) return isFuture ? "in <1m" : "just now";
  if (minutes < 60) return isFuture ? `in ${minutes}m` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return isFuture ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return isFuture ? `in ${days}d` : `${days}d ago`;
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatScheduleLabel(schedule: { type: string; cronExpression?: string; runAt?: number }): string {
  if (schedule.type === "once") {
    return schedule.runAt ? `Once at ${new Date(schedule.runAt).toLocaleString()}` : "One-time";
  }
  const option = CRON_OPTIONS.find((o) => o.value === schedule.cronExpression);
  return option?.label || schedule.cronExpression?.replace(/_/g, " ") || "recurring";
}

export default function ScheduledPage() {
  const { org, effectiveClerkOrgId, isImpersonating } = useEffectiveOrg();
  const { user } = useUser();
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);

  const currentUser = useQuery(
    api.users.getCurrent,
    user?.id && effectiveClerkOrgId
      ? { clerkUserId: user.id, clerkOrgId: effectiveClerkOrgId }
      : "skip"
  );

  // When impersonating, currentUser is null (admin doesn't exist in tenant's users).
  // Fetch org users to get a fallback createdBy for task creation.
  const orgUsers = useQuery(
    api.users.getByOrganization,
    isImpersonating && org?._id ? { organizationId: org._id } : "skip"
  );
  const fallbackUserId = orgUsers?.[0]?._id;

  const tasks = useQuery(
    api.scheduledTaskRunner.listByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const teamAgents = useQuery(
    api.teamAgents.listByOrganization,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const projects = useQuery(
    api.projects.list,
    org?._id ? { organizationId: org._id } : "skip"
  );

  const createTask = useMutation(api.scheduledTaskRunner.createTask);
  const updateTask = useMutation(api.scheduledTaskRunner.updateTask);
  const deleteTask = useMutation(api.scheduledTaskRunner.deleteTask);
  const runNow = useMutation(api.scheduledTaskRunner.runNow);
  const setupLeadGenHierarchy = useMutation(api.agentTeams.setupLeadGenHierarchy);

  const handleCreate = async (formData: {
    name: string;
    prompt: string;
    agentType: string;
    scheduleType: "cron" | "once";
    cronExpression: string;
    runAt: string;
    teamAgentId?: string;
    projectId?: string;
    campaignConfig?: CampaignConfig;
  }) => {
    if (!org?._id || (!currentUser?._id && !isImpersonating)) return;

    // Auto-setup lead gen hierarchy when creating a lead_gen_agent task
    if (formData.agentType === "lead_gen_agent") {
      try {
        await setupLeadGenHierarchy({
          organizationId: org._id,
          modelId: "anthropic/claude-haiku-4.5", // fallback for any agent not in agentModels
          agentModels: formData.campaignConfig?.agentModels ?? Object.fromEntries(AGENT_ROLES.map((r) => [r.key, r.recommendedModel])),
        });
      } catch {
        // Non-fatal — team may already exist
      }
    }

    const creatorId = currentUser?._id || fallbackUserId;
    if (!creatorId) return;

    await createTask({
      organizationId: org._id,
      createdBy: creatorId,
      name: formData.name,
      prompt: formData.prompt,
      agentConfig: { agentType: formData.agentType },
      teamAgentId: formData.teamAgentId
        ? (formData.teamAgentId as Id<"teamAgents">)
        : undefined,
      projectId: formData.projectId
        ? (formData.projectId as Id<"projects">)
        : undefined,
      schedule:
        formData.scheduleType === "cron"
          ? { type: "cron", cronExpression: formData.cronExpression }
          : { type: "once", runAt: new Date(formData.runAt).getTime() },
      campaignConfig: formData.campaignConfig,
    });
    setShowForm(false);
  };

  const handleEdit = async (formData: {
    name: string;
    prompt: string;
    agentType: string;
    scheduleType: "cron" | "once";
    cronExpression: string;
    runAt: string;
    teamAgentId?: string;
    projectId?: string;
    campaignConfig?: CampaignConfig;
  }) => {
    if (!editingTask || !org?._id) return;

    // Auto-setup lead gen hierarchy when saving a lead_gen_agent task
    if (formData.agentType === "lead_gen_agent") {
      try {
        await setupLeadGenHierarchy({
          organizationId: org._id,
          modelId: "anthropic/claude-haiku-4.5", // fallback for any agent not in agentModels
          agentModels: formData.campaignConfig?.agentModels ?? Object.fromEntries(AGENT_ROLES.map((r) => [r.key, r.recommendedModel])),
        });
      } catch {
        // Non-fatal
      }
    }

    await updateTask({
      taskId: editingTask._id,
      name: formData.name,
      prompt: formData.prompt,
      agentConfig: { agentType: formData.agentType },
      teamAgentId: formData.teamAgentId
        ? (formData.teamAgentId as Id<"teamAgents">)
        : undefined,
      projectId: formData.projectId
        ? (formData.projectId as Id<"projects">)
        : undefined,
      schedule:
        formData.scheduleType === "cron"
          ? { type: "cron", cronExpression: formData.cronExpression }
          : { type: "once", runAt: formData.runAt ? new Date(formData.runAt).getTime() : (editingTask?.schedule?.runAt ?? Date.now()) },
      campaignConfig: formData.campaignConfig,
    });
    setEditingTask(null);
  };

  if (!org || (!currentUser && !isImpersonating)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scheduled Tasks</h1>
          <p className="text-muted-foreground mt-1">
            Automate your agents with scheduled and recurring tasks.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      </div>

      {showForm && (
        <TaskForm
          teamAgents={teamAgents || []}
          projects={projects || []}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          organizationId={org?._id}
        />
      )}

      {editingTask && (
        <div ref={(el) => el?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          <TaskForm
            teamAgents={teamAgents || []}
            projects={projects || []}
            initial={editingTask}
            onSubmit={handleEdit}
            onCancel={() => setEditingTask(null)}
            organizationId={org?._id}
          />
        </div>
      )}

      {tasks === undefined ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tasks.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-border">
          <Clock className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold mb-1">No scheduled tasks yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
            Create automated tasks that run on a schedule. Perfect for daily
            reports, weekly summaries, and recurring workflows.
          </p>
          <Button className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Create your first task
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const assignedAgent = task.teamAgentId
              ? teamAgents?.find((a) => a._id === task.teamAgentId)
              : null;
            return (
              <TaskCard
                key={task._id}
                task={task}
                assignedAgentName={assignedAgent?.name}
                onPauseResume={(id, status) =>
                  updateTask({ taskId: id, status })
                }
                onDelete={(id) => deleteTask({ taskId: id })}
                onRunNow={(id) => runNow({ taskId: id })}
                onEdit={(t) => setEditingTask(t)}
                organizationId={org?._id}
                providerKeys={org?.providerKeys as Record<string, any> | undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Task Form (Create / Edit) ───────────────────────────────────────

// ── Service Offering Selector ─────────────────────────────────────────

function ServiceOfferingSelector({
  value,
  details,
  onChange,
  onDetailsChange,
}: {
  value: string;
  details: string;
  onChange: (val: string) => void;
  onDetailsChange: (val: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const selected = SERVICE_OFFERINGS.find((s) => s.id === value);
  const isOther = value === "other";
  const groups = Array.from(new Set(SERVICE_OFFERINGS.map((s) => s.group)));

  const displayLabel = isOther
    ? (details.trim() || "Other / Not Listed")
    : selected?.label ?? "Select a service offering...";

  return (
    <div className="space-y-2">
      {/* Dropdown trigger */}
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setShowMenu((v) => !v); }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-border bg-background text-xs hover:border-primary/40 transition-colors"
        >
          <span className={value ? "text-foreground" : "text-muted-foreground"}>
            {displayLabel}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showMenu ? "rotate-180" : ""}`} />
        </button>

        {showMenu && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
            <div className="max-h-72 overflow-y-auto p-3 space-y-3">
              {groups.map((group) => (
                <div key={group}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">{group}</p>
                  <div className="space-y-0.5">
                    {SERVICE_OFFERINGS.filter((s) => s.group === group).map((svc) => (
                      <button
                        key={svc.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onChange(svc.id);
                          setShowMenu(false);
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between ${
                          value === svc.id
                            ? "bg-primary/15 text-primary font-medium"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <span>{svc.label}</span>
                        {value === svc.id && <Check className="h-3 w-3 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {/* Other option */}
              <div className="border-t border-border pt-2">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange("other");
                    onDetailsChange("");
                    setShowMenu(false);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between ${
                    isOther
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <span>Other / Not Listed</span>
                  {isOther && <Check className="h-3 w-3 shrink-0" />}
                </button>
              </div>
            </div>
            <div className="border-t border-border px-3 py-2 flex justify-between items-center">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(""); onDetailsChange(""); setShowMenu(false); }}
                className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
              >
                Clear
              </button>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setShowMenu(false); }}
                className="text-xs text-primary font-medium hover:underline"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* "Other": type what you sell */}
      {isOther && (
        <input
          type="text"
          placeholder="e.g. commercial pest control services"
          value={details}
          onChange={(e) => onDetailsChange(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
          autoFocus
        />
      )}

      {/* Preset selected: show base pitch + extra details field */}
      {selected && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground/60 italic px-1">
            Base pitch: "{selected.pitch}"
          </p>
          <textarea
            placeholder="Add details about your specific offer, pricing, USP, target client, etc. — agents will use this to personalize messages further"
            value={details}
            onChange={(e) => onDetailsChange(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 resize-none"
          />
        </div>
      )}
    </div>
  );
}

function TaskForm({
  teamAgents,
  projects,
  initial,
  onSubmit,
  onCancel,
  organizationId,
}: {
  teamAgents: Array<{ _id: Id<"teamAgents">; name: string; isEnabled: boolean }>;
  projects: Array<{ _id: Id<"projects">; name: string }>;
  initial?: any;
  onSubmit: (data: {
    name: string;
    prompt: string;
    agentType: string;
    scheduleType: "cron" | "once";
    cronExpression: string;
    runAt: string;
    teamAgentId?: string;
    projectId?: string;
    campaignConfig?: CampaignConfig;
  }) => Promise<void>;
  onCancel: () => void;
  organizationId?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [agentType, setAgentType] = useState(
    initial?.agentConfig?.agentType ?? "general"
  );
  const [scheduleType, setScheduleType] = useState<"cron" | "once">(
    initial?.schedule?.type ?? "cron"
  );
  const [cronExpression, setCronExpression] = useState(
    initial?.schedule?.cronExpression ?? "every_1h"
  );
  const [runAt, setRunAt] = useState(() => {
    // Pre-fill with existing runAt when editing a "once" task
    if (initial?.schedule?.type === "once" && initial.schedule.runAt) {
      const d = new Date(initial.schedule.runAt);
      // Format as datetime-local value: YYYY-MM-DDTHH:mm
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return "";
  });
  const [teamAgentId, setTeamAgentId] = useState(
    initial?.teamAgentId ?? ""
  );
  const [projectId, setProjectId] = useState(
    initial?.projectId ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [campaignConfig, setCampaignConfig] = useState<CampaignConfig>(() => {
    const base: CampaignConfig = (initial?.campaignConfig && (initial.campaignConfig as any).campaignMode !== "consumer")
      ? (initial.campaignConfig as CampaignConfig)
      : DEFAULT_CAMPAIGN_CONFIG;
    // Backfill agentModels for tasks created before per-agent model selection was added
    if (!base.agentModels || Object.keys(base.agentModels).length === 0) {
      return { ...base, agentModels: Object.fromEntries(AGENT_ROLES.map((r) => [r.key, r.recommendedModel])) };
    }
    return base;
  });
  const [consumerConfig, setConsumerConfig] = useState<ConsumerConfig>(
    (initial?.campaignConfig as any)?.campaignMode === "consumer"
      ? (initial.campaignConfig as any)
      : DEFAULT_CONSUMER_CONFIG
  );
  const [campaignMode, setCampaignMode] = useState<"b2b" | "consumer">(
    (initial?.campaignConfig as any)?.campaignMode === "consumer" ? "consumer" : "b2b"
  );

  const [showPrompt, setShowPrompt] = useState(!!(initial?.prompt));
  const [showVerticalMenu, setShowVerticalMenu] = useState(false);
  const [showPromotionMenu, setShowPromotionMenu] = useState(false);
  const verticalRef = useRef<HTMLDivElement>(null);
  const promotionRef = useRef<HTMLDivElement>(null);

  // Fetch available accounts for outreach channels
  const [availableAccounts, setAvailableAccounts] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!organizationId) return;
    const providers = ["gmail_smtp_accounts", "warmed_email_accounts", "meta_accounts", "linkedin_accounts"];
    Promise.all(
      providers.map(p =>
        fetch(`/api/provider-keys/social-accounts?provider=${p}&organizationId=${organizationId}`)
          .then(r => r.json())
          .then(d => ({ provider: p, emails: (d.accounts || []).map((a: any) => a.email) }))
          .catch(() => ({ provider: p, emails: [] }))
      )
    ).then(results => {
      const map: Record<string, string[]> = {};
      for (const r of results) map[r.provider] = r.emails;
      setAvailableAccounts(map);
    });
  }, [organizationId]);

  useEffect(() => {
    if (!showVerticalMenu) return;
    const handler = (e: MouseEvent) => {
      if (verticalRef.current && !verticalRef.current.contains(e.target as Node)) {
        setShowVerticalMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showVerticalMenu]);

  useEffect(() => {
    if (!showPromotionMenu) return;
    const handler = (e: MouseEvent) => {
      if (promotionRef.current && !promotionRef.current.contains(e.target as Node)) {
        setShowPromotionMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPromotionMenu]);

  const isLeadGen = agentType === "lead_gen_agent";

  const [verticalError, setVerticalError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Require at least one vertical for B2B lead gen tasks
    if (isLeadGen && campaignMode === "b2b" && (campaignConfig.verticals ?? []).length === 0) {
      setVerticalError(true);
      verticalRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setVerticalError(false);

    // For lead_gen_agent, auto-generate prompt from campaign config if prompt is empty
    const finalPrompt = isLeadGen && !prompt.trim()
      ? (campaignMode === "consumer" ? generateConsumerPrompt(consumerConfig) : generateLeadGenPrompt(campaignConfig))
      : (!isLeadGen && !showPrompt)
        ? (AGENT_SPECIALTIES.find((s) => s.id === agentType)?.promptSnippet ?? "")
        : prompt;
    if (!name.trim() || !finalPrompt.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name,
        prompt: finalPrompt,
        agentType,
        scheduleType,
        cronExpression,
        runAt,
        teamAgentId: teamAgentId || undefined,
        projectId: projectId || undefined,
        campaignConfig: isLeadGen
          ? (campaignMode === "consumer" ? (consumerConfig as any) : campaignConfig)
          : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const updateSocialPresence = (key: keyof CampaignConfig["socialPresence"], value: any) => {
    setCampaignConfig((prev) => ({
      ...prev,
      socialPresence: { ...prev.socialPresence, [key]: value },
    }));
  };

  const updateConsumerChannel = (
    platform: keyof ConsumerSocialPresence,
    field: keyof SocialChannel,
    value: any
  ) => {
    setConsumerConfig((prev) => {
      const current = prev.socialPresence[platform];
      const patch: Partial<SocialChannel> = { [field]: value };
      // When switching to daily, cap count at 1
      if (field === "postFrequency" && value === "daily") {
        patch.postCount = 1;
      }
      // When setting a count > 1, enforce daily can't exceed 1
      if (field === "postCount" && current.postFrequency === "daily" && (value as number) > 1) {
        patch.postCount = 1;
      }
      return {
        ...prev,
        socialPresence: {
          ...prev.socialPresence,
          [platform]: { ...current, ...patch },
        },
      };
    });
  };

  const toggleDataField = (field: string) => {
    setCampaignConfig((prev) => ({
      ...prev,
      dataFields: prev.dataFields.includes(field)
        ? prev.dataFields.filter((f) => f !== field)
        : [...prev.dataFields, field],
    }));
  };

  const toggleOutreachChannel = (channel: string) => {
    setCampaignConfig((prev) => ({
      ...prev,
      outreachChannels: prev.outreachChannels.includes(channel)
        ? prev.outreachChannels.filter((c) => c !== channel)
        : [...prev.outreachChannels, channel],
    }));
  };

  // When agentType changes to lead_gen_agent, auto-generate prompt preview
  const handleAgentTypeChange = (value: string) => {
    setAgentType(value);
    if (value === "lead_gen_agent" && !prompt.trim()) {
      // Leave prompt empty — will be generated on submit
    }
  };

  const enabledAgents = teamAgents.filter((a) => a.isEnabled);

  // Group cron options
  const groups = [...new Set(CRON_OPTIONS.map((o) => o.group))];

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-muted/30 p-4 space-y-4"
    >
      <h3 className="font-semibold text-sm">
        {initial ? "Edit Task" : "Create New Task"}
      </h3>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Name
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Daily lead prospecting, Weekly report"
          required
        />
      </div>

      {!isLeadGen && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Prompt</label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showPrompt}
                onChange={(e) => setShowPrompt(e.target.checked)}
                className="rounded border-border"
              />
              Show prompt
            </label>
          </div>
          {showPrompt && (
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the agent do?"
              required={!isLeadGen && showPrompt}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          )}
          {!showPrompt && (
            <p className="text-xs text-muted-foreground/60 italic">
              Using default specialty prompt. Check "Show prompt" to customize.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Agent Specialty
          </label>
          <select
            value={agentType}
            onChange={(e) => handleAgentTypeChange(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {AGENT_SPECIALTIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Assign to Team Agent{" "}
            <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <select
            value={teamAgentId}
            onChange={(e) => setTeamAgentId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">None (use default)</option>
            {enabledAgents.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── B2B / Consumer mode toggle ── */}
      {isLeadGen && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Campaign Type</label>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setCampaignMode("b2b")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                campaignMode === "b2b"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted/50"
              }`}
            >
              B2B Leads
            </button>
            <button
              type="button"
              onClick={() => setCampaignMode("consumer")}
              className={`flex-1 py-2 text-xs font-medium transition-colors border-l border-border ${
                campaignMode === "consumer"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted/50"
              }`}
            >
              Consumer Leads
            </button>
          </div>
        </div>
      )}

      {/* ── Consumer Campaign Configuration ── */}
      {isLeadGen && campaignMode === "consumer" && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Consumer Campaign Configuration</span>
          </div>

          {/* Promotions multi-select */}
          <div className="space-y-1.5" ref={promotionRef}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Promotions</label>
              {(consumerConfig.promotions ?? []).length > 0 && (
                <button
                  type="button"
                  onClick={() => setConsumerConfig((prev) => ({ ...prev, promotions: [] }))}
                  className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Selected chips */}
            {(consumerConfig.promotions ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(consumerConfig.promotions ?? []).map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">
                    {p}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setConsumerConfig((prev) => ({ ...prev, promotions: prev.promotions.filter((x) => x !== p) }));
                      }}
                      className="hover:text-primary/60 ml-0.5"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Trigger button */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setShowPromotionMenu((v) => !v); }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-border bg-background text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
              >
                <span>{(consumerConfig.promotions ?? []).length === 0 ? "Select promotions to target..." : `${consumerConfig.promotions.length} selected — click to add more`}</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showPromotionMenu ? "rotate-180" : ""}`} />
              </button>

              {showPromotionMenu && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
                  <div className="p-3 grid grid-cols-3 gap-x-4 gap-y-3 max-h-72 overflow-y-auto">
                    {PROMOTION_CATEGORIES.map((cat) => (
                      <div key={cat.label}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">{cat.label}</p>
                        <div className="space-y-0.5">
                          {cat.items.map((item) => {
                            const selected = (consumerConfig.promotions ?? []).includes(item);
                            return (
                              <button
                                key={item}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setConsumerConfig((prev) => ({
                                    ...prev,
                                    promotions: selected
                                      ? prev.promotions.filter((x) => x !== item)
                                      : [...(prev.promotions ?? []), item],
                                  }));
                                }}
                                className={`w-full text-left text-xs px-2 py-1 rounded-md flex items-center gap-2 transition-colors ${
                                  selected ? "bg-primary/15 text-primary font-medium" : "hover:bg-accent hover:text-accent-foreground"
                                }`}
                              >
                                {selected ? <Check className="h-3 w-3 shrink-0" /> : <span className="w-3" />}
                                {item}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border px-3 py-2 flex justify-end">
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowPromotionMenu(false); }} className="text-xs text-primary font-medium hover:underline">
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Target States */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Target States</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConsumerConfig((prev) => ({ ...prev, states: US_STATES }))} className="text-[10px] text-primary hover:underline">Select All</button>
                <button type="button" onClick={() => setConsumerConfig((prev) => ({ ...prev, states: [] }))} className="text-[10px] text-muted-foreground hover:text-foreground hover:underline">Clear</button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 max-h-48 overflow-y-auto rounded-md border border-border bg-muted/10 p-2">
              {US_STATES.map((state) => (
                <label key={state} className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={(consumerConfig.states ?? []).includes(state)}
                    onChange={() => {
                      setConsumerConfig((prev) => ({
                        ...prev,
                        states: (prev.states ?? []).includes(state)
                          ? (prev.states ?? []).filter((s) => s !== state)
                          : [...(prev.states ?? []), state],
                      }));
                    }}
                    className="rounded border-border"
                  />
                  {state}
                </label>
              ))}
            </div>
            {(consumerConfig.states ?? []).length > 0 && (
              <p className="text-[10px] text-muted-foreground">{consumerConfig.states.length} state{consumerConfig.states.length !== 1 ? "s" : ""} selected</p>
            )}
          </div>

          {/* Community & Social Presence */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Community & Social Presence</span>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-4">
              {([
                { key: "reddit",   label: "Reddit",          dot: "bg-orange-500",  findLabel: "Find relevant subreddits",        joinLabel: "Subscribe to subreddits",        postLabel: "Post content in subreddits",   counts: [1,3,5,10,20] },
                { key: "facebook", label: "Facebook Groups", dot: "bg-blue-500",    findLabel: "Find relevant Facebook groups",   joinLabel: "Request to join groups",         postLabel: "Post content in groups",       counts: [1,3,5,10,20] },
                { key: "linkedin", label: "LinkedIn Groups", dot: "bg-sky-600",     findLabel: "Find relevant LinkedIn groups",   joinLabel: "Request to join groups",         postLabel: "Post content in groups",       counts: [1,3,5,10] },
                { key: "nextdoor", label: "Nextdoor",        dot: "bg-green-600",   findLabel: "Find neighborhood communities",   joinLabel: "Join neighborhood communities",  postLabel: "Post content on Nextdoor",     counts: [1,3,5,10] },
                { key: "quora",    label: "Quora",           dot: "bg-red-600",     findLabel: "Find relevant questions/spaces",  joinLabel: "Follow relevant Quora spaces",   postLabel: "Answer questions on Quora",    counts: [1,3,5,10] },
                { key: "twitter",  label: "X / Twitter",     dot: "bg-zinc-400",    findLabel: "Find relevant conversations",     joinLabel: "Follow relevant accounts/topics",postLabel: "Post & reply on X/Twitter",    counts: [1,3,5,10,20] },
                { key: "discord",  label: "Discord",         dot: "bg-indigo-500",  findLabel: "Find relevant Discord servers",   joinLabel: "Join relevant servers",          postLabel: "Post in Discord servers",      counts: [1,3,5,10] },
                { key: "youtube",  label: "YouTube",         dot: "bg-red-500",     findLabel: "Find relevant videos to comment on", joinLabel: "Subscribe to relevant channels", postLabel: "Comment on YouTube videos",  counts: [1,3,5,10] },
              ] as const).map((platform, idx, arr) => {
                const ch = consumerConfig.socialPresence[platform.key as keyof ConsumerSocialPresence] ?? DEFAULT_SOCIAL_CHANNEL;
                return (
                  <div key={platform.key}>
                    {idx > 0 && <div className="border-t border-border/50 mb-4" />}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${platform.dot} inline-block`} />
                        {platform.label}
                      </p>
                      {[
                        { field: "find" as const, label: platform.findLabel },
                        { field: "join" as const, label: platform.joinLabel },
                        { field: "post" as const, label: platform.postLabel },
                      ].map(({ field, label }) => (
                        <label key={field} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input type="checkbox" checked={!!ch[field]}
                            onChange={(e) => updateConsumerChannel(platform.key as keyof ConsumerSocialPresence, field, e.target.checked)}
                            className="rounded border-border" />
                          {label}
                        </label>
                      ))}
                      {ch.post && (
                        <div className="ml-5 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">Posts:</span>
                          {platform.counts.map((n) => {
                            const isDaily = ch.postFrequency === "daily";
                            const disabled = isDaily && n > 1;
                            return (
                              <button key={n} type="button"
                                disabled={disabled}
                                onClick={() => updateConsumerChannel(platform.key as keyof ConsumerSocialPresence, "postCount", n)}
                                className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                                  ch.postCount === n
                                    ? "border-primary bg-primary/10 text-primary"
                                    : disabled
                                      ? "border-border/30 text-muted-foreground/30 cursor-not-allowed"
                                      : "border-border text-muted-foreground hover:bg-muted/50"
                                }`}>
                                {n}
                              </button>
                            );
                          })}
                          <span className="text-[10px] text-muted-foreground">per</span>
                          {(["daily", "weekly", "monthly"] as const).map((f) => (
                            <button key={f} type="button"
                              onClick={() => updateConsumerChannel(platform.key as keyof ConsumerSocialPresence, "postFrequency", f)}
                              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${ch.postFrequency === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"}`}>
                              {f}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── B2B Campaign Configuration Wizard ── */}
      {isLeadGen && campaignMode === "b2b" && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Campaign Configuration</span>
          </div>

          {/* Business Verticals */}
          <div className="space-y-1.5" ref={verticalRef}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Business Verticals
                <span className="text-red-600 ml-1">*</span>
              </label>
              {(campaignConfig.verticals ?? []).length > 0 && (
                <button
                  type="button"
                  onClick={() => setCampaignConfig((prev) => ({ ...prev, verticals: [] }))}
                  className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Selected chips */}
            {(campaignConfig.verticals ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(campaignConfig.verticals ?? []).map((v) => (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium"
                  >
                    {v}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCampaignConfig((prev) => ({ ...prev, verticals: (prev.verticals ?? []).filter((x) => x !== v) }));
                      }}
                      className="hover:text-primary/60 ml-0.5"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Trigger button */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setShowVerticalMenu((v) => !v); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md border bg-background text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors ${verticalError ? "border-red-500/70 bg-red-500/5" : "border-border"}`}
              >
                <span>{(campaignConfig.verticals ?? []).length === 0 ? "Select verticals..." : `${(campaignConfig.verticals ?? []).length} selected — click to add more`}</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showVerticalMenu ? "rotate-180" : ""}`} />
              </button>
              {verticalError && (
                <p className="text-xs text-red-600 mt-1">Select at least one business vertical to continue.</p>
              )}

              {showVerticalMenu && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
                  <div className="p-3 grid grid-cols-3 gap-x-4 gap-y-3 max-h-72 overflow-y-auto">
                    {VERTICAL_CATEGORIES.map((cat) => (
                      <div key={cat.label}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">{cat.label}</p>
                        <div className="space-y-0.5">
                          {cat.items.map((item) => {
                            const selected = (campaignConfig.verticals ?? []).includes(item);
                            return (
                              <button
                                key={item}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setCampaignConfig((prev) => {
                                    const current = prev.verticals ?? [];
                                    return {
                                      ...prev,
                                      verticals: selected
                                        ? current.filter((x) => x !== item)
                                        : [...current, item],
                                    };
                                  });
                                  if (!selected) setVerticalError(false);
                                }}
                                className={`w-full text-left text-xs px-2 py-1 rounded-md flex items-center gap-2 transition-colors ${
                                  selected
                                    ? "bg-primary/15 text-primary font-medium"
                                    : "hover:bg-accent hover:text-accent-foreground"
                                }`}
                              >
                                {selected && <Check className="h-3 w-3 shrink-0" />}
                                {!selected && <span className="w-3" />}
                                {item}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border px-3 py-2 flex justify-end">
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setShowVerticalMenu(false); }}
                      className="text-xs text-primary font-medium hover:underline"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Service Offering */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              What Are You Selling?
              <span className="ml-1 text-muted-foreground/50 font-normal">(agents use this to personalize outreach)</span>
            </label>
            <ServiceOfferingSelector
              value={campaignConfig.serviceOffering ?? ""}
              details={campaignConfig.serviceOfferingDetails ?? ""}
              onChange={(val) => setCampaignConfig((prev) => ({ ...prev, serviceOffering: val }))}
              onDetailsChange={(val) => setCampaignConfig((prev) => ({ ...prev, serviceOfferingDetails: val }))}
            />
          </div>

          {/* Agent Model Configuration */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Agent Model Configuration
              <span className="ml-1 text-muted-foreground/50 font-normal">(mix cheap + smart to cut costs)</span>
            </label>
            <AgentModelSelector
              agentModels={campaignConfig.agentModels ?? Object.fromEntries(AGENT_ROLES.map((r) => [r.key, r.recommendedModel]))}
              onChange={(models) => setCampaignConfig((prev) => ({ ...prev, agentModels: models }))}
            />
          </div>

          {/* Target States */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Target States</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCampaignConfig((prev) => ({ ...prev, states: US_STATES }))}
                  className="text-[10px] text-primary hover:underline"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setCampaignConfig((prev) => ({ ...prev, states: [] }))}
                  className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 max-h-48 overflow-y-auto rounded-md border border-border bg-muted/10 p-2">
              {US_STATES.map((state) => (
                <label key={state} className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={(campaignConfig.states ?? []).includes(state)}
                    onChange={() => {
                      setCampaignConfig((prev) => {
                        const current = prev.states ?? [];
                        return {
                          ...prev,
                          states: current.includes(state)
                            ? current.filter((s) => s !== state)
                            : [...current, state],
                        };
                      });
                    }}
                    className="rounded border-border"
                  />
                  {state}
                </label>
              ))}
            </div>
            {(campaignConfig.states ?? []).length > 0 && (
              <p className="text-[10px] text-muted-foreground">{(campaignConfig.states ?? []).length} state{(campaignConfig.states ?? []).length !== 1 ? "s" : ""} selected</p>
            )}
          </div>

          {/* Cities per State */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Largest Cities to Target</label>
            <div className="flex flex-wrap gap-2">
              {[100, 150, 200, 250, 300, 350, 400, 450, 500].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCampaignConfig((prev) => ({ ...prev, cityCount: n }))}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    campaignConfig.cityCount === n
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  Top {n}
                </button>
              ))}
            </div>
          </div>

          {/* Daily Results */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Daily Results Target</label>
            <div className="flex flex-wrap gap-2">
              {DAILY_RESULTS_TARGET_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCampaignConfig((prev) => ({ ...prev, dailyResults: n }))}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    campaignConfig.dailyResults === n
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {n.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Data to Collect */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Data to Collect</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: "name", label: "Name & Address" },
                { id: "phone", label: "Phone Number" },
                { id: "email", label: "Email Address" },
                { id: "website", label: "Website" },
                { id: "reviews", label: "Google Reviews" },
                { id: "ownerName", label: "Owner Name" },
                { id: "metaPage", label: "Facebook Page" },
                { id: "linkedin", label: "LinkedIn Profile" },
              ].map((field) => (
                <label key={field.id} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={campaignConfig.dataFields.includes(field.id)}
                    onChange={() => toggleDataField(field.id)}
                    className="rounded border-border"
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>

          {/* Outreach Channels */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Outreach Channels</label>
            {[
              {
                id: "email" as const,
                label: "Cold Email",
                maxPerAccount: 1000,
                defaultLimit: 50,
                limitOptions: [10, 25, 50, 100, 200, 500, 1000],
                accountProviders: ["gmail_smtp_accounts", "warmed_email_accounts"],
                note: "per account/day",
              },
              {
                id: "meta" as const,
                label: "Meta Messages",
                maxPerAccount: 10,
                defaultLimit: 10,
                limitOptions: [1, 3, 5, 10],
                accountProviders: ["meta_accounts"],
                note: "per account/day",
              },
              {
                id: "linkedin" as const,
                label: "LinkedIn Connections",
                maxPerAccount: 10,
                defaultLimit: 10,
                limitOptions: [1, 3, 5, 10],
                accountProviders: ["linkedin_accounts"],
                note: "per account/day",
              },
            ].map((ch) => {
              const chConfig = campaignConfig.channelConfig?.[ch.id];
              const isEnabled = campaignConfig.outreachChannels.includes(ch.id);
              const allAccounts = ch.accountProviders.flatMap(p => (availableAccounts[p] || []).map(e => ({ email: e, provider: p })));
              const selectedAccounts = chConfig?.selectedAccounts || [];
              const dailyLimit = chConfig?.dailyLimit || ch.defaultLimit;

              return (
                <div key={ch.id} className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => toggleOutreachChannel(ch.id)}
                      className="rounded border-border"
                    />
                    <span>{ch.label}</span>
                    {isEnabled && selectedAccounts.length > 0 && (
                      <span className="text-emerald-700 text-[10px]">
                        {selectedAccounts.length} account{selectedAccounts.length !== 1 ? "s" : ""} · {dailyLimit * selectedAccounts.length}/day total
                      </span>
                    )}
                    {isEnabled && allAccounts.length === 0 && (
                      <span className="text-amber-700 text-[10px]">no accounts configured — add in Settings</span>
                    )}
                  </label>

                  {isEnabled && allAccounts.length > 0 && (
                    <div className="pl-5 space-y-2">
                      {/* Account selection */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Accounts</span>
                        <div className="flex flex-wrap gap-1.5">
                          {allAccounts.map(({ email, provider }) => {
                            const isSelected = selectedAccounts.includes(email);
                            return (
                              <button
                                key={email}
                                type="button"
                                onClick={() => {
                                  setCampaignConfig(prev => {
                                    const current = prev.channelConfig?.[ch.id] || { enabled: true, dailyLimit: ch.defaultLimit, selectedAccounts: [] };
                                    const newSelected = isSelected
                                      ? current.selectedAccounts.filter(e => e !== email)
                                      : [...current.selectedAccounts, email];
                                    return {
                                      ...prev,
                                      channelConfig: {
                                        ...prev.channelConfig,
                                        [ch.id]: { ...current, selectedAccounts: newSelected },
                                      },
                                    };
                                  });
                                }}
                                className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-colors ${
                                  isSelected
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-muted/30 text-muted-foreground hover:border-primary/50"
                                }`}
                              >
                                {email}
                                {provider.includes("gmail") && <span className="ml-1 text-[9px] opacity-60">Gmail</span>}
                                {provider.includes("warmed") && <span className="ml-1 text-[9px] opacity-60">Resend</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Daily limit per account */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                          Daily Limit ({ch.note})
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {ch.limitOptions.map(n => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => {
                                setCampaignConfig(prev => {
                                  const current = prev.channelConfig?.[ch.id] || { enabled: true, dailyLimit: ch.defaultLimit, selectedAccounts: [] };
                                  return {
                                    ...prev,
                                    channelConfig: {
                                      ...prev.channelConfig,
                                      [ch.id]: { ...current, dailyLimit: n },
                                    },
                                  };
                                });
                              }}
                              className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${
                                dailyLimit === n
                                  ? "border-primary bg-primary/10 text-primary font-medium"
                                  : "border-border text-muted-foreground hover:border-primary/50"
                              }`}
                            >
                              {n.toLocaleString()}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Email Template */}
          {campaignConfig.outreachChannels.includes("email") && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Email Template (optional)
              </label>
              <textarea
                value={campaignConfig.emailTemplate ?? DEFAULT_EMAIL_TEMPLATE}
                onChange={(e) =>
                  setCampaignConfig((prev) => ({ ...prev, emailTemplate: e.target.value }))
                }
                rows={8}
                className="w-full rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-y"
              />
              <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                Available merge fields:{" "}
                <code className="bg-muted/50 px-1 rounded text-[10px]">{"{{ownerName}}"}</code>{" "}
                <code className="bg-muted/50 px-1 rounded text-[10px]">{"{{businessName}}"}</code>{" "}
                <code className="bg-muted/50 px-1 rounded text-[10px]">{"{{bestReview}}"}</code>{" "}
                <code className="bg-muted/50 px-1 rounded text-[10px]">{"{{rating}}"}</code>{" "}
                <code className="bg-muted/50 px-1 rounded text-[10px]">{"{{city}}"}</code>{" "}
                <code className="bg-muted/50 px-1 rounded text-[10px]">{"{{vertical}}"}</code>
                . The AI agent will use this as a base template, filling in merge fields and adding personal touches from real business data.
              </p>
            </div>
          )}

          {/* Social Presence */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Community & Social Presence</span>
            </div>

            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-4">
              {([
                { label: "Reddit",          dot: "bg-orange-500", find: "findRedditGroups",    join: "joinRedditGroups",    post: "postToReddit",         count: "redditPostCount",    freq: "redditPostFrequency",    findLabel: "Find relevant subreddits",             joinLabel: "Subscribe to subreddits",          postLabel: "Post content in subreddits",          counts: [1,3,5,10,20] },
                { label: "Facebook Groups", dot: "bg-blue-500",   find: "findMetaGroups",      join: "joinMetaGroups",      post: "postToMetaGroups",     count: "metaPostCount",      freq: "metaPostFrequency",      findLabel: "Find relevant Facebook groups",        joinLabel: "Request to join groups",           postLabel: "Post content in groups",              counts: [1,3,5,10,20] },
                { label: "LinkedIn Groups", dot: "bg-sky-600",    find: "findLinkedinGroups",  join: "joinLinkedinGroups",  post: "postToLinkedinGroups", count: "linkedinPostCount",  freq: "linkedinPostFrequency",  findLabel: "Find relevant LinkedIn groups",        joinLabel: "Request to join groups",           postLabel: "Post professional content in groups", counts: [1,3,5,10] },
                { label: "Nextdoor",        dot: "bg-green-600",  find: "findNextdoor",        join: "joinNextdoor",        post: "postToNextdoor",       count: "nextdoorPostCount",  freq: "nextdoorPostFrequency",  findLabel: "Find neighborhood communities",        joinLabel: "Join neighborhood communities",    postLabel: "Post content on Nextdoor",            counts: [1,3,5,10] },
                { label: "Quora",           dot: "bg-red-600",    find: "findQuora",           join: "followQuora",         post: "postToQuora",          count: "quoraPostCount",     freq: "quoraPostFrequency",     findLabel: "Find relevant questions & spaces",     joinLabel: "Follow relevant Quora spaces",     postLabel: "Answer questions on Quora",           counts: [1,3,5,10] },
                { label: "X / Twitter",     dot: "bg-zinc-400",   find: "findTwitter",         join: "followTwitter",       post: "postToTwitter",        count: "twitterPostCount",   freq: "twitterPostFrequency",   findLabel: "Find relevant conversations",          joinLabel: "Follow relevant accounts & topics", postLabel: "Post & reply on X / Twitter",         counts: [1,3,5,10,20] },
                { label: "Discord",         dot: "bg-indigo-500", find: "findDiscord",         join: "joinDiscord",         post: "postToDiscord",        count: "discordPostCount",   freq: "discordPostFrequency",   findLabel: "Find relevant Discord servers",        joinLabel: "Join relevant servers",            postLabel: "Post in Discord servers",             counts: [1,3,5,10] },
                { label: "YouTube",         dot: "bg-red-500",    find: "findYoutube",         join: "subscribeYoutube",    post: "postToYoutube",        count: "youtubePostCount",   freq: "youtubePostFrequency",   findLabel: "Find relevant videos to comment on",  joinLabel: "Subscribe to relevant channels",   postLabel: "Comment on YouTube videos",           counts: [1,3,5,10] },
              ] as const).map((p, idx) => {
                const sp = campaignConfig.socialPresence as any;
                return (
                  <div key={p.label}>
                    {idx > 0 && <div className="border-t border-border/50 mb-4" />}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${p.dot} inline-block`} />{p.label}
                      </p>
                      {[
                        { key: p.find, label: p.findLabel },
                        { key: p.join, label: p.joinLabel },
                        { key: p.post, label: p.postLabel },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input type="checkbox" checked={!!sp[key]}
                            onChange={(e) => updateSocialPresence(key as any, e.target.checked)} className="rounded border-border" />
                          {label}
                        </label>
                      ))}
                      {sp[p.post] && (
                        <div className="ml-5 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">Posts:</span>
                          {p.counts.map((n) => (
                            <button key={n} type="button" onClick={() => updateSocialPresence(p.count as any, n)}
                              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${sp[p.count] === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"}`}>{n}</button>
                          ))}
                          <span className="text-[10px] text-muted-foreground">per</span>
                          {(["daily", "weekly", "monthly"] as const).map((f) => (
                            <button key={f} type="button" onClick={() => updateSocialPresence(p.freq as any, f)}
                              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${sp[p.freq] === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"}`}>{f}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prompt preview / override */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Prompt (auto-generated — editable)</label>
              <button
                type="button"
                onClick={() => setPrompt(generateLeadGenPrompt(campaignConfig))}
                className="text-[10px] text-primary hover:underline"
              >
                Regenerate
              </button>
            </div>
            <textarea
              value={prompt || generateLeadGenPrompt(campaignConfig)}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y font-mono"
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Project Context{" "}
          <span className="text-muted-foreground/60">(optional)</span>
        </label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">No project (no context injection)</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground/60">
          Linking a project injects session history and recent messages for
          continuity.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Schedule
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setScheduleType("cron")}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
              scheduleType === "cron"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            Recurring
          </button>
          <button
            type="button"
            onClick={() => setScheduleType("once")}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
              scheduleType === "once"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            One-time
          </button>
        </div>
      </div>

      {scheduleType === "cron" ? (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Interval / Schedule
          </label>
          <select
            value={cronExpression}
            onChange={(e) => setCronExpression(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {groups.map((group) => (
              <optgroup key={group} label={group}>
                {CRON_OPTIONS.filter((o) => o.group === group).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Run At
          </label>
          <input
            type="datetime-local"
            value={runAt}
            onChange={(e) => setRunAt(e.target.value)}
            required={scheduleType === "once" && !initial}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={submitting} className="gap-2">
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {initial ? "Save Changes" : "Create Task"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── Agent Model Selector ──────────────────────────────────────────────

function AgentModelSelector({
  agentModels,
  onChange,
}: {
  agentModels: Record<string, string>;
  onChange: (models: Record<string, string>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const setModel = (key: string, modelId: string) => {
    onChange({ ...agentModels, [key]: modelId });
  };

  const resetAll = () => {
    onChange(Object.fromEntries(AGENT_ROLES.map((r) => [r.key, r.recommendedModel])));
  };

  const totalDailyCost = AGENT_ROLES.reduce((sum, role) => {
    const modelId = agentModels[role.key] ?? role.recommendedModel;
    const model = LLM_MODELS.find((m) => m.id === modelId) ?? LLM_MODELS[0];
    return sum + (role.inputTokens / 1_000_000) * model.inputPer1M + (role.outputTokens / 1_000_000) * model.outputPer1M;
  }, 0);

  return (
    <div className="space-y-2">
      {/* ChatGPT / OpenAI OAuth notice */}
      <div className="flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-2.5 py-2">
        <Key className="h-3 w-3 text-blue-700 mt-0.5 shrink-0" />
        <p className="text-[10px] text-blue-300/80 leading-relaxed">
          <span className="font-medium text-blue-300">OpenAI OAuth available</span> — GPT-4o, GPT-4o Mini, and GPT-4.1 can be used with your connected ChatGPT / OpenAI account via OAuth in Settings. API pricing applies (not the $20/mo ChatGPT Plus subscription).
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "" : "-rotate-90"}`} />
          <span>Agent models</span>
          <span className="text-muted-foreground/70">
            · Est. <span className="text-foreground font-medium">~${totalDailyCost.toFixed(2)}/day</span>
          </span>
        </button>
        {expanded && (
          <button
            type="button"
            onClick={resetAll}
            className="text-[10px] text-primary hover:underline"
          >
            Reset to recommended
          </button>
        )}
      </div>
      <div className={`space-y-1.5 ${expanded ? "" : "hidden"}`}>
        {AGENT_ROLES.map((role) => {
          const selectedId = agentModels[role.key] ?? role.recommendedModel;
          const isRecommended = selectedId === role.recommendedModel;
          const recommendedModel = LLM_MODELS.find((m) => m.id === role.recommendedModel);
          const selectedModel = LLM_MODELS.find((m) => m.id === selectedId);
          return (
            <div key={role.key} className="rounded-md border border-border bg-muted/20 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-foreground">{role.name}</span>
                    <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded">{role.role}</span>
                    {isRecommended && (
                      <span className="text-[9px] text-emerald-700 bg-emerald-500/10 px-1 py-0.5 rounded">✓ recommended</span>
                    )}
                    {selectedModel?.supportsOAuth && (
                      <span className="text-[9px] text-blue-700 bg-blue-500/10 px-1 py-0.5 rounded">OAuth</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{role.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedId}
                  onChange={(e) => setModel(role.key, e.target.value)}
                  className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-foreground focus:outline-none focus:border-primary/40"
                >
                  {LLM_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.tag}) — in:${m.inputPer1M}/M out:${m.outputPer1M}/M
                    </option>
                  ))}
                </select>
                {!isRecommended && recommendedModel && (
                  <button
                    type="button"
                    onClick={() => setModel(role.key, role.recommendedModel)}
                    className="text-[10px] text-primary hover:underline shrink-0"
                  >
                    Use {recommendedModel.label}
                  </button>
                )}
              </div>
              {!isRecommended && (
                <p className="text-[10px] text-amber-700/80">
                  Recommended: {recommendedModel?.label} — {role.recommendReason}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────

interface TestReport {
  overall: "pass" | "fail" | "warning";
  checks: Array<{ name: string; status: "pass" | "fail" | "warning"; detail: string }>;
  suggestions: string[];
  execution: { status: string; aiResponse: string | null; toolsList: string[]; error: string | null };
  task: { name: string; agentType: string; model: string };
}

function LiveActivityFeed({ organizationId, isRunning, lastRunAt }: { organizationId: string; isRunning: boolean; lastRunAt?: number }) {
  const comms = useQuery(
    api.agentCommunications.listRecentByOrganization,
    { organizationId: organizationId as Id<"organizations">, limit: 15 }
  );
  const [expanded, setExpanded] = useState(isRunning);

  // Filter to recent communications (within last hour or since last run)
  const cutoff = lastRunAt ? lastRunAt - 5000 : Date.now() - 3600000;
  const recent = (comms || []).filter((c) => c._creationTime >= cutoff);

  if (recent.length === 0 && !isRunning) return null;

  const typeIcon = (type: string) => {
    switch (type) {
      case "delegation": return "→";
      case "result": return "✓";
      case "error": return "✗";
      case "info": return "ℹ";
      default: return "•";
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "delegation": return "text-blue-700";
      case "result": return "text-emerald-700";
      case "error": return "text-red-600";
      case "info": return "text-zinc-400";
      default: return "text-muted-foreground";
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 className="h-3 w-3 animate-spin text-blue-700" />}
          <span className={isRunning ? "text-blue-700" : "text-muted-foreground"}>
            {isRunning ? "Live Activity" : "Last Run Activity"}
          </span>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
            {recent.length}
          </Badge>
        </div>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="border-t border-border max-h-64 overflow-y-auto">
          {recent.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {isRunning ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for agent activity...
                </div>
              ) : "No activity recorded"}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {recent.map((comm) => (
                <div key={comm._id} className="px-3 py-2 text-xs space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono ${typeColor(comm.messageType)}`}>
                      {typeIcon(comm.messageType)}
                    </span>
                    <span className="font-medium text-foreground">{comm.fromName}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium text-foreground">{comm.toName}</span>
                    <span className="text-muted-foreground/50 ml-auto shrink-0">
                      {formatRelativeTime(comm._creationTime)}
                    </span>
                  </div>
                  <p className="text-muted-foreground line-clamp-2 pl-5">
                    {comm.content.slice(0, 300)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  assignedAgentName,
  onPauseResume,
  onDelete,
  onRunNow,
  onEdit,
  organizationId,
  providerKeys,
}: {
  task: {
    _id: Id<"scheduledTasks">;
    name: string;
    prompt: string;
    schedule: { type: string; cronExpression?: string; runAt?: number };
    status: string;
    isRunning?: boolean;
    lastRunAt?: number;
    nextRunAt?: number;
    runCount: number;
    teamAgentId?: Id<"teamAgents">;
    projectId?: Id<"projects">;
    agentConfig?: any;
    campaignConfig?: any;
    currentPipelineStep?: number;
    pipelineSteps?: Array<{
      step: number;
      agentName: string;
      status: "pending" | "running" | "done" | "failed" | "skipped";
      startedAt?: number;
      completedAt?: number;
      result?: string;
    }>;
  };
  assignedAgentName?: string;
  onPauseResume: (
    id: Id<"scheduledTasks">,
    status: "active" | "paused"
  ) => void;
  onDelete: (id: Id<"scheduledTasks">) => void;
  onRunNow: (id: Id<"scheduledTasks">) => void;
  onEdit: (task: any) => void;
  organizationId?: string;
  providerKeys?: Record<string, any>;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testReport, setTestReport] = useState<TestReport | null>(null);

  const handleTest = async () => {
    if (!organizationId) return;
    setTesting(true);
    setTestReport(null);
    try {
      const res = await fetch("/api/scheduled-tasks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task._id, organizationId }),
      });
      const data = await res.json();
      if (data.error) {
        setTestReport({
          overall: "fail",
          checks: [{ name: "Test", status: "fail", detail: data.error }],
          suggestions: [],
          execution: { status: "fail", aiResponse: null, toolsList: [], error: data.error },
          task: { name: task.name, agentType: "", model: "" },
        });
      } else {
        setTestReport(data);
      }
    } catch (err: any) {
      setTestReport({
        overall: "fail",
        checks: [{ name: "Test", status: "fail", detail: err.message }],
        suggestions: [],
        execution: { status: "fail", aiResponse: null, toolsList: [], error: err.message },
        task: { name: task.name, agentType: "", model: "" },
      });
    } finally {
      setTesting(false);
    }
  };

  const isActive = task.status === "active";
  const isPaused = task.status === "paused";

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm truncate">{task.name}</h3>
            {task.isRunning && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {task.prompt}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <Badge
            variant="outline"
            className={`text-[10px] capitalize ${
              task.isRunning
                ? "border-blue-500/30 text-blue-700"
                : isActive
                  ? "border-green-500/30 text-green-700"
                  : isPaused
                    ? "border-yellow-500/30 text-yellow-400"
                    : "border-zinc-500/30 text-zinc-400"
            }`}
          >
            {task.isRunning ? "running" : task.status}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span>Schedule: {formatScheduleLabel(task.schedule)}</span>
        {task.lastRunAt && (
          <span>Last: {formatRelativeTime(task.lastRunAt)}</span>
        )}
        {task.nextRunAt && task.status === "active" && !task.isRunning && (
          <span className="text-primary/70">Next: {formatRelativeTime(task.nextRunAt)}</span>
        )}
        <span>Runs: {task.runCount}</span>
        {assignedAgentName && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Bot className="h-2.5 w-2.5" />
            {assignedAgentName}
          </Badge>
        )}
      </div>

      {/* Pipeline Progress */}
      {task.pipelineSteps && task.pipelineSteps.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Zap className="h-3 w-3" />
            Pipeline Progress
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {task.pipelineSteps.sort((a, b) => a.step - b.step).map((ps, i) => {
              const isLast = i === task.pipelineSteps!.length - 1;
              const icon = ps.status === "done" ? "✓" : ps.status === "running" ? "●" : ps.status === "failed" ? "✗" : ps.status === "skipped" ? "—" : "○";
              const color = ps.status === "done" ? "text-emerald-700 border-emerald-500/30 bg-emerald-500/10"
                : ps.status === "running" ? "text-blue-700 border-blue-500/30 bg-blue-500/10 animate-pulse"
                : ps.status === "failed" ? "text-red-600 border-red-500/30 bg-red-500/10"
                : ps.status === "skipped" ? "text-zinc-500 border-zinc-500/20 bg-zinc-500/5"
                : "text-zinc-500 border-border bg-muted/20";
              const shortName = ps.agentName.replace(" Agent", "").replace(" Outreach", "").replace(" Presence", "");
              const elapsed = ps.startedAt && ps.completedAt ? `${Math.round((ps.completedAt - ps.startedAt) / 1000)}s` : ps.startedAt && ps.status === "running" ? `${Math.round((Date.now() - ps.startedAt) / 1000)}s...` : null;
              return (
                <div key={ps.step} className="flex items-center gap-1 shrink-0">
                  <div className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium ${color}`} title={ps.result || ps.agentName}>
                    <span>{icon}</span>
                    <span>{shortName}</span>
                    {elapsed && <span className="text-[9px] opacity-70">({elapsed})</span>}
                  </div>
                  {!isLast && <span className="text-muted-foreground/30 text-[10px]">→</span>}
                </div>
              );
            })}
          </div>
          {/* Show result of current/last completed step */}
          {(() => {
            const active = task.pipelineSteps!.find((s) => s.status === "running");
            const lastDone = [...task.pipelineSteps!].reverse().find((s) => s.status === "done" || s.status === "failed");
            const show = active || lastDone;
            if (!show?.result) return null;
            return (
              <p className={`text-[10px] leading-relaxed line-clamp-2 ${show.status === "failed" ? "text-red-600" : "text-muted-foreground"}`}>
                {show.agentName}: {show.result}
              </p>
            );
          })()}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {/* Test */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3" />}
          {testing ? "Testing..." : "Test"}
        </Button>

        {/* Run Now */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => onRunNow(task._id)}
          disabled={task.isRunning || task.status === "completed"}
        >
          <Zap className="h-3 w-3" /> Run Now
        </Button>

        {/* Pause / Resume */}
        {(isActive || isPaused) && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() =>
              onPauseResume(task._id, isActive ? "paused" : "active")
            }
            disabled={task.isRunning}
          >
            {isActive ? (
              <>
                <Pause className="h-3 w-3" /> Pause
              </>
            ) : (
              <>
                <Play className="h-3 w-3" /> Resume
              </>
            )}
          </Button>
        )}

        {/* Edit */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => onEdit(task)}
        >
          <Pencil className="h-3 w-3" /> Edit
        </Button>

        {/* Delete */}
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-red-600 mr-1">Delete?</span>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onDelete(task._id)}
            >
              Yes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setConfirmDelete(false)}
            >
              No
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5 text-red-600 hover:text-red-300"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3 w-3" /> Delete
          </Button>
        )}

        {/* History toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5 ml-auto"
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          History
        </Button>
      </div>

      {/* Required APIs banner for home services agents */}
      {(() => {
        const agentType = task.agentConfig?.agentType;
        const requiredApis = agentType ? AGENT_REQUIRED_APIS[agentType] : null;
        if (!requiredApis) return null;
        const missing = requiredApis.filter((a) => !isProviderConnected(providerKeys, a.key));
        const missingRequired = missing.filter((a) => a.required);
        if (missing.length === 0) {
          return (
            <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                <Check className="h-3.5 w-3.5" />
                All API keys connected
              </div>
              <Link href="/settings#task-api-keys" className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 underline underline-offset-2">
                Settings <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          );
        }
        const borderColor = missingRequired.length > 0 ? "border-amber-600/30" : "border-border";
        const bgColor = missingRequired.length > 0 ? "bg-amber-50" : "bg-muted/20";
        const headerColor = missingRequired.length > 0 ? "text-amber-800" : "text-muted-foreground";
        return (
          <div className={`rounded-lg border ${borderColor} ${bgColor} px-3 py-2.5 space-y-2`}>
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${headerColor}`}>
                <AlertTriangle className="h-3.5 w-3.5" />
                {missingRequired.length > 0 ? "Missing Required API Keys" : "Optional API Keys"}
              </div>
              <Link href="/settings#task-api-keys" className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 underline underline-offset-2">
                Settings <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex flex-wrap gap-3">
              {missing.map((api) => (
                <button
                  key={api.key}
                  type="button"
                  onClick={() => window.open(api.websiteUrl, "_blank", "width=1100,height=750,resizable=yes,scrollbars=yes")}
                  className="flex flex-col items-start gap-0.5 cursor-pointer group"
                >
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-600/30 bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900 font-medium transition-all group-hover:bg-amber-200 group-hover:border-amber-600/50 group-hover:shadow-sm">
                    <Key className="h-2.5 w-2.5" />
                    {api.name}
                    {api.required && (
                      <span className="text-red-600 ml-0.5">*</span>
                    )}
                  </span>
                  <span className="text-[10px] text-amber-700 group-hover:text-amber-900 underline underline-offset-1 ml-1 transition-colors">
                    Login / Sign Up →
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-foreground/60">
              Add API keys in <span className="text-amber-800 font-medium">Settings → API Keys by Scheduled Task</span>. <span className="text-red-600">*</span> = required
            </p>
          </div>
        );
      })()}

      {/* Service offering badge */}
      {task.agentConfig?.agentType === "lead_gen_agent" && (task.campaignConfig as any)?.serviceOffering && (() => {
        const svcId = (task.campaignConfig as any).serviceOffering as string;
        const det = (task.campaignConfig as any).serviceOfferingDetails as string | undefined;
        const svc = SERVICE_OFFERINGS.find((s) => s.id === svcId);
        const label = svcId === "other" ? (det?.trim() || "Other") : (svc?.label ?? svcId);
        return (
          <div className="flex items-start gap-2 px-1">
            <Target className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span className="text-xs text-muted-foreground">
              Selling: <span className="text-foreground font-medium">{label}</span>
              {svc && det?.trim() && (
                <span className="text-muted-foreground/60"> — {det.trim()}</span>
              )}
            </span>
          </div>
        );
      })()}

      {/* Daily cost estimate for lead gen tasks */}
      {task.agentConfig?.agentType === "lead_gen_agent" && task.campaignConfig && (() => {
        const { lines, total, monthlyTotal, agentCosts, totalAgentCost } = estimateLeadGenDailyCost(task.campaignConfig as any);
        const n = (task.campaignConfig as any).dailyResults || 50;
        const grandTotal = total + totalAgentCost;
        return (
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <DollarSign className="h-3.5 w-3.5 text-emerald-700" />
              Estimated Daily Cost
              <span className="ml-auto text-emerald-700 font-bold">~${grandTotal.toFixed(2)}/day · ~${monthlyTotal.toFixed(0)}/mo</span>
            </div>

            {/* Data / outreach API costs */}
            <div className="grid grid-cols-1 gap-1">
              {lines.map((line) => (
                <div key={line.service} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    <span className="text-foreground font-medium">{line.service}</span>
                    {" — "}{line.detail}
                    {line.isFlat && <span className="text-amber-700 ml-1">(flat)</span>}
                  </span>
                  <span className={line.isFree ? "text-emerald-700" : "text-foreground"}>
                    {line.isFree ? "Free" : line.isFlat ? `$${line.dailyCost.toFixed(2)}/day` : `$${line.dailyCost.toFixed(3)}/day`}
                  </span>
                </div>
              ))}
            </div>

            {/* Per-agent model costs */}
            <div className="border-t border-border/40 pt-2 space-y-1">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide flex justify-between">
                <span>AI Agent Costs (per-agent model mix)</span>
                <span className="text-foreground">~${totalAgentCost.toFixed(2)}/day</span>
              </p>
              <div className="grid grid-cols-1 gap-0.5">
                {agentCosts.map((ac) => {
                  const role = AGENT_ROLES.find((r) => r.key === ac.key);
                  const isRecommended = ac.modelId === role?.recommendedModel;
                  return (
                    <div key={ac.key} className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground min-w-0">
                        <span className="text-foreground">{ac.name}</span>
                        <span className="text-muted-foreground/50 ml-1">·</span>
                        <span className={`ml-1 ${isRecommended ? "text-emerald-700/80" : "text-amber-700/80"}`}>{ac.modelLabel}</span>
                      </span>
                      <span className="text-muted-foreground shrink-0 ml-2">~${ac.dailyCost.toFixed(3)}/day</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Full model comparison */}
            <div className="border-t border-border/40 pt-2 space-y-1">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                If all agents used same model (reference)
              </p>
              <div className="grid grid-cols-1 gap-0.5">
                {LLM_MODELS.map((m) => {
                  const totalCost = AGENT_ROLES.reduce((sum, role) => {
                    const inputScale = role.key === "scrapingAgent" ? 1 + (n / 50) * 0.5 : 1;
                    return sum + ((role.inputTokens * inputScale) / 1_000_000) * m.inputPer1M + (role.outputTokens / 1_000_000) * m.outputPer1M;
                  }, 0);
                  const isCurrentMix = agentCosts.some((ac) => ac.modelId === m.id);
                  return (
                    <div key={m.id} className={`flex items-center justify-between text-[11px] ${isCurrentMix ? "opacity-100" : "opacity-60"}`}>
                      <span className="text-muted-foreground">
                        {m.label}
                        <span className="text-muted-foreground/50 ml-1">({m.tag})</span>
                      </span>
                      <span className="text-muted-foreground">
                        ~${(total + totalCost).toFixed(2)}/day · ~${((total + totalCost) * 30).toFixed(0)}/mo
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground border-t border-border/40 pt-1.5">
              Based on {n} businesses/day · actual costs vary by usage
            </p>
          </div>
        );
      })()}

      {showHistory && <ExecutionHistory taskId={task._id} />}

      {/* Live Activity Feed — shows when task is running or recently ran */}
      {(task.isRunning || task.lastRunAt) && organizationId && (
        <LiveActivityFeed organizationId={organizationId} isRunning={!!task.isRunning} lastRunAt={task.lastRunAt} />
      )}

      {/* Test Report */}
      {testReport && (
        <div className="rounded-lg border border-border bg-background p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold">Test Report</h4>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide ${
                testReport.overall === "pass" ? "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20" :
                testReport.overall === "warning" ? "bg-amber-500/10 text-amber-700 border border-amber-500/20" :
                "bg-red-500/10 text-red-600 border border-red-500/20"
              }`}>
                {testReport.overall}
              </span>
            </div>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setTestReport(null)}>
              <X className="h-3 w-3" />
            </Button>
          </div>

          {/* Pre-flight checks */}
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Pre-flight Checks</p>
            <div className="space-y-1">
              {testReport.checks.map((check, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="shrink-0 mt-0.5">
                    {check.status === "pass" ? "✅" : check.status === "warning" ? "⚠️" : "❌"}
                  </span>
                  <span className="font-medium min-w-[120px]">{check.name}</span>
                  <span className="text-muted-foreground">{check.detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tools detected */}
          {testReport.execution.toolsList.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Tools Detected</p>
              <div className="flex flex-wrap gap-1">
                {testReport.execution.toolsList.map((tool, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-muted text-[10px] font-mono">{tool}</span>
                ))}
              </div>
            </div>
          )}

          {/* AI Response Preview */}
          {testReport.execution.aiResponse && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">AI Response Preview</p>
              <div className="rounded-md bg-muted/50 border border-border p-3 max-h-60 overflow-y-auto">
                <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                  {testReport.execution.aiResponse}
                </pre>
              </div>
            </div>
          )}

          {/* Execution error */}
          {testReport.execution.error && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-red-600 uppercase tracking-wide">Execution Error</p>
              <p className="text-xs text-red-600 bg-red-500/10 rounded-md p-2 border border-red-500/20">
                {testReport.execution.error}
              </p>
            </div>
          )}

          {/* Suggestions */}
          {testReport.suggestions.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Suggestions</p>
              <ul className="space-y-1">
                {testReport.suggestions.map((s, i) => (
                  <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                    <span className="shrink-0">💡</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Execution History ─────────────────────────────────────────────────

function ExecutionHistory({ taskId }: { taskId: Id<"scheduledTasks"> }) {
  const history = useQuery(api.scheduledTaskRunner.getExecutionHistory, {
    taskId,
    limit: 10,
  });

  if (history === undefined) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-2">
        No executions yet
      </p>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 text-muted-foreground">
            <th className="text-left px-3 py-1.5 font-medium">Executed</th>
            <th className="text-left px-3 py-1.5 font-medium">Status</th>
            <th className="text-left px-3 py-1.5 font-medium">Duration</th>
            <th className="text-left px-3 py-1.5 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {history.map((exec) => (
            <tr key={exec._id} className="border-t border-border">
              <td className="px-3 py-1.5 text-muted-foreground">
                {new Date(exec.executedAt).toLocaleString()}
              </td>
              <td className="px-3 py-1.5">
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    exec.status === "success"
                      ? "border-green-500/30 text-green-700"
                      : "border-red-500/30 text-red-600"
                  }`}
                >
                  {exec.status === "success" ? (
                    <Check className="h-2.5 w-2.5 mr-0.5" />
                  ) : (
                    <X className="h-2.5 w-2.5 mr-0.5" />
                  )}
                  {exec.status}
                </Badge>
              </td>
              <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                {formatDuration(exec.durationMs)}
              </td>
              <td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate">
                {exec.error || exec.result?.slice(0, 80) || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
