import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { encrypt, decrypt } from "@/lib/credentials/crypto";
import type { Id } from "../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** POST /api/credentials — Encrypt and store a new credential */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      organizationId,
      userId,
      serviceName,
      serviceLabel,
      username,
      password,
      extra,
    } = body;

    if (!organizationId || !userId || !serviceName || !serviceLabel || !username || !password) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Encrypt credentials server-side before storing
    const encryptedUsername = encrypt(username, organizationId);
    const encryptedPassword = encrypt(password, organizationId);
    const encryptedExtra = extra
      ? encrypt(JSON.stringify(extra), organizationId)
      : undefined;

    const id = await convex.mutation(api.credentials.create, {
      organizationId: organizationId as Id<"organizations">,
      createdBy: userId as Id<"users">,
      serviceName,
      serviceLabel,
      encryptedUsername,
      encryptedPassword,
      encryptedExtra,
    });

    return Response.json({ id, success: true });
  } catch (error: any) {
    console.error("Credential creation error:", error);
    return Response.json(
      { error: error.message || "Failed to create credential" },
      { status: 500 }
    );
  }
}

/** GET /api/credentials?organizationId=xxx — List credentials (metadata only) */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return Response.json(
        { error: "organizationId is required" },
        { status: 400 }
      );
    }

    const credentials = await convex.query(api.credentials.list, {
      organizationId: organizationId as Id<"organizations">,
    });

    return Response.json({ credentials });
  } catch (error: any) {
    console.error("Credential list error:", error);
    return Response.json(
      { error: error.message || "Failed to list credentials" },
      { status: 500 }
    );
  }
}

/** DELETE /api/credentials — Revoke a credential */
export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { credentialId } = body;

    if (!credentialId) {
      return Response.json(
        { error: "credentialId is required" },
        { status: 400 }
      );
    }

    await convex.mutation(api.credentials.revoke, {
      id: credentialId as Id<"credentials">,
    });

    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Credential revoke error:", error);
    return Response.json(
      { error: error.message || "Failed to revoke credential" },
      { status: 500 }
    );
  }
}
