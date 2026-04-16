import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { OAUTH_PROVIDERS, type OAuthProviderId } from "@/lib/oauth/providers";
import { encrypt } from "@/lib/credentials/crypto";
import { pendingAuth } from "../start/route";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const { provider, code, state, organizationId } = await req.json();

    if (!provider || !code || !state || !organizationId) {
      return NextResponse.json(
        { error: "Missing required fields: provider, code, state, organizationId" },
        { status: 400 }
      );
    }

    // Retrieve and validate the stored PKCE verifier
    const pending = pendingAuth.get(state);
    if (!pending) {
      return NextResponse.json(
        { error: "Invalid or expired state parameter. Please try the OAuth flow again." },
        { status: 400 }
      );
    }

    if (pending.provider !== provider) {
      return NextResponse.json(
        { error: "State parameter does not match the provider." },
        { status: 400 }
      );
    }

    // Clean up the pending entry
    pendingAuth.delete(state);

    const config = OAUTH_PROVIDERS[provider as OAuthProviderId];

    // Exchange authorization code for tokens
    const tokenBody: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      code_verifier: pending.verifier,
      redirect_uri: config.redirectUri,
    };

    const tokenRes = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": config.tokenContentType,
      },
      body: config.tokenContentType === "application/x-www-form-urlencoded"
        ? new URLSearchParams(tokenBody).toString()
        : JSON.stringify(tokenBody),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error(`[oauth/exchange] Token exchange failed for ${provider}:`, errorText);
      return NextResponse.json(
        { error: `Token exchange failed: ${tokenRes.status}. The authorization code may have expired.` },
        { status: 400 }
      );
    }

    const tokenData = await tokenRes.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    if (!access_token) {
      return NextResponse.json(
        { error: "No access token received from provider." },
        { status: 400 }
      );
    }

    // Encrypt tokens
    const encryptedAccessToken = encrypt(access_token, organizationId);
    const encryptedRefreshToken = refresh_token
      ? encrypt(refresh_token, organizationId)
      : undefined;

    // Fetch current provider keys and merge
    const org = await convex.query(api.organizations.getById, {
      id: organizationId as Id<"organizations">,
    });

    const existingKeys = (org?.providerKeys as Record<string, any>) || {};
    const updatedKeys = {
      ...existingKeys,
      [provider]: {
        type: "oauth" as const,
        encryptedAccessToken,
        encryptedRefreshToken,
        expiresAt: Date.now() + (expires_in || config.accessTokenTtl) * 1000,
        configuredAt: Date.now(),
      },
    };

    await convex.mutation(api.organizations.updateProviderKeys, {
      organizationId: organizationId as Id<"organizations">,
      providerKeys: updatedKeys,
    });

    return NextResponse.json({
      success: true,
      provider,
      type: "oauth",
    });
  } catch (error: any) {
    console.error("[oauth/exchange] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to exchange authorization code" },
      { status: 500 }
    );
  }
}
