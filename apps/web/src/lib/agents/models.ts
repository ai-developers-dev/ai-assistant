export type ProviderId = "anthropic" | "openai" | "google" | "deepseek" | "meta" | "mistral" | "moonshot";

export interface ModelConfig {
  id: string; // OpenRouter model ID
  name: string;
  provider: ProviderId;
  directModelId?: string; // Model ID for direct provider SDK calls (undefined = OpenRouter only)
  tier: "free" | "starter" | "pro" | "byok";
  costPerRequest: number; // Estimated cost in USD (for internal tracking)
  maxOutputTokens: number;
  contextWindow: number;
  strengths: string[]; // For smart defaults per agent type
  fallbackChain: string[]; // Ordered list of fallback model IDs for resilience
}

// Provider configs for direct API access
export interface ProviderConfig {
  name: string;
  supportsOAuth: boolean;
  keyPrefix: string[];
  docsUrl: string;
  sdk: "anthropic" | "openai" | "google"; // Which @ai-sdk package to use
  baseUrl?: string; // Custom base URL (for OpenAI-compatible APIs like Moonshot)
}

export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  anthropic: {
    name: "Anthropic",
    supportsOAuth: false,
    keyPrefix: ["sk-ant-"],
    docsUrl: "https://console.anthropic.com/settings/keys",
    sdk: "anthropic",
  },
  openai: {
    name: "OpenAI",
    supportsOAuth: false,
    keyPrefix: ["sk-"],
    docsUrl: "https://platform.openai.com/api-keys",
    sdk: "openai",
  },
  moonshot: {
    name: "Moonshot/Kimi",
    supportsOAuth: false,
    keyPrefix: ["sk-"],
    docsUrl: "https://platform.moonshot.cn/console/api-keys",
    sdk: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
  },
  google: {
    name: "Google",
    supportsOAuth: false,
    keyPrefix: ["AIza"],
    docsUrl: "https://aistudio.google.com/app/apikey",
    sdk: "google",
  },
};

