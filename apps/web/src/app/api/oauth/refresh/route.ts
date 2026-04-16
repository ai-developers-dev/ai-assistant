import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { OAUTH_PROVIDERS, type OAuthProviderId } from "@/lib/oauth/providers";
import { encrypt, decrypt } from "@/lib/credentials/crypto";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const { provider, organizationId } = await req.json();

    if (!provider || !organizationId) {
      return NextResponse.json(
        { error: "Missing required fields: provider, organizationId" },
        { status: 400 }
      );
    }

    if (!(provider in OAUTH_PROVIDERS)) {
      return NextResponse.json(
        { error: `Provider "${provider}" does not support OAuth.` },
        { status: 400 }
      );
    }

    const config = OAUTH_PROVIDERS[provider as OAuthProviderId];

    // Fetch current credentials
    const org = await convex.query(api.organizations.getById, {
      id: organizationId as Id<"organizations">,
    });

    const providerKeys = (org?.providerKeys as Record<string, any>) || {};
    const providerData = providerKeys[provider];

    if (!providerData || providerData.type !== "oauth" || !providerData.encryptedRefreshToken) {
      return NextResponse.json(
        { error: "No OAuth refresh token found for this provider." },
        { status: 400 }
      );
    }

    // Decrypt the refresh token
    const refreshToken = decrypt(providerData.encryptedRefreshToken, organizationId);

    // Call the provider's token endpoint with refresh_token grant
    const tokenBody: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
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
      console.error(`[oauth/refresh] Refresh failed for ${provider}:`, errorText);

      // If refresh token is revoked, clear the credentials
      if (tokenRes.status === 401 || tokenRes.status === 403) {
        const updatedKeys = { ...providerKeys };
        delete updatedKeys[provider];
        await convex.mutation(api.organizations.updateProviderKeys, {
          organizationId: organizationId as Id<"organizations">,
          providerKeys: updatedKeys,
        });
      }

      return NextResponse.json(
        { error: `Token refresh failed. You may need to reconnect your ${config.name} account.` },
        { status: 401 }
      );
    }

    const tokenData = await tokenRes.json();

    // Update stored tokens
    const encryptedAccessToken = encrypt(tokenData.access_token, organizationId);
    const encryptedRefreshToken = tokenData.refresh_token
      ? encrypt(tokenData.refresh_token, organizationId)
      : providerData.encryptedRefreshToken; // Keep existing if not rotated

    const updatedKeys = {
      ...providerKeys,
      [provider]: {
        ...providerData,
        encryptedAccessToken,
        encryptedRefreshToken,
        expiresAt: Date.now() + (tokenData.expires_in || config.accessTokenTtl) * 1000,
      },
    };

    await convex.mutation(api.organizations.updateProviderKeys, {
      organizationId: organizationId as Id<"organizations">,
      providerKeys: updatedKeys,
    });

    return NextResponse.json({
      success: true,
      provider,
      expiresAt: (updatedKeys as Record<string, any>)[provider]?.expiresAt,
    });
  } catch (error: any) {
    console.error("[oauth/refresh] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to refresh token" },
      { status: 500 }
    );
  }
}
