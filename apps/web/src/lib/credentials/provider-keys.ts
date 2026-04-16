import { decrypt } from "./crypto";

// ── Types ──

export type ProviderAuthType = "oauth" | "api_key";

export interface OAuthCredentialStored {
  type: "oauth";
  encryptedAccessToken: string;
  encryptedRefreshToken?: string;
  expiresAt: number;
  configuredAt: number;
}

export interface ApiKeyCredentialStored {
  type: "api_key";
  encryptedApiKey: string;
  configuredAt: number;
}

export type ProviderCredentialStored = OAuthCredentialStored | ApiKeyCredentialStored;

export interface DecryptedOAuthCredential {
  token: string;
  type: "oauth";
  expiresAt: number;
  refreshToken?: string;
}

export interface DecryptedApiKeyCredential {
  token: string;
  type: "api_key";
}

export type DecryptedCredential = DecryptedOAuthCredential | DecryptedApiKeyCredential;

export interface SocialAccount {
  email: string;
  password: string;
  configuredAt: number;
}

export interface DecryptedProviderKeys {
  openrouter?: string;
  anthropic?: DecryptedCredential;
  openai?: DecryptedCredential;
  moonshot?: DecryptedApiKeyCredential;
  google?: DecryptedApiKeyCredential;
  google_custom_search?: DecryptedApiKeyCredential;
  google_search_engine_id?: DecryptedApiKeyCredential;
  meta?: DecryptedApiKeyCredential;
  linkedin?: DecryptedApiKeyCredential;
  warmed_email?: DecryptedApiKeyCredential;
  gmail_smtp?: DecryptedApiKeyCredential;
  firecrawl?: DecryptedApiKeyCredential;
  outscraper?: DecryptedApiKeyCredential;
  hunter?: DecryptedApiKeyCredential;
  apollo?: DecryptedApiKeyCredential;
  reddit?: DecryptedApiKeyCredential;
  youtube_oauth?: DecryptedCredential;
  twitter?: DecryptedCredential;
  discord_webhooks?: DecryptedApiKeyCredential;
  meta_accounts?: SocialAccount[];
  linkedin_accounts?: SocialAccount[];
  gmail_smtp_accounts?: SocialAccount[];
  warmed_email_accounts?: SocialAccount[];
}

// ── Provider key format validation ──

export const KEY_PREFIXES: Record<string, string[]> = {
  anthropic: ["sk-ant-"],
  openai: ["sk-"],
  moonshot: ["sk-"],
  google: ["AIza"],
  openrouter: ["sk-or-"],
};

export function validateKeyFormat(provider: string, key: string): boolean {
  const prefixes = KEY_PREFIXES[provider];
  if (!prefixes) return true; // Unknown provider, skip validation
  return prefixes.some((prefix) => key.startsWith(prefix));
}

// ── Decryption ──

/**
 * Decrypt all provider keys from their stored (encrypted) form.
 * Returns only providers that have valid credentials.
 */
export function decryptProviderKeys(
  providerKeys: Record<string, any> | undefined,
  orgId: string
): DecryptedProviderKeys {
  if (!providerKeys) return {};

  const result: DecryptedProviderKeys = {};

  // Legacy OpenRouter key (stored as plaintext string)
  if (typeof providerKeys.openrouter === "string" && providerKeys.openrouter) {
    result.openrouter = providerKeys.openrouter;
  }

  // Typed providers
  const typedProviders = [
    "anthropic", "openai", "moonshot", "google",
    "google_custom_search", "google_search_engine_id", "meta", "linkedin", "warmed_email", "gmail_smtp", "firecrawl",
    "outscraper", "hunter", "apollo", "reddit", "youtube_oauth", "twitter", "discord_webhooks",
  ] as const;

  for (const provider of typedProviders) {
    const data = providerKeys[provider];
    if (!data || typeof data !== "object") continue;

    try {
      if (data.type === "oauth" && data.encryptedAccessToken) {
        const token = decrypt(data.encryptedAccessToken, orgId);
        const credential: DecryptedOAuthCredential = {
          token,
          type: "oauth",
          expiresAt: data.expiresAt,
        };
        if (data.encryptedRefreshToken) {
          credential.refreshToken = decrypt(data.encryptedRefreshToken, orgId);
        }
        result[provider] = credential as any;
      } else if (data.type === "api_key" && data.encryptedApiKey) {
        const token = decrypt(data.encryptedApiKey, orgId);
        result[provider] = { token, type: "api_key" } as any;
      }
    } catch (err) {
      console.error(`[provider-keys] Failed to decrypt ${provider} credentials:`, err);
      // Skip this provider — corrupted or wrong key
    }
  }

  // Handle multi-account arrays for meta and linkedin
  for (const provider of ["meta_accounts", "linkedin_accounts", "gmail_smtp_accounts", "warmed_email_accounts"] as const) {
    const arr = providerKeys[provider];
    if (Array.isArray(arr) && arr.length > 0) {
      const accounts: SocialAccount[] = [];
      for (const item of arr) {
        if (item?.type === "api_key" && item?.encryptedApiKey) {
          try {
            const token = decrypt(item.encryptedApiKey, orgId);
            const [email, password] = token.split("|");
            if (email && password) {
              accounts.push({ email, password, configuredAt: item.configuredAt || 0 });
            }
          } catch {
            // skip corrupted entry
          }
        }
      }
      if (accounts.length > 0) result[provider] = accounts;
    }
  }

  return result;
}

/**
 * Check if an OAuth token is expired (with 5-minute buffer).
 */
export function isTokenExpired(credential: DecryptedCredential): boolean {
  if (credential.type !== "oauth") return false;
  return Date.now() >= credential.expiresAt - 5 * 60 * 1000;
}

/**
 * Get connection status for all providers from stored keys.
 */
export function getProviderStatuses(
  providerKeys: Record<string, any> | undefined
): Array<{ provider: string; connected: boolean; type: ProviderAuthType | null; portalUrl?: string }> {
  const allProviders = [
    "anthropic", "openai", "moonshot", "google", "openrouter",
    "google_custom_search", "google_search_engine_id", "meta", "linkedin", "warmed_email", "gmail_smtp", "firecrawl",
    "outscraper", "hunter", "apollo", "reddit", "youtube_oauth", "twitter", "discord_webhooks",
    "meta_accounts", "linkedin_accounts", "gmail_smtp_accounts", "warmed_email_accounts",
  ];

  return allProviders.map((provider) => {
    if (!providerKeys) {
      return { provider, connected: false, type: null };
    }

    const data = providerKeys[provider];

    // Legacy OpenRouter string
    if (provider === "openrouter") {
      return {
        provider,
        connected: typeof data === "string" && data.length > 0,
        type: data ? ("api_key" as const) : null,
      };
    }

    // Array-based multi-account providers
    if (Array.isArray(data)) {
      return { provider, connected: data.length > 0, type: data.length > 0 ? ("api_key" as const) : null };
    }

    if (!data || typeof data !== "object") {
      return { provider, connected: false, type: null };
    }

    return {
      provider,
      connected: true,
      type: data.type as ProviderAuthType,
      portalUrl: typeof data.portalUrl === "string" ? data.portalUrl : undefined,
    };
  });
}
