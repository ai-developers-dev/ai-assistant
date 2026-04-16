import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

interface LinkedInOutreachConfig {
  /** Multiple accounts — each sends up to limitPerAccount connection requests per day */
  accounts: Array<{ email: string; password: string }>;
  organizationId: Id<"organizations">;
  convex: ConvexHttpClient;
}

// LinkedIn connection note max = 300 chars
const MAX_NOTE_LENGTH = 300;

// ── Connection note builder ────────────────────────────────────────

function buildConnectionNote(business: {
  name: string;
  ownerName?: string;
  categories: string[];
  address: { city: string; state: string };
  rating?: number;
  reviewCount?: number;
  reviews?: Array<{ reviewerName: string; text: string }>;
}): string {
  const firstName = business.ownerName?.split(" ")[0] || "there";
  const city = business.address.city;
  const review = business.reviews?.find((r) => r.reviewerName && r.text && r.text.length > 15);

  let note: string;

  // Pick the most specific hook available
  if (business.reviewCount && business.reviewCount > 50) {
    note = `Hi ${firstName} — ${business.reviewCount} reviews in ${city} is genuinely rare. You've clearly built something people trust. Would love to connect and learn more about ${business.name}.`;
  } else if (review) {
    note = `Hi ${firstName} — ${review.reviewerName}'s review for ${business.name} really caught my attention. That kind of specific feedback shows real customer loyalty. Would love to connect!`;
  } else if (business.rating && business.rating >= 4.5) {
    note = `Hi ${firstName} — ${business.rating} stars in ${city} is legitimately exceptional. ${business.name} clearly stands out. Would love to connect!`;
  } else {
    note = `Hi ${firstName} — ${business.name} stood out to me while researching ${city}. Would love to connect and learn more about what you've built!`;
  }

  // Trim to LinkedIn's 300 char limit
  return note.length > MAX_NOTE_LENGTH
    ? note.slice(0, MAX_NOTE_LENGTH - 3) + "..."
    : note;
}

// ── Puppeteer-based LinkedIn connection sender ─────────────────────

