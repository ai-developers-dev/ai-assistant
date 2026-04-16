import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { decryptProviderKeys, isTokenExpired } from "@/lib/credentials/provider-keys";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * POST — Test if a provider's API key or OAuth token is valid.
 * Can test either a raw key (passed directly) or stored credentials.
 */
export async function POST(req: Request) {
  try {
    const { provider, apiKey, organizationId } = await req.json();

    if (!provider) {
      return NextResponse.json({ error: "Missing provider" }, { status: 400 });
    }

    let tokenToTest: string;

    if (apiKey) {
      // Test a raw key directly (before saving)
      tokenToTest = apiKey;
    } else if (organizationId) {
      // Test stored credentials
      const org = await convex.query(api.organizations.getById, {
        id: organizationId as Id<"organizations">,
      });

      if (!org) {
        return NextResponse.json({ error: "Organization not found" }, { status: 404 });
      }

      const keys = decryptProviderKeys(org.providerKeys as Record<string, any>, organizationId);
      const credential = keys[provider as keyof typeof keys];

      if (!credential) {
        return NextResponse.json({ error: `No credentials found for ${provider}` }, { status: 404 });
      }

      if (provider === "openrouter" && typeof credential === "string") {
        tokenToTest = credential;
      } else if (typeof credential === "object" && "token" in credential) {
        if (isTokenExpired(credential)) {
          return NextResponse.json({
            valid: false,
            error: "Token is expired. It will be automatically refreshed on next use.",
          });
        }
        tokenToTest = credential.token;
      } else {
        return NextResponse.json({ error: "Invalid credential format" }, { status: 400 });
      }
    } else {
      return NextResponse.json(
        { error: "Provide either apiKey or organizationId" },
        { status: 400 }
      );
    }

    // Test the key against the provider's API
    const result = await testProviderKey(provider, tokenToTest);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[provider-keys/test] Error:", error);
    return NextResponse.json(
      { valid: false, error: error.message || "Test failed" },
      { status: 500 }
    );
  }
}

async function testProviderKey(
  provider: string,
  token: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    switch (provider) {
      case "anthropic": {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": token,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20241022",
            max_tokens: 1,
            messages: [{ role: "user", content: "test" }],
          }),
        });
        // 200 or even 400 (bad request but auth OK) means the key is valid
        if (res.status === 401 || res.status === 403) {
          return { valid: false, error: "Invalid or expired API key" };
        }
        return { valid: true };
      }

      case "openai": {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          return { valid: false, error: "Invalid or expired API key" };
        }
        return { valid: true };
      }

      case "google": {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${token}`
        );
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          return { valid: false, error: "Invalid API key" };
        }
        return { valid: true };
      }

      case "moonshot": {
        const res = await fetch("https://api.moonshot.cn/v1/models", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          return { valid: false, error: "Invalid API key" };
        }
        return { valid: true };
      }

      case "openrouter": {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          return { valid: false, error: "Invalid API key" };
        }
        return { valid: true };
      }

      case "google_custom_search": {
        // Test Google Custom Search API key with a minimal query
        const res = await fetch(
          `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(token)}&cx=test&q=test&num=1`
        );
        // 400 with "Invalid Value" for cx is fine — means the API key itself is valid
        if (res.status === 403 || res.status === 401) {
          return { valid: false, error: "Invalid Google API key" };
        }
        return { valid: true };
      }

      case "google_search_engine_id": {
        // Engine IDs are just identifiers — validate format (non-empty)
        if (token && token.length > 5) {
          return { valid: true };
        }
        return { valid: false, error: "Search Engine ID appears too short" };
      }

      case "meta": {
        const res = await fetch(
          `https://graph.facebook.com/v19.0/me?access_token=${encodeURIComponent(token)}`
        );
        if (res.status === 401 || res.status === 400) {
          const data = await res.json().catch(() => ({}));
          const msg = data?.error?.message || "Invalid or expired access token";
          return { valid: false, error: msg };
        }
        return { valid: true };
      }

      case "linkedin": {
        const res = await fetch("https://api.linkedin.com/v2/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          return { valid: false, error: "Invalid or expired access token" };
        }
        return { valid: true };
      }

      case "firecrawl": {
        const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ url: "https://example.com", formats: ["markdown"], onlyMainContent: true }),
        });
        if (res.status === 401 || res.status === 403) {
          return { valid: false, error: "Invalid Firecrawl API key" };
        }
        return { valid: true };
      }

      case "gmail_smtp": {
        const [gmailAddr, gmailPass] = token.split("|");
        if (!gmailAddr || !gmailPass) {
          return { valid: false, error: "Invalid format. Expected: email|app-password" };
        }
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({
          service: "gmail",
          auth: { user: gmailAddr, pass: gmailPass },
        });
        await transporter.verify();
        return { valid: true };
      }

      case "instantly": {
        const res = await fetch(
          `https://api.instantly.ai/api/v1/campaign/list?api_key=${encodeURIComponent(token)}`
        );
        if (res.status === 401 || res.status === 403) {
          return { valid: false, error: "Invalid Instantly.ai API key" };
        }
        return { valid: true };
      }

      case "hunter": {
        const res = await fetch(
          `https://api.hunter.io/v2/account?api_key=${encodeURIComponent(token)}`
        );
        if (res.status === 401 || res.status === 403) {
          return { valid: false, error: "Invalid Hunter.io API key" };
        }
        return { valid: true };
      }

      case "apollo": {
        const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": token },
          body: JSON.stringify({ q_organization_name: "test", page: 1, per_page: 1 }),
        });
        if (res.status === 401 || res.status === 403) {
          return { valid: false, error: "Invalid Apollo.io API key" };
        }
        return { valid: true };
      }

      default:
        return { valid: false, error: `Unknown provider: ${provider}` };
    }
  } catch (err: any) {
    return { valid: false, error: `Connection failed: ${err.message}` };
  }
}
