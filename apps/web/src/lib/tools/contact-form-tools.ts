import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

export function createContactFormTool(config: {
  organizationId: string;
  convex: ConvexHttpClient;
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
}) {
  return tool({
    description: "Submit a contact form on a business website when no email address was found. Uses Puppeteer to fill and submit the form.",
    parameters: z.object({
      businessId: z.string().describe("The business _id"),
      contactFormUrl: z.string().describe("URL of the contact page"),
      message: z.string().describe("The outreach message to submit via the form"),
    }),
    execute: async ({ businessId, contactFormUrl, message }) => {
      try {
        // Dynamic import Puppeteer
        let puppeteer: any;
        try {
          puppeteer = await import("puppeteer");
        } catch {
          return { success: false, error: "Puppeteer not installed. Run: npm install puppeteer" };
        }

        const browser = await puppeteer.default.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        try {
          const page = await browser.newPage();
          await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

          // Navigate to contact form
          await page.goto(contactFormUrl, { waitUntil: "networkidle2", timeout: 15000 });
          await new Promise((r) => setTimeout(r, 2000)); // Wait for dynamic content

          // Find and fill form fields
          let filledFields = 0;

          // Name field
          const nameSelectors = [
            'input[name*="name" i]',
            'input[placeholder*="name" i]',
            'input[id*="name" i]',
            'input[aria-label*="name" i]',
          ];
          for (const sel of nameSelectors) {
            try {
              const el = await page.$(sel);
              if (el) {
                await el.click({ clickCount: 3 });
                await el.type(config.senderName, { delay: 50 });
                filledFields++;
                break;
              }
            } catch { /* try next selector */ }
          }

          // Email field
          const emailSelectors = [
            'input[type="email"]',
            'input[name*="email" i]',
            'input[placeholder*="email" i]',
            'input[id*="email" i]',
          ];
          for (const sel of emailSelectors) {
            try {
              const el = await page.$(sel);
              if (el) {
                await el.click({ clickCount: 3 });
                await el.type(config.senderEmail, { delay: 50 });
                filledFields++;
                break;
              }
            } catch { /* try next selector */ }
          }

          // Phone field (optional)
          if (config.senderPhone) {
            const phoneSelectors = [
              'input[type="tel"]',
              'input[name*="phone" i]',
              'input[placeholder*="phone" i]',
              'input[id*="phone" i]',
            ];
            for (const sel of phoneSelectors) {
              try {
                const el = await page.$(sel);
                if (el) {
                  await el.click({ clickCount: 3 });
                  await el.type(config.senderPhone, { delay: 50 });
                  filledFields++;
                  break;
                }
              } catch { /* try next selector */ }
            }
          }

          // Message field
          const messageSelectors = [
            "textarea",
            'textarea[name*="message" i]',
            'textarea[name*="comment" i]',
            'input[name*="message" i]',
          ];
          for (const sel of messageSelectors) {
            try {
              const el = await page.$(sel);
              if (el) {
                await el.click({ clickCount: 3 });
                await el.type(message, { delay: 30 });
                filledFields++;
                break;
              }
            } catch { /* try next selector */ }
          }

          if (filledFields < 2) {
            return {
              success: false,
              error: `Only filled ${filledFields} fields — form structure not recognized`,
              filledFields,
            };
          }

          // Find and click submit button
          // Standard CSS selectors first, then XPath for text-based button matching
          const submitSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            ".submit-button",
            "#submit",
          ];

          let submitted = false;
          for (const sel of submitSelectors) {
            try {
              const btn = await page.$(sel);
              if (btn) {
                await btn.click();
                submitted = true;
                break;
              }
            } catch { /* try next */ }
          }

          // Fallback: XPath text-based button matching (Puppeteer-compatible)
          if (!submitted) {
            const xpathSelectors = [
              '//button[contains(translate(text(),"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"send")]',
              '//button[contains(translate(text(),"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"submit")]',
              '//button[contains(translate(text(),"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"contact")]',
              '//input[contains(translate(@value,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"send")]',
              '//input[contains(translate(@value,"ABCDEFGHIJKLMNOPQRSTUVWXYZ","abcdefghijklmnopqrstuvwxyz"),"submit")]',
            ];
            for (const xpath of xpathSelectors) {
              try {
                const [btn] = await page.$x(xpath);
                if (btn) {
                  await (btn as any).click();
                  submitted = true;
                  break;
                }
              } catch { /* try next */ }
            }
          }

          if (!submitted) {
            return { success: false, error: "Could not find submit button", filledFields };
          }

          // Wait for submission
          await new Promise((r) => setTimeout(r, 3000));

          // Check for success indicators
          const pageContent = await page.content();
          const successIndicators = ["thank", "success", "received", "sent", "submitted", "confirmation"];
          const isSuccess = successIndicators.some((w) => pageContent.toLowerCase().includes(w));

          // Record the form submission
          if (isSuccess || submitted) {
            try {
              await config.convex.mutation(api.businesses.updateOutreachStatus, {
                id: businessId as Id<"businesses">,
                channel: "email", // Treat form submission as email-equivalent
                sentAt: Date.now(),
              });
            } catch { /* non-fatal */ }
          }

          return {
            success: isSuccess || submitted,
            filledFields,
            submitted: true,
            successDetected: isSuccess,
            url: contactFormUrl,
          };
        } finally {
          await browser.close();
        }
      } catch (err: any) {
        return {
          success: false,
          error: err.message?.slice(0, 200),
        };
      }
    },
  });
}