async function sendLinkedInConnections(
  email: string,
  password: string,
  targets: Array<{ id: string; name: string; linkedinOwnerUrl: string; note: string }>
): Promise<Array<{ id: string; success: boolean; error?: string }>> {
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

    // Log into LinkedIn
    await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle2" });
    await page.type("#username", email, { delay: 80 });
    await page.type("#password", password, { delay: 80 });
    await page.click('[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 });

    const loginUrl = page.url();
    if (loginUrl.includes("checkpoint") || loginUrl.includes("login")) {
      throw new Error(
        "LinkedIn login failed or requires verification. Check credentials or complete 2FA manually."
      );
    }

    // Send connection requests
    for (const target of targets) {
      try {
        await page.goto(target.linkedinOwnerUrl, {
          waitUntil: "networkidle2",
          timeout: 12000,
        });

        // Human-like delay
        await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));

        // Find "Connect" button
        const connectClicked = await page.evaluate(() => {
          // Look for Connect button in profile actions
          const buttons = Array.from(document.querySelectorAll("button"));
          const connectBtn = buttons.find(
            (b) =>
              b.textContent?.trim().toLowerCase() === "connect" ||
              b.getAttribute("aria-label")?.toLowerCase().includes("connect")
          );
          if (connectBtn) {
            (connectBtn as HTMLElement).click();
            return true;
          }

          // Sometimes inside More dropdown
          const moreBtn = buttons.find(
            (b) =>
              b.textContent?.trim().toLowerCase() === "more" ||
              b.getAttribute("aria-label")?.toLowerCase().includes("more")
          );
          if (moreBtn) (moreBtn as HTMLElement).click();
          return false;
        });

        if (!connectClicked) {
          // Try from "More" dropdown
          await new Promise((r) => setTimeout(r, 1000));
          const fromMore = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll("li, div[role='menuitem']"));
            const connectItem = items.find((i) =>
              i.textContent?.trim().toLowerCase().includes("connect")
            );
            if (connectItem) {
              (connectItem as HTMLElement).click();
              return true;
            }
            return false;
          });

          if (!fromMore) {
            results.push({ id: target.id, success: false, error: "Connect button not found" });
            continue;
          }
        }

        // Wait for "Add a note" dialog
        await new Promise((r) => setTimeout(r, 1500));

        // Click "Add a note" to include personalized message
        const addNoteClicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button"));
          const noteBtn = buttons.find(
            (b) =>
              b.textContent?.toLowerCase().includes("add a note") ||
              b.getAttribute("aria-label")?.toLowerCase().includes("add a note")
          );
          if (noteBtn) {
            (noteBtn as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (addNoteClicked) {
          await new Promise((r) => setTimeout(r, 1000));

          // Type note
          const textArea = await page.$("textarea");
          if (textArea) {
            await textArea.type(target.note, { delay: 30 });
          }
        }

        // Click "Send" button
        await new Promise((r) => setTimeout(r, 1000));
        const sendClicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button"));
          const sendBtn = buttons.find(
            (b) =>
              b.textContent?.trim().toLowerCase() === "send" ||
              b.getAttribute("aria-label")?.toLowerCase().includes("send")
          );
          if (sendBtn) {
            (sendBtn as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (!sendClicked) {
          results.push({ id: target.id, success: false, error: "Send button not found" });
          continue;
        }

        // Wait and verify the connection request was actually confirmed (modal should close)
        await new Promise((r) => setTimeout(r, 2500));
        const confirmed = await page.evaluate(() => {
          // "Pending" button = connection request sent
          const buttons = Array.from(document.querySelectorAll("button"));
          const pendingBtn = buttons.find(
            (b) =>
              b.textContent?.trim().toLowerCase() === "pending" ||
              b.getAttribute("aria-label")?.toLowerCase().includes("pending")
          );
          if (pendingBtn) return true;
          // Modal closed = request submitted
          const modal = document.querySelector("[role='dialog']");
          if (!modal) return true;
          // Check for rate limit / captcha indicators
          const bodyText = document.body.innerText?.toLowerCase() || "";
          if (bodyText.includes("weekly invitation limit") || bodyText.includes("verify")) return false;
          return false;
        });

        results.push({ id: target.id, success: confirmed, error: confirmed ? undefined : "Connection request may not have gone through — verify manually" });

        // Rate-limit: 6-10 seconds between requests to avoid LinkedIn detection
        await new Promise((r) => setTimeout(r, 6000 + Math.random() * 4000));
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

export function createLinkedInConnectTool(config: LinkedInOutreachConfig) {
  const accountCount = config.accounts.length;
  return tool({
    description:
      `Send personalized LinkedIn connection requests to home service business owners via browser automation. Uses ${accountCount} account(s) — each sends up to 10 connection requests per day (${accountCount * 10} total per run). Generates tailored 300-char notes from Google reviews data.`,
    parameters: z.object({
      limitPerAccount: z
        .number()
        .min(1)
        .max(10)
        .default(10)
        .describe("Number of connection requests per account (max 10). Total = limitPerAccount × number of accounts."),
    }),
    execute: async ({ limitPerAccount }) => {
      try {
        const totalLimit = limitPerAccount * accountCount;

        // Hard daily limit check
        const todaySent = await config.convex.query(api.businesses.getDailyOutreachCount, {
          organizationId: config.organizationId,
          channel: "linkedin",
        });
        if (todaySent.sent >= totalLimit) {
          return { __linkedinOutreach: true, sent: 0, message: `LinkedIn daily limit reached (${todaySent.sent}/${totalLimit} sent today)` };
        }
        const remaining = totalLimit - todaySent.sent;

        // Fetch businesses (only what's remaining in today's limit)
        const businesses = await config.convex.query(api.businesses.getReadyForOutreach, {
          organizationId: config.organizationId,
          channel: "linkedin",
          limit: remaining,
        });

        if (businesses.length === 0) {
          return {
            __linkedinOutreach: true,
            sent: 0,
            accounts: accountCount,
            message: "No businesses with LinkedIn owner profiles ready for outreach",
          };
        }

        // Partition businesses across accounts (each account gets its own batch)
        const allResults: Array<{ id: string; success: boolean; error?: string }> = [];
        const allTargets: Array<{ id: string; name: string; linkedinOwnerUrl: string; note: string }> = [];
        const now = Date.now();

        for (let i = 0; i < accountCount; i++) {
          const account = config.accounts[i];
          const batch = businesses.slice(i * limitPerAccount, (i + 1) * limitPerAccount);
          if (batch.length === 0) break;

          const targets = batch.map((b: any) => ({
            id: b._id,
            name: b.name,
            linkedinOwnerUrl: b.linkedinOwnerUrl,
            note: buildConnectionNote(b),
          }));
          allTargets.push(...targets);

          const results = await sendLinkedInConnections(account.email, account.password, targets);
          allResults.push(...results);

          // Update outreach status for successful sends
          for (const result of results) {
            if (result.success) {
              await config.convex.mutation(api.businesses.updateOutreachStatus, {
                id: result.id as Id<"businesses">,
                channel: "linkedin",
                sentAt: now,
              });
            }
          }
        }

        const sent = allResults.filter((r) => r.success).length;
        const failed = allResults.filter((r) => !r.success);

        return {
          __linkedinOutreach: true,
          accounts: accountCount,
          attempted: allResults.length,
          sent,
          failed: failed.length,
          errors: failed.map((f) => `${f.id}: ${f.error}`),
          noteExamples: allTargets.slice(0, 2).map((t) => ({
            business: t.name,
            note: t.note,
          })),
        };
      } catch (err: any) {
        console.error("[linkedin_outreach] Failed:", err.message);
        return {
          __linkedinOutreach: false,
          error: `LinkedIn outreach failed: ${err.message?.slice(0, 300)}`,
          sent: 0,
        };
      }
    },
  });
}
