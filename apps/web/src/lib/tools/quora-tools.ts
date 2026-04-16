import { tool } from "ai";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";

export function createFindQuoraQuestionsTool(firecrawlKey: string, config: { organizationId: string; convex: any }) {
  return tool({
    description: "Find relevant Quora questions for a vertical/topic. Returns question titles and URLs for manual answering. Does NOT post answers (Quora blocks automation).",
    parameters: z.object({
      query: z.string().describe("Topic to search, e.g. 'best HVAC contractor'"),
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
          query: `site:quora.com ${query}`,
          limit: maxResults,
        }),
      });
      if (!res.ok) {
        return { success: false, error: `Firecrawl search failed: ${res.status}` };
      }
      const data = await res.json();
      const questions = (data.data || [])
        .filter((r: any) => r.url?.includes("quora.com"))
        .map((r: any) => ({
          title: r.title || r.metadata?.title || "Unknown",
          url: r.url,
          description: r.description?.slice(0, 200),
        }));
      // Log as "logged" status (not posted — manual follow-up required)
      for (const q of questions) {
        try {
          await config.convex.mutation(api.leadGenPosts.create, {
            organizationId: config.organizationId,
            platform: "quora",
            targetId: q.url,
            targetName: q.title,
            content: `Question identified for manual answering: ${q.title}`,
            status: "logged",
          });
        } catch (err) {
          console.error("[quora-tool] leadGenPosts.create failed:", err);
        }
      }
      return { success: true, questions, count: questions.length, note: "These questions are logged for manual answering. Quora blocks automated posting." };
    },
  });
}
