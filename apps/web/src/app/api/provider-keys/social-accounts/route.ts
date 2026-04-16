import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { encrypt } from "@/lib/credentials/crypto";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * POST — Add a social account (email + password) to meta_accounts or linkedin_accounts array.
 * Body: { provider: "meta_accounts" | "linkedin_accounts", email, password, organizationId }
 */
export async function POST(req: Request) {
  try {
    const { provider, email, password, organizationId } = await req.json();

    if (!provider || !email || !password || !organizationId) {
      return NextResponse.json(
        { error: "Missing required fields: provider, email, password, organizationId" },
        { status: 400 }
      );
    }

    const ALLOWED_PROVIDERS = ["meta_accounts", "linkedin_accounts", "gmail_smtp_accounts", "warmed_email_accounts"];
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: `provider must be one of: ${ALLOWED_PROVIDERS.join(", ")}` }, { status: 400 });
    }

    // Enforce account limits per provider type
    const ACCOUNT_LIMITS: Record<string, number> = {
      gmail_smtp_accounts: 20,
      warmed_email_accounts: 20,
      meta_accounts: 5,
      linkedin_accounts: 5,
    };
    const maxAccounts = ACCOUNT_LIMITS[provider];
    if (maxAccounts) {
      const orgCheck = await convex.query(api.organizations.getById, { id: organizationId as Id<"organizations"> });
      const existingKeys = (orgCheck?.providerKeys as Record<string, any>) || {};
      const existing: any[] = Array.isArray(existingKeys[provider]) ? existingKeys[provider] : [];
      if (existing.length >= maxAccounts) {
        return NextResponse.json({ error: `Maximum ${maxAccounts} accounts for ${provider.replace("_accounts", "")}` }, { status: 400 });
      }
    }

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const combined = `${email.trim()}|${password}`;
    const encryptedApiKey = encrypt(combined, organizationId);

    const org = await convex.query(api.organizations.getById, {
      id: organizationId as Id<"organizations">,
    });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const existingKeys = (org.providerKeys as Record<string, any>) || {};
    const existingAccounts: any[] = Array.isArray(existingKeys[provider]) ? existingKeys[provider] : [];

    // Prevent duplicate email
    const isDuplicate = existingAccounts.some((a: any) => {
      if (a?.type === "api_key" && a?.encryptedApiKey) {
        // We can't decrypt here easily, so check by storing email in plaintext alongside
        return a.email === email.trim();
      }
      return false;
    });
    if (isDuplicate) {
      return NextResponse.json({ error: "This email is already added" }, { status: 409 });
    }

    const newAccount = {
      type: "api_key" as const,
      encryptedApiKey,
      email: email.trim(), // store plaintext email for display/dedup (password stays encrypted)
      configuredAt: Date.now(),
    };

    const updatedKeys = {
      ...existingKeys,
      [provider]: [...existingAccounts, newAccount],
    };

    await convex.mutation(api.organizations.updateProviderKeys, {
      organizationId: organizationId as Id<"organizations">,
      providerKeys: updatedKeys,
    });

    return NextResponse.json({ success: true, provider, email: email.trim() });
  } catch (error: any) {
    console.error("[social-accounts] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE — Remove a specific account by email from the array.
 * Body: { provider: "meta_accounts" | "linkedin_accounts", email, organizationId }
 */
export async function DELETE(req: Request) {
  try {
    const { provider, email, organizationId } = await req.json();

    if (!provider || !email || !organizationId) {
      return NextResponse.json(
        { error: "Missing required fields: provider, email, organizationId" },
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
    const existingAccounts: any[] = Array.isArray(existingKeys[provider]) ? existingKeys[provider] : [];

    const updatedAccounts = existingAccounts.filter((a: any) => a.email !== email);

    const updatedKeys = {
      ...existingKeys,
      [provider]: updatedAccounts,
    };

    await convex.mutation(api.organizations.updateProviderKeys, {
      organizationId: organizationId as Id<"organizations">,
      providerKeys: updatedKeys,
    });

    return NextResponse.json({ success: true, provider, email });
  } catch (error: any) {
    console.error("[social-accounts] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET — Return the list of accounts (emails only, no passwords) for a provider.
 * Query: ?provider=meta_accounts&organizationId=...
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider");
    const organizationId = searchParams.get("organizationId");

    if (!provider || !organizationId) {
      return NextResponse.json({ error: "Missing provider or organizationId" }, { status: 400 });
    }

    const org = await convex.query(api.organizations.getById, {
      id: organizationId as Id<"organizations">,
    });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const keys = (org.providerKeys as Record<string, any>) || {};
    const accounts: any[] = Array.isArray(keys[provider]) ? keys[provider] : [];

    return NextResponse.json({
      accounts: accounts.map((a: any) => ({
        email: a.email,
        configuredAt: a.configuredAt,
      })),
    });
  } catch (error: any) {
    console.error("[social-accounts] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
