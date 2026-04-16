import { tool } from "ai";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";

// Find YouTube videos relevant to a vertical/topic
export function createFindYoutubeVideosTool(apiKey: string) {
  return tool({
    description:
      "Search YouTube for videos related to a topic or vertical. Returns video titles, URLs, channel names, and view counts.",
    parameters: z.object({
      query: z
        .string()
        .describe("Search query, e.g. 'roofing tips for homeowners'"),
      maxResults: z
        .number()
        .min(1)
        .max(10)
        .default(5)
        .describe("Number of results to return"),
    }),
    execute: async ({ query, maxResults }) => {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("q", query);
      url.searchParams.set("type", "video");
      url.searchParams.set("maxResults", String(maxResults));
      url.searchParams.set("order", "relevance");
      url.searchParams.set("key", apiKey);

      const res = await fetch(url.toString());
      if (!res.ok) {
        const err = await res.text();
        return {
          success: false,
          error: `YouTube API error: ${res.status} - ${err}`,
        };
      }
      const data = await res.json();
      const videos = (data.items || []).map((item: any) => ({
        videoId: item.id?.videoId,
        title: item.snippet?.title,
        channelTitle: item.snippet?.channelTitle,
        description: item.snippet?.description?.slice(0, 200),
        url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
        publishedAt: item.snippet?.publishedAt,
      }));
      return { success: true, videos, count: videos.length };
    },
  });
}

// Post a comment on a YouTube video (requires OAuth2 access token)
export function createPostYoutubeCommentTool(
  accessToken: string,
  config: { organizationId: string; convex: any }
) {
  return tool({
    description:
      "Post a helpful comment on a YouTube video. The comment should be genuinely useful, not spammy.",
    parameters: z.object({
      videoId: z.string().describe("YouTube video ID"),
      comment: z
        .string()
        .max(500)
        .describe("The comment text to post"),
    }),
    execute: async ({ videoId, comment }) => {
      const res = await fetch(
        "https://www.googleapis.com/youtube/v3/commentThreads?part=snippet",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            snippet: {
              videoId,
              topLevelComment: {
                snippet: { textOriginal: comment },
              },
            },
          }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        return {
          success: false,
          error: `YouTube comment failed: ${res.status} - ${err}`,
        };
      }
      // Save to leadGenPosts for tracking
      try {
        await config.convex.mutation(api.leadGenPosts.create, {
          organizationId: config.organizationId,
          platform: "youtube",
          targetId: videoId,
          targetName: `Video: ${videoId}`,
          content: comment,
          status: "posted",
        });
      } catch (err) {
        console.error("[youtube-tool] leadGenPosts.create failed:", err);
      }
      return { success: true, videoId, commentPosted: true };
    },
  });
}
