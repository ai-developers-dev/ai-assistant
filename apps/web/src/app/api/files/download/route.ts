import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const artifactId = url.searchParams.get("artifactId");
  const fileId = url.searchParams.get("fileId");

  try {
    // Resolve the user's current org to verify ownership
    let organizationId: Id<"organizations"> | null = null;
    if (orgId) {
      const org = await convex.query(api.organizations.getCurrent, {
        clerkOrgId: orgId,
      });
      if (org) {
        organizationId = org._id;
      }
    }

    if (artifactId) {
      const artifact = await convex.query(api.artifacts.getById, {
        artifactId: artifactId as Id<"artifacts">,
      });

      if (!artifact) {
        return new Response("Artifact not found", { status: 404 });
      }

      // Verify artifact belongs to the user's current org
      if (!organizationId || artifact.organizationId !== organizationId) {
        return new Response("Forbidden", { status: 403 });
      }

      // If artifact has content stored in _storage, redirect to that URL
      if (artifact.storageUrl && !artifact.content) {
        return Response.redirect(artifact.storageUrl);
      }

      // Return inline content as downloadable file
      if (artifact.content) {
        return new Response(artifact.content, {
          headers: {
            "Content-Type": artifact.mimeType,
            "Content-Disposition": `attachment; filename="${artifact.title}"`,
            "Content-Length": String(
              new TextEncoder().encode(artifact.content).length
            ),
          },
        });
      }

      return new Response("Artifact has no content", { status: 404 });
    }

    if (fileId) {
      const file = await convex.query(api.files.getById, {
        fileId: fileId as Id<"files">,
      });

      if (!file || !file.url) {
        return new Response("File not found", { status: 404 });
      }

      // Verify file belongs to the user's current org
      if (!organizationId || file.organizationId !== organizationId) {
        return new Response("Forbidden", { status: 403 });
      }

      // Redirect to the Convex storage URL
      return Response.redirect(file.url);
    }

    return new Response("Missing artifactId or fileId parameter", {
      status: 400,
    });
  } catch (error: any) {
    console.error("Download error:", error);
    return new Response("Download failed", { status: 500 });
  }
}
