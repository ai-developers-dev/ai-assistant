import { streamText } from "ai";
import { classifyProviderError } from "@/lib/errors/provider-errors";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getModelConfig, PROVIDER_CONFIGS } from "./models";
import type { DecryptedProviderKeys, DecryptedCredential } from "@/lib/credentials/provider-keys";

// ── Types ────────────────────────────────────────────────────────────

export interface ExecutionConfig {
  model: string;
  fallbackModels: string[];
  maxRetries: number; // per model, default 1
  credentials?: DecryptedProviderKeys;
}

interface StreamTextArgs {
  system: string;
  messages: any[];
  tools: Record<string, any>;
  maxSteps: number;
  maxTokens: number;
  temperature: number;
  toolCallStreaming: boolean;
  abortSignal?: AbortSignal;
  onChunk?: (event: any) => void;
  onStepFinish?: (event: any) => void;
  onError?: (event: any) => void;
  onFinish?: (event: any) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Resolve the best available provider for a model.
 *
 * Priority:
 * 1. Direct provider SDK (if user has a credential for the model's provider)
 * 2. OpenRouter with user's BYOK key
 * 3. OpenRouter with platform key
 */
function resolveProvider(modelId: string, credentials?: DecryptedProviderKeys): { model: any; providerLabel: string } {
  const modelConfig = getModelConfig(modelId);

  // Try direct provider SDK first
  console.log(`[routing] Resolving ${modelId}: directModelId=${modelConfig?.directModelId}, provider=${modelConfig?.provider}, hasCredentials=${!!credentials}, credentialKeys=${credentials ? Object.keys(credentials).join(",") : "none"}`);
  if (modelConfig?.directModelId && credentials) {
    const providerName = modelConfig.provider;
    const providerConfig = PROVIDER_CONFIGS[providerName];
    const credential = credentials[providerName as keyof DecryptedProviderKeys];
    console.log(`[routing] Provider ${providerName}: hasCredential=${!!credential}, hasProviderConfig=${!!providerConfig}`);

    if (credential && providerConfig) {
      if (Array.isArray(credential)) {
        // SocialAccount[] — skip direct SDK, fall through to env var or OpenRouter
      } else {
        const token = typeof credential === "string" ? credential : credential.token;

        if (token) {
          console.log(`[routing] Using direct ${providerName} SDK for ${modelId}`);
          switch (providerConfig.sdk) {
            case "anthropic": {
              const anthropic = createAnthropic({ apiKey: token });
              return { model: anthropic(modelConfig.directModelId), providerLabel: "Anthropic" };
            }
            case "openai": {
              const openai = createOpenAI({
                apiKey: token,
                ...(providerConfig.baseUrl ? { baseURL: providerConfig.baseUrl } : {}),
              });
              return { model: openai(modelConfig.directModelId), providerLabel: providerConfig.name };
            }
            case "google": {
              const google = createGoogleGenerativeAI({ apiKey: token });
              return { model: google(modelConfig.directModelId), providerLabel: "Google" };
            }
          }
        }
      }
    }
  }

  // Try env var API keys as fallback before OpenRouter.
  // Accept common variants so users don't get locked out by naming confusion
  // (e.g. the Google SDK's own convention is GOOGLE_GENERATIVE_AI_API_KEY).
  const envKeys: Record<string, { envVars: string[]; sdk: string; baseUrl?: string }> = {
    openai: { envVars: ["OPENAI_API_KEY"], sdk: "openai" },
    anthropic: { envVars: ["ANTHROPIC_API_KEY"], sdk: "anthropic" },
    google: { envVars: ["GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"], sdk: "google" },
  };

  if (modelConfig?.provider && envKeys[modelConfig.provider]) {
    const { envVars, sdk } = envKeys[modelConfig.provider];
    const envVar = envVars.find((name) => process.env[name]);
    const envKey = envVar ? process.env[envVar] : undefined;
    if (envKey && modelConfig.directModelId) {
      console.log(`[routing] Using ${envVar} env var for ${modelId}`);
      switch (sdk) {
        case "openai": {
          const openai = createOpenAI({ apiKey: envKey });
          return { model: openai(modelConfig.directModelId), providerLabel: "OpenAI" };
        }
        case "anthropic": {
          const anthropic = createAnthropic({ apiKey: envKey });
          return { model: anthropic(modelConfig.directModelId), providerLabel: "Anthropic" };
        }
        case "google": {
          const google = createGoogleGenerativeAI({ apiKey: envKey });
          return { model: google(modelConfig.directModelId), providerLabel: "Google" };
        }
      }
    }
  }

  // Fall back to OpenRouter
  const openRouterKey = credentials?.openrouter || process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) throw new Error("No API key available. Configure a provider key or OpenRouter key in Settings.");

  const openrouter = createOpenRouter({
    apiKey: openRouterKey,
    headers: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "",
      "X-Title": "Agent Platform",
    },
  });

  console.log(`[routing] Using OpenRouter for ${modelId}`);
  return { model: openrouter(modelId), providerLabel: "OpenRouter" };
}

function isRetryableError(error: unknown, providerLabel: string): boolean {
  const classified = classifyProviderError(error, providerLabel);
  return classified.retryable;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main Execution Function ──────────────────────────────────────────

/**
 * Execute streamText with automatic retry and model failover.
 *
 * Strategy:
 * 1. Try primary model via direct provider (if credential available)
 * 2. Primary model via OpenRouter (fallback)
 * 3. Each fallback model via direct/OpenRouter
 * 4. Throw if all models exhausted
 */
export async function executeWithResilience(
  config: ExecutionConfig,
  args: StreamTextArgs
): Promise<ReturnType<typeof streamText>> {
  const modelsToTry = [config.model, ...config.fallbackModels];

  let lastError: unknown;
  let failoverUsed: string | undefined;

  for (const modelId of modelsToTry) {
    const { model: provider, providerLabel } = resolveProvider(modelId, config.credentials);

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const result = streamText({
          model: provider,
          ...args,
          // Wrap onFinish to inject failover metadata
          onFinish: failoverUsed
            ? (event: any) => {
                console.log(
                  `[resilience] Succeeded with fallback model: ${modelId} (original: ${config.model})`
                );
                args.onFinish?.(event);
              }
            : args.onFinish,
        });

        // The streamText call itself doesn't throw on model errors —
        // errors surface during streaming. We return the result and let
        // the caller's error handling deal with mid-stream failures.
        // For pre-flight errors (bad key, model not found), streamText
        // will throw synchronously or on first chunk access.
        return result;
      } catch (error: unknown) {
        lastError = error;

        const isRetryable = isRetryableError(error, providerLabel);
        const isLastAttempt = attempt === config.maxRetries;

        console.warn(
          `[resilience] ${providerLabel} model ${modelId} attempt ${attempt + 1}/${config.maxRetries + 1} failed:`,
          (error as any)?.message || error,
          isRetryable ? "(retryable)" : "(not retryable)"
        );

        // Don't retry non-retryable errors — move to next model
        if (!isRetryable) break;

        // Retry with exponential backoff
        if (!isLastAttempt) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
          await sleep(backoffMs);
        }
      }
    }

    // Mark that we're now trying a fallback
    failoverUsed = modelId;
  }

  // All models exhausted
  throw lastError || new Error("All models failed");
}
