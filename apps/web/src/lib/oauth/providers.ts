export interface OAuthProviderConfig {
  name: string;
  clientId: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
  codeChallengeMethod: "S256";
  tokenContentType: "application/x-www-form-urlencoded" | "application/json";
  accessTokenTtl: number; // seconds
  accessTokenPrefix?: string;
  refreshTokenPrefix?: string;
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  anthropic: {
    name: "Claude (Anthropic)",
    clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    authUrl: "https://claude.ai/oauth/authorize",
    tokenUrl: "https://console.anthropic.com/v1/oauth/token",
    redirectUri: "https://console.anthropic.com/oauth/code/callback",
    scopes: ["user:inference", "user:profile"],
    codeChallengeMethod: "S256",
    tokenContentType: "application/x-www-form-urlencoded",
    accessTokenTtl: 28800, // 8 hours
    accessTokenPrefix: "sk-ant-oat01-",
    refreshTokenPrefix: "sk-ant-ort01-",
  },
  openai: {
    name: "OpenAI (Codex)",
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    authUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    redirectUri: "http://localhost:1455/auth/callback",
    scopes: ["openid", "profile", "email", "offline_access"],
    codeChallengeMethod: "S256",
    tokenContentType: "application/json",
    accessTokenTtl: 3600, // 1 hour
  },
};

export type OAuthProviderId = keyof typeof OAUTH_PROVIDERS;
