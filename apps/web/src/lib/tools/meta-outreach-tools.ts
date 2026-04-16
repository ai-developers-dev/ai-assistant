import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

interface MetaOutreachConfig {
  /** Multiple accounts — each sends up to limitPerAccount messages per day */
  accounts: Array<{ email: string; password: string }>;
  organizationId: Id<"organizations">;
  convex: ConvexHttpClient;
}

// ── Message builder ────────────────────────────────────────────────

function buildMetaMessage(business: {
  name: string;
  ownerName?: string;
  categories: string[];
  address: { city: string; state: string };
  rating?: number;
  reviewCount?: number;
  reviews?: Array<{ reviewerName: string; text: string; relativeTime: string }>;
}): string {
  const firstName = business.ownerName?.split(" ")[0] || "there";
  const city = business.address.city;

  // Use a real review name if available — makes the message feel human and specific
  const review = business.reviews?.find((r) => r.reviewerName && r.text && r.text.length > 20);

  if (review) {
    return `Hey ${firstName}! I was checking out ${business.name} online — ${review.reviewerName}'s review really stood out. Quick question: are you happy with how many new customers you're getting each month?`;
  }

  if (business.rating && business.rating >= 4.5) {
    return `Hey ${firstName}! ${business.rating} stars in ${city} — that's genuinely impressive. Quick question: are you happy with how many new customers that's bringing in each month?`;
  }

  return `Hey ${firstName}! I was checking out ${business.name} — your reputation in ${city} clearly speaks for itself. Quick question: are you happy with how many new customers you're getting each month?`;
}

// ── Puppeteer-based Facebook friend request sender ─────────────────

async function sendFacebookFriendRequests(
  email: string,
  password: string,
  targets: Array<{ id: string; name: string; metaPageUrl: string; message: string }>
): Promise<Array<{ id: string; success: boolean; error?: string }>> {
  // Dynamically import puppeteer to avoid bundling issues
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

  const results: Array<{ id: string; success: boolean; error?: string }> = [];

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

    // Check if login succeeded
    const url = page.url();
    if (url.includes("login") || url.includes("checkpoint")) {
      throw new Error("Facebook login failed or requires 2FA verification");
    }

    // Visit each business page and send message/friend request
    for (const target of targets) {
      try {
        await page.goto(target.metaPageUrl, {
          waitUntil: "networkidle2",
          timeout: 10000,
        });

        // Wait a human-like delay
        await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));

        // Try to find and click "Message" button to send a message
        const messageBtnClicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('div[role="button"], a'));
          const msgBtn = buttons.find(
            (b) =>
              b.textContent?.toLowerCase().includes("message") &&
              !b.textContent?.toLowerCase().includes("messenger")
          );
          if (msgBtn) {
            (msgBtn as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (messageBtnClicked) {
          await new Promise((r) => setTimeout(r, 2000));

          // Type and send message in dialog
          await page.keyboard.type(target.message, { delay: 40 });
          await new Promise((r) => setTimeout(r, 1000));
          await page.keyboard.press("Enter");
          await new Promise((r) => setTimeout(r, 3000));

          // Verify message was actually sent (dialog should close or textarea should be empty)
          const messageSent = await page.evaluate(() => {
            // Check if any error/block dialogs appeared
            const errorIndicators = ["can't receive messages", "isn't accepting messages", "message failed"];
            const bodyText = document.body.innerText?.toLowerCase() || "";
            if (errorIndicators.some((e) => bodyText.includes(e))) return false;
            // Success: the message compose area was cleared (dialog submitted)
            const textareas = Array.from(document.querySelectorAll<HTMLElement>(
              'div[contenteditable="true"], textarea'
            ));
            return textareas.every((el) => !el.textContent?.trim());
          });

          results.push({ id: target.id, success: messageSent, error: messageSent ? undefined : "Message may not have sent — dialog did not clear" });
        } else {
          results.push({ id: target.id, success: false, error: "Could not find message button" });
        }

        // Rate-limit: wait 5-8 seconds between actions
        await new Promise((r) => setTimeout(r, 5000 + Math.random() * 3000));
      } catch (err: any) {
        results.push({ id: target.id, success: false, error: err.message?.slice(0, 100) });
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

// ── Factory ────────────────────────────────────────────────────────

export function createMetaFriendRequestTool(config: MetaOutreachConfig) {
  const accountCount = config.accounts.length;
  return tool({
    description:
      `Send personalized messages to home service business Facebook Pages via browser automation. Uses ${accountCount} account(s) — each sends up to 10 messages per day (${accountCount * 10} total per run). Reads businesses with Meta page URLs, generates tailored messages from Google reviews data.`,
    parameters: z.object({
      limitPerAccount: z
        .number()
        .min(1)
        .max(10)
        .default(10)
        .describe("Number of messages per account (max 10). Total = limitPerAccount × number of accounts."),
    }),
    execute: async ({ limitPerAccount }) => {
      try {
        const totalLimit = limitPerAccount * accountCount;

        // Hard daily limit check
        const todaySent = await config.convex.query(api.businesses.getDailyOutreachCount, {
          organizationId: config.organizationId,
          channel: "meta",
        });
        if (todaySent.sent >= totalLimit) {
          return { __metaOutreach: true, sent: 0, message: `Meta daily limit reached (${todaySent.sent}/${totalLimit} sent today)` };
        }
        const remaining = totalLimit - todaySent.sent;

        // Fetch businesses (only what's remaining in today's limit)
        const businesses = await config.convex.query(api.businesses.getReadyForOutreach, {
          organizationId: config.organizationId,
          channel: "meta",
          limit: remaining,
        });

        if (businesses.length === 0) {
          return {
            __metaOutreach: true,
            sent: 0,
            accounts: accountCount,
            message: "No businesses with Meta pages ready for outreach",
          };
        }

        // Partition businesses across accounts (each account gets its own batch)
        const allResults: Array<{ id: string; success: boolean; error?: string }> = [];
        const allTargets: Array<{ id: string; name: string; metaPageUrl: string; message: string }> = [];
        const now = Date.now();

        for (let i = 0; i < accountCount; i++) {
          const account = config.accounts[i];
          const batch = businesses.slice(i * limitPerAccount, (i + 1) * limitPerAccount);
          if (batch.length === 0) break;

          const targets = batch.map((b: any) => ({
            id: b._id,
            name: b.name,
            metaPageUrl: b.metaPageUrl,
            message: buildMetaMessage(b),
          }));
          allTargets.push(...targets);

          const results = await sendFacebookFriendRequests(account.email, account.password, targets);
          allResults.push(...results);

          // Update outreach status for successful sends
          for (const result of results) {
            if (result.success) {
              await config.convex.mutation(api.businesses.updateOutreachStatus, {
                id: result.id as Id<"businesses">,
                channel: "meta",
                sentAt: now,
              });
            }
          }
        }

        const sent = allResults.filter((r) => r.success).length;
        const failed = allResults.filter((r) => !r.success);

        return {
          __metaOutreach: true,
          accounts: accountCount,
          attempted: allResults.length,
          sent,
          failed: failed.length,
          errors: failed.map((f) => `${f.id}: ${f.error}`),
          messages: allTargets.slice(0, 3).map((t) => ({
            business: t.name,
            preview: t.message.slice(0, 100) + "...",
          })),
        };
      } catch (err: any) {
        console.error("[meta_outreach] Failed:", err.message);
        return {
          __metaOutreach: false,
          error: `Meta outreach failed: ${err.message?.slice(0, 300)}`,
          sent: 0,
        };
      }
    },
  });
}
