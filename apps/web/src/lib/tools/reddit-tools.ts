import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

interface RedditConfig {
  redditClientId: string;
  redditClientSecret: string;
  redditUsername: string;
  redditPassword: string;
  organizationId: Id<"organizations">;
  convex: ConvexHttpClient;
}

interface FindGroupsConfig {
  firecrawlApiKey: string;
}

// ── Reddit OAuth2 API poster (replaces Puppeteer) ───────────────────

async function getRedditAccessToken(
  clientId: string,
  clientSecret: string,
  username: string,
  password: string
): Promise<string> {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "LeadGenBot/1.0",
    },
    body: new URLSearchParams({
      grant_type: "password",
      username,
      password,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Reddit auth failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  if (!data.access_token) throw new Error("No access token in Reddit response");
  return data.access_token;
}

async function submitRedditPost(
  accessToken: string,
  subreddit: string,
  title: string,
  body: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const res = await fetch("https://oauth.reddit.com/api/submit", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "LeadGenBot/1.0",
    },
    body: new URLSearchParams({
      kind: "self",
      sr: subreddit,
      title,
      text: body,
      resubmit: "true",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `HTTP ${res.status}: ${err.slice(0, 200)}` };
  }

  const data = await res.json();

  // Check for Reddit API errors
  if (data.json?.errors?.length > 0) {
    const errors = data.json.errors.map((e: any) => e.join(": ")).join("; ");
    return { success: false, error: errors };
  }

  const postUrl = data.json?.data?.url;
  return { success: true, url: postUrl };
}

// ── Factory: post_to_reddit (using official API) ────────────────────

export function createRedditPostTool(config: RedditConfig) {
  return tool({
    description:
      "Post helpful content to relevant Reddit communities about a business vertical using Reddit's official API. Builds credibility and drives organic interest. Limit: 10 per day.",
    parameters: z.object({
      subreddits: z
        .array(z.string())
        .describe("Subreddit names to post to (e.g. ['roofing', 'HomeImprovement'])"),
      title: z.string().describe("Post title (be helpful, not spammy)"),
      body: z.string().describe("Post body with valuable content"),
      vertical: z.string().describe("Business vertical this post targets"),
      count: z
        .number()
        .min(1)
        .max(10)
        .default(3)
        .describe("Number of subreddits to post to (max 10 per day)"),
    }),
    execute: async ({ subreddits, title, body, vertical, count }) => {
      try {
        // Validate content
        if (!title.trim() || !body.trim()) {
          return { __redditPost: false, error: "Title and body must not be empty", posted: 0 };
        }
        if (title.length > 300) {
          return { __redditPost: false, error: "Title must be under 300 characters", posted: 0 };
        }

        // Get OAuth access token
        const accessToken = await getRedditAccessToken(
          config.redditClientId,
          config.redditClientSecret,
          config.redditUsername,
          config.redditPassword
        );

        const targets = subreddits.slice(0, count);
        const results: Array<{ subreddit: string; success: boolean; url?: string; error?: string }> = [];

        for (const subreddit of targets) {
          const result = await submitRedditPost(accessToken, subreddit, title, body);
          results.push({ subreddit, ...result });

          // Save to database
          await config.convex.mutation(api.leadGenPosts.create, {
            organizationId: config.organizationId,
            platform: "reddit",
            groupName: `r/${subreddit}`,
            groupUrl: `https://www.reddit.com/r/${subreddit}`,
            content: `${title}\n\n${body}`,
            vertical,
            postedAt: Date.now(),
            status: result.success ? "posted" : "failed",
            error: result.error,
          });

          // Rate limit: 10 seconds between posts (Reddit requires ~10 min for new accounts)
          if (targets.indexOf(subreddit) < targets.length - 1) {
            await new Promise((r) => setTimeout(r, 10000));
          }
        }

        const posted = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success);

        return {
          __redditPost: true,
          attempted: results.length,
          posted,
          failed: failed.length,
          errors: failed.map((f) => `r/${f.subreddit}: ${f.error}`),
          urls: results.filter((r) => r.url).map((r) => r.url),
        };
      } catch (err: any) {
        console.error("[reddit_post] Failed:", err.message);
        return {
          __redditPost: false,
          error: `Reddit posting failed: ${err.message?.slice(0, 300)}`,
          posted: 0,
        };
      }
    },
  });
}

// ── Factory: find_social_groups (static — no auth needed) ─────────────

export function createFindSocialGroupsTool(firecrawlApiKey: string) {
  return tool({
    description:
      "Find relevant Reddit communities and Facebook groups for a business vertical. Returns subreddit names and Facebook group URLs to use for posting.",
    parameters: z.object({
      vertical: z.string().describe("Business vertical (e.g. 'roofing contractor', 'dentist')"),
      platforms: z
        .array(z.enum(["reddit", "facebook"]))
        .default(["reddit", "facebook"])
        .describe("Which platforms to search"),
    }),
    execute: async ({ vertical, platforms }) => {
      const results: { reddit: any[]; facebook: any[] } = { reddit: [], facebook: [] };

      try {
        if (platforms.includes("reddit")) {
          const redditQuery = `best subreddits for "${vertical}" professionals OR owners site:reddit.com OR site:redditlist.com`;
          const redditResults = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${firecrawlApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query: redditQuery, limit: 5 }),
          });

          if (redditResults.ok) {
            const data = await redditResults.json();
            const urls: string[] = (data.data || [])
              .map((r: any) => r.url || "")
              .filter((u: string) => u.includes("reddit.com/r/"));

            const subreddits = urls
              .map((u) => {
                const match = u.match(/reddit\.com\/r\/([^/]+)/);
                return match ? match[1] : null;
              })
              .filter(Boolean)
              .filter((v, i, a) => a.indexOf(v) === i)
              .slice(0, 5);

            results.reddit = subreddits.map((name) => ({
              name,
              url: `https://www.reddit.com/r/${name}`,
            }));
          }
        }

        if (platforms.includes("facebook")) {
          const fbQuery = `Facebook groups for "${vertical}" business owners`;
          const fbResults = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${firecrawlApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query: fbQuery, limit: 5 }),
          });

          if (fbResults.ok) {
            const data = await fbResults.json();
            results.facebook = (data.data || [])
              .filter((r: any) => r.url?.includes("facebook.com/groups"))
              .map((r: any) => ({
                name: r.title || r.url,
                url: r.url,
              }))
              .slice(0, 5);
          }
        }
      } catch (err: any) {
        console.error("[find_social_groups] Error:", err.message);
      }

      return {
        __socialGroups: true,
        vertical,
        reddit: results.reddit,
        facebook: results.facebook,
        total: results.reddit.length + results.facebook.length,
      };
    },
  });
}
