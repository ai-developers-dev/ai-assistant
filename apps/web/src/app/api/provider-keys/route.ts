import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { encrypt } from "@/lib/credentials/crypto";
import { validateKeyFormat, getProviderStatuses } from "@/lib/credentials/provider-keys";
import type { Id } from "../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET — Returns connection status per provider.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json({ error: "Missing organizationId" }, { status: 400 });
    }

    const org = await convex.query(api.organizations.getById, {
      id: organizationId as Id<"organizations">,
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const statuses = getProviderStatuses(org.providerKeys as Record<string, any>);

    return NextResponse.json({ providers: statuses });
  } catch (error: any) {
    console.error("[provider-keys] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST — Encrypt and save an API key for a provider.
 */
export async function POST(req: Request) {
  try {
    const { provider, apiKey, organizationId } = await req.json();

    if (!provider || !apiKey || !organizationId) {
      return NextResponse.json(
        { error: "Missing required fields: provider, apiKey, organizationId" },
        { status: 400 }
      );
    }

    // Validate key format
    if (!validateKeyFormat(provider, apiKey)) {
      return NextResponse.json(
        { error: `Invalid key format for ${provider}. Check that you copied the full key.` },
        { status: 400 }
      );
    }

    // Special case: OpenRouter is stored as a plaintext string (backward compat)
    if (provider === "openrouter") {
      const org = await convex.query(api.organizations.getById, {
        id: organizationId as Id<"organizations">,
      });
      const existingKeys = (org?.providerKeys as Record<string, any>) || {};
      await convex.mutation(api.organizations.updateProviderKeys, {
        organizationId: organizationId as Id<"organizations">,
        providerKeys: { ...existingKeys, openrouter: apiKey },
      });
      return NextResponse.json({ success: true, provider, type: "api_key" });
    }

    // Encrypt the API key
    const encryptedApiKey = encrypt(apiKey, organizationId);

    // Fetch current keys and merge
    const org = await convex.query(api.organizations.getById, {
      id: organizationId as Id<"organizations">,
    });
    const existingKeys = (org?.providerKeys as Record<string, any>) || {};

    const providerEntry: Record<string, any> = {
      type: "api_key" as const,
      encryptedApiKey,
      configuredAt: Date.now(),
    };

    const updatedKeys = {
      ...existingKeys,
      [provider]: providerEntry,
    };

    await convex.mutation(api.organizations.updateProviderKeys, {
      organizationId: organizationId as Id<"organizations">,
      providerKeys: updatedKeys,
    });

    return NextResponse.json({ success: true, provider, type: "api_key" });
  } catch (error: any) {
    console.error("[provider-keys] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE — Remove a provider's credentials.
 */
export async function DELETE(req: Request) {
  try {
    const { provider, organizationId } = await req.json();

    if (!provider || !organizationId) {
      return NextResponse.json(
        { error: "Missing required fields: provider, organizationId" },
        { status: 400 }
      );
    }

    const org = await convex.query(api.organizations.getById, {
      id: organizationId as Id<"organizations">,
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const existingKeys = (org.providerKeys as Record<string, any>) || {};
    const updatedKeys = { ...existingKeys };

    if (provider === "openrouter") {
      updatedKeys.openrouter = undefined;
    } else {
      delete updatedKeys[provider];
    }

    await convex.mutation(api.organizations.updateProviderKeys, {
      organizationId: organizationId as Id<"organizations">,
      providerKeys: updatedKeys,
    });

    return NextResponse.json({ success: true, provider });
  } catch (error: any) {
    console.error("[provider-keys] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
