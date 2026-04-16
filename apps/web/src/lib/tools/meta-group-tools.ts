import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

interface MetaGroupConfig {
  metaEmail: string;
  metaPassword: string;
  organizationId: Id<"organizations">;
  convex: ConvexHttpClient;
}

// ── Puppeteer Facebook group poster ──────────────────────────────────

async function postToFacebookGroups(
  email: string,
  password: string,
  posts: Array<{ groupName: string; groupUrl: string; message: string }>
): Promise<Array<{ groupName: string; groupUrl: string; success: boolean; error?: string }>> {
  let puppeteer: any;
  try {
    puppeteer = await import("puppeteer");
  } catch {
    throw new Error("Puppeteer is not installed. Run: npm install puppeteer");
  }

  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const results: Array<{ groupName: string; groupUrl: string; success: boolean; error?: string }> = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Log into Facebook
    await page.goto("https://www.facebook.com/login", { waitUntil: "networkidle2" });
    await page.type("#email", email, { delay: 80 });
    await page.type("#pass", password, { delay: 80 });
    await page.click('[name="login"]');
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 });

    const url = page.url();
    if (url.includes("login") || url.includes("checkpoint")) {
      throw new Error("Facebook login failed or requires 2FA verification");
    }

    for (const post of posts) {
      try {
        await page.goto(post.groupUrl, {
          waitUntil: "networkidle2",
          timeout: 12000,
        });

        // Human-like delay
        await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));

        // Try to find "Write something..." post box
        const postBoxClicked = await page.evaluate(() => {
          const clickTargets = Array.from(
            document.querySelectorAll('div[role="button"], span, div')
          );
          const writeBox = clickTargets.find(
            (el) =>
              el.textContent?.toLowerCase().includes("write something") ||
              el.getAttribute("aria-label")?.toLowerCase().includes("write")
          );
          if (writeBox) {
            (writeBox as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (!postBoxClicked) {
          results.push({ ...post, success: false, error: "Post box not found" });
          continue;
        }

        await new Promise((r) => setTimeout(r, 1500));

        // Type the message
        await page.keyboard.type(post.message, { delay: 25 });
        await new Promise((r) => setTimeout(r, 1000));

        // Click Post button
        const posted = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("div[role='button'], button"));
          const postBtn = buttons.find(
            (b) =>
              b.textContent?.trim().toLowerCase() === "post" ||
              b.getAttribute("aria-label")?.toLowerCase() === "post"
          );
          if (postBtn) {
            (postBtn as HTMLElement).click();
            return true;
          }
          return false;
        });

        await new Promise((r) => setTimeout(r, 2000));
        results.push({ ...post, success: !!posted });

        // Rate-limit: 6-10 seconds between posts
        await new Promise((r) => setTimeout(r, 6000 + Math.random() * 4000));
      } catch (err: any) {
        results.push({ ...post, success: false, error: err.message?.slice(0, 100) });
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

// ── Factory: post_to_meta_group ────────────────────────────────────────

export function createMetaGroupPostTool(config: MetaGroupConfig) {
  return tool({
    description:
      "Post helpful content to Facebook groups related to a business vertical. Builds brand visibility and drives organic leads. Posts are saved to the database. Limit: 20 per day.",
    parameters: z.object({
      groups: z
        .array(
          z.object({
            name: z.string().describe("Group display name"),
            url: z.string().describe("Full Facebook group URL"),
          })
        )
        .describe("Facebook groups to post to"),
      message: z.string().describe("Post content (helpful, value-add — not spammy)"),
      vertical: z.string().describe("Business vertical this post targets"),
      count: z
        .number()
        .min(1)
        .max(20)
        .default(5)
        .describe("Number of groups to post to (max 20 per day)"),
    }),
    execute: async ({ groups, message, vertical, count }) => {
      try {
        const targets = groups.slice(0, count).map((g) => ({
          groupName: g.name,
          groupUrl: g.url,
          message,
        }));

        const results = await postToFacebookGroups(
          config.metaEmail,
          config.metaPassword,
          targets
        );

        // Save results to database
        const now = Date.now();
        for (const result of results) {
          await config.convex.mutation(api.leadGenPosts.create, {
            organizationId: config.organizationId,
            platform: "meta_group",
            groupName: result.groupName,
            groupUrl: result.groupUrl,
            content: message,
            vertical,
            postedAt: now,
            status: result.success ? "posted" : "failed",
            error: result.error,
          });
        }

        const posted = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success);

        return {
          __metaGroupPost: true,
          attempted: results.length,
          posted,
          failed: failed.length,
          errors: failed.map((f) => `${f.groupName}: ${f.error}`),
        };
      } catch (err: any) {
        console.error("[meta_group_post] Failed:", err.message);
        return {
          __metaGroupPost: false,
          error: `Meta group posting failed: ${err.message?.slice(0, 300)}`,
          posted: 0,
        };
      }
    },
  });
}
