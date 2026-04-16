import { tool } from "ai";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";

export function createFindNextdoorCommunitiesTool(firecrawlKey: string, config: { organizationId: string; convex: any }) {
  return tool({
    description: "Find Nextdoor neighborhood discussions relevant to a vertical/topic. Returns community references for manual engagement. Does NOT post (Nextdoor requires address verification).",
    parameters: z.object({
      query: z.string().describe("Topic to search, e.g. 'plumber recommendation Chicago'"),
      maxResults: z.number().min(1).max(10).default(5),
    }),
    execute: async ({ query, maxResults }) => {
      const res = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `site:nextdoor.com ${query}`,
          limit: maxResults,
        }),
      });
      if (!res.ok) {
        return { success: false, error: `Firecrawl search failed: ${res.status}` };
      }
      const data = await res.json();
      const communities = (data.data || [])
        .filter((r: any) => r.url?.includes("nextdoor.com"))
        .map((r: any) => ({
          title: r.title || "Unknown",
          url: r.url,
          description: r.description?.slice(0, 200),
        }));
      for (const c of communities) {
        try {
          await config.convex.mutation(api.leadGenPosts.create, {
            organizationId: config.organizationId,
            platform: "nextdoor",
            targetId: c.url,
            targetName: c.title,
            content: `Community identified for manual engagement: ${c.title}`,
            status: "logged",
          });
        } catch (err) {
          console.error("[nextdoor-tool] leadGenPosts.create failed:", err);
        }
      }
      return { success: true, communities, count: communities.length, note: "Nextdoor requires address verification. These communities are logged for manual engagement." };
    },
  });
}
