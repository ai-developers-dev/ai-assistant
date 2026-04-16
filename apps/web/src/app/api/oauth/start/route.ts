import { NextResponse } from "next/server";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "@/lib/oauth/pkce";
import { OAUTH_PROVIDERS, type OAuthProviderId } from "@/lib/oauth/providers";
import { startCallbackServer } from "@/lib/oauth/callback-server";

// In-memory store for PKCE verifiers, keyed by state.
// TTL: 10 minutes. In production, use Redis or encrypted session cookies.
const pendingAuth = new Map<string, { verifier: string; provider: string; createdAt: number }>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pendingAuth) {
    if (now - value.createdAt > 10 * 60 * 1000) {
      pendingAuth.delete(key);
    }
  }
}, 5 * 60 * 1000);

export { pendingAuth };

export async function POST(req: Request) {
  try {
    const { provider } = await req.json();

    if (!provider || !(provider in OAUTH_PROVIDERS)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${Object.keys(OAUTH_PROVIDERS).join(", ")}` },
        { status: 400 }
      );
    }

    const config = OAUTH_PROVIDERS[provider as OAuthProviderId];
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const state = generateState();

    // Store verifier for later exchange
    pendingAuth.set(state, { verifier, provider, createdAt: Date.now() });

    // Start local callback server for providers that redirect to localhost:1455
    if (config.redirectUri.includes("localhost:1455")) {
      startCallbackServer().catch(() => {}); // Fire and forget — server catches the code
    }

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: config.scopes.join(" "),
      code_challenge: challenge,
      code_challenge_method: config.codeChallengeMethod,
      state,
    });

    const authUrl = `${config.authUrl}?${params.toString()}`;

    return NextResponse.json({ authUrl, state });
  } catch (error: any) {
    console.error("[oauth/start] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to initiate OAuth flow" },
      { status: 500 }
    );
  }
}