// Models with direct provider mapping for SDK routing
export const MODELS: ModelConfig[] = [
  // === FREE TIER (included in all plans) ===
  {
    id: "google/gemini-2.5-flash-lite",
    name: "Gemini Flash Lite",
    provider: "google",
    directModelId: "gemini-2.5-flash-lite",
    tier: "free",
    costPerRequest: 0.01,
    maxOutputTokens: 8192,
    contextWindow: 1_048_576,
    strengths: ["chat", "analysis"],
    fallbackChain: ["openai/gpt-4o-mini", "deepseek/deepseek-chat-v3-0324"],
  },
  {
    id: "deepseek/deepseek-chat-v3-0324",
    name: "DeepSeek V3",
    provider: "deepseek",
    // No directModelId — OpenRouter only
    tier: "free",
    costPerRequest: 0.02,
    maxOutputTokens: 8192,
    contextWindow: 163_840,
    strengths: ["code", "chat", "analysis"],
    fallbackChain: ["openai/gpt-4o-mini", "google/gemini-2.5-flash-lite"],
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    directModelId: "gpt-4o-mini-2024-07-18",
    tier: "free",
    costPerRequest: 0.015,
    maxOutputTokens: 16384,
    contextWindow: 128_000,
    strengths: ["chat", "writing"],
    fallbackChain: ["deepseek/deepseek-chat-v3-0324", "google/gemini-2.5-flash-lite"],
  },

  // === STARTER TIER ($20/mo) ===
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    directModelId: "gemini-2.5-flash",
    tier: "starter",
    costPerRequest: 0.05,
    maxOutputTokens: 32768,
    contextWindow: 1_048_576,
    strengths: ["code", "writing", "analysis", "websites"],
    fallbackChain: ["openai/gpt-4o", "anthropic/claude-haiku-4.5"],
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    directModelId: "claude-haiku-4-5-20241022",
    tier: "starter",
    costPerRequest: 0.08,
    maxOutputTokens: 16384,
    contextWindow: 200_000,
    strengths: ["code", "writing", "websites"],
    fallbackChain: ["openai/gpt-4o", "google/gemini-2.5-flash"],
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    directModelId: "gpt-4o-2024-08-06",
    tier: "starter",
    costPerRequest: 0.06,
    maxOutputTokens: 16384,
    contextWindow: 128_000,
    strengths: ["code", "chat", "writing", "analysis"],
    fallbackChain: ["google/gemini-2.5-flash", "anthropic/claude-haiku-4.5"],
  },
  {
    id: "mistralai/mistral-medium-3",
    name: "Mistral Medium 3",
    provider: "mistral",
    // No directModelId — OpenRouter only
    tier: "starter",
    costPerRequest: 0.04,
    maxOutputTokens: 8192,
    contextWindow: 131_072,
    strengths: ["code", "chat", "writing"],
    fallbackChain: ["openai/gpt-4o", "google/gemini-2.5-flash"],
  },

  // === PRO TIER ($50/mo) ===
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    directModelId: "claude-sonnet-4-20250514",
    tier: "pro",
    costPerRequest: 0.12,
    maxOutputTokens: 32768,
    contextWindow: 200_000,
    strengths: ["code", "writing", "analysis", "websites", "reasoning"],
    fallbackChain: ["openai/gpt-4o", "google/gemini-2.5-flash"],
  },
  {
    id: "anthropic/claude-opus-4",
    name: "Claude Opus 4",
    provider: "anthropic",
    directModelId: "claude-opus-4-20250514",
    tier: "pro",
    costPerRequest: 0.25,
    maxOutputTokens: 32768,
    contextWindow: 200_000,
    strengths: ["code", "writing", "analysis", "websites", "reasoning"],
    fallbackChain: ["anthropic/claude-sonnet-4", "openai/gpt-4.1"],
  },
  {
    id: "openai/gpt-4.1",
    name: "GPT-4.1",
    provider: "openai",
    directModelId: "gpt-4.1-2025-04-14",
    tier: "pro",
    costPerRequest: 0.15,
    maxOutputTokens: 32768,
    contextWindow: 1_047_576,
    strengths: ["code", "writing", "analysis", "reasoning"],
    fallbackChain: ["anthropic/claude-sonnet-4", "google/gemini-2.5-flash"],
  },
  {
    id: "deepseek/deepseek-r1",
    name: "DeepSeek R1",
    provider: "deepseek",
    // No directModelId — OpenRouter only
    tier: "pro",
    costPerRequest: 0.1,
    maxOutputTokens: 8192,
    contextWindow: 163_840,
    strengths: ["code", "analysis", "reasoning"],
    fallbackChain: ["openai/gpt-4o", "google/gemini-2.5-flash"],
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    provider: "meta",
    // No directModelId — OpenRouter only
    tier: "pro",
    costPerRequest: 0.04,
    maxOutputTokens: 8192,
    contextWindow: 131_072,
    strengths: ["code", "chat"],
    fallbackChain: ["deepseek/deepseek-chat-v3-0324", "openai/gpt-4o-mini"],
  },
];

export const DEFAULT_MODEL = "google/gemini-2.5-flash";

// Tier hierarchy for access checks
const TIER_ACCESS: Record<string, string[]> = {
  free: ["free"],
  starter: ["free", "starter"],
  pro: ["free", "starter", "pro"],
  enterprise: ["free", "starter", "pro"],
};

export function getModelConfig(modelId: string): ModelConfig | undefined {
  return MODELS.find((m) => m.id === modelId);
}

export function getModelsForPlan(plan: string): ModelConfig[] {
  const allowedTiers = TIER_ACCESS[plan] || TIER_ACCESS.free;
  return MODELS.filter((m) => allowedTiers.includes(m.tier));
}

export function getDefaultModelForPlan(plan: string): string {
  const available = getModelsForPlan(plan);
  // Pick best available model (highest cost = best quality)
  if (available.length > 0) {
    return available.sort((a, b) => b.costPerRequest - a.costPerRequest)[0].id;
  }
  return DEFAULT_MODEL;
}
