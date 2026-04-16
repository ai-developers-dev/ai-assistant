import { tool } from "ai";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";

// Search for relevant Twitter threads/conversations
export function createFindTwitterThreadsTool(bearerToken: string) {
  return tool({
    description:
      "Search Twitter/X for recent tweets about a topic. Returns tweet text, author, and engagement metrics.",
    parameters: z.object({
      query: z
        .string()
        .describe("Search query, e.g. 'roofing contractor tips'"),
      maxResults: z
        .number()
        .min(10)
        .max(100)
        .default(10)
        .describe("Number of results (min 10)"),
    }),
    execute: async ({ query, maxResults }) => {
      const url = new URL("https://api.x.com/2/tweets/search/recent");
      url.searchParams.set("query", `${query} -is:retweet lang:en`);
      url.searchParams.set("max_results", String(maxResults));
      url.searchParams.set(
        "tweet.fields",
        "created_at,public_metrics,author_id"
      );

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (!res.ok) {
        const err = await res.text();
        return {
          success: false,
          error: `Twitter API error: ${res.status} - ${err}`,
        };
      }
      const data = await res.json();
      const tweets = (data.data || []).map((tweet: any) => ({
        id: tweet.id,
        text: tweet.text?.slice(0, 280),
        createdAt: tweet.created_at,
        metrics: tweet.public_metrics,
        url: `https://x.com/i/status/${tweet.id}`,
      }));
      return { success: true, tweets, count: tweets.length };
    },
  });
}

// Post a tweet or reply
export function createPostTweetTool(
  bearerToken: string,
  config: { organizationId: string; convex: any }
) {
  return tool({
    description:
      "Post a tweet on Twitter/X. Can be a standalone tweet or a reply to an existing tweet.",
    parameters: z.object({
      text: z
        .string()
        .max(280)
        .describe("Tweet text (max 280 characters)"),
      replyToTweetId: z
        .string()
        .optional()
        .describe("If replying, the ID of the tweet to reply to"),
    }),
    execute: async ({ text, replyToTweetId }) => {
      const body: any = { text };
      if (replyToTweetId) {
        body.reply = { in_reply_to_tweet_id: replyToTweetId };
      }
      const res = await fetch("https://api.x.com/2/tweets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.text();
        return {
          success: false,
          error: `Twitter post failed: ${res.status} - ${err}`,
        };
      }
      const data = await res.json();
      // Track in DB
      try {
        await config.convex.mutation(api.leadGenPosts.create, {
          organizationId: config.organizationId,
          platform: "twitter",
          targetId: replyToTweetId || data.data?.id || "standalone",
          targetName: replyToTweetId
            ? `Reply to ${replyToTweetId}`
            : "Standalone tweet",
          content: text,
          status: "posted",
        });
      } catch (err) {
        console.error("[twitter-tool] leadGenPosts.create failed:", err);
      }
      return {
        success: true,
        tweetId: data.data?.id,
        url: `https://x.com/i/status/${data.data?.id}`,
      };
    },
  });
}
