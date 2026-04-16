import { tool } from "ai";
import { z } from "zod";
import {
  getOrCreateSession,
  getActivePage,
  createTab,
  closeSession,
  isPrivateUrl,
} from "@/lib/browser/session-manager";

const BROWSERLESS_TIMEOUT = 60_000; // 60s per action
const SESSION_TIMEOUT = 300_000; // 5min total

const stepSchema = z.object({
  action: z.enum([
    "goto",
    "click",
    "type",
    "wait",
    "screenshot",
    "extract_text",
    "select",
    "press_key",
    "scroll",
    "get_tabs",
    "new_tab",
    "close_tab",
    "switch_tab",
    "get_accessibility_tree",
    "close_session",
  ]),
  selector: z
    .string()
    .optional()
    .describe("CSS selector for click/type/select/extract_text actions"),
  value: z
    .string()
    .optional()
    .describe("Text to type, option to select, key to press, or tab ID to switch to"),
  url: z
    .string()
    .optional()
    .describe("URL for goto action"),
  waitMs: z
    .number()
    .optional()
    .describe("Milliseconds to wait (for wait action, default 2000)"),
  direction: z
    .enum(["up", "down"])
    .optional()
    .describe("Scroll direction (for scroll action, default 'down')"),
  pixels: z
    .number()
    .optional()
    .describe("Pixels to scroll (for scroll action, default 500)"),
});

export const browserActionTool = tool({
  description:
    "Execute browser automation steps in a persistent cloud browser session. Use this to interact with websites: navigate to pages, click buttons, fill forms, extract text, manage tabs, and take screenshots. The browser session persists across multiple calls within the same conversation turn — use the returned sessionId to continue working in the same browser. New actions include scroll, tab management, and accessibility tree inspection.",
  parameters: z.object({
    steps: z
      .array(stepSchema)
      .min(1)
      .max(20)
      .describe("Ordered list of browser actions to execute"),
    sessionId: z
      .string()
      .optional()
      .describe(
        "Reuse an existing browser session. Pass the sessionId from a previous browser_action result to continue in the same browser."
      ),
  }),
  execute: async ({ steps, sessionId: inputSessionId }) => {
    let sessionId: string;
    let session;

    try {
      const result = await getOrCreateSession(inputSessionId);
      session = result.session;
      sessionId = result.sessionId;
    } catch (error: any) {
      return {
        success: false,
        error: error.message?.slice(0, 300) || "Failed to create browser session",
      };
    }

    try {
      const results: Array<{
        step: number;
        action: string;
        success: boolean;
        data?: string;
        error?: string;
      }> = [];

      const sessionStart = Date.now();

      for (let i = 0; i < steps.length; i++) {
        // Check total session timeout
        if (Date.now() - sessionStart > SESSION_TIMEOUT) {
          results.push({
            step: i + 1,
            action: steps[i].action,
            success: false,
            error: "Session timeout (5 minutes) exceeded",
          });
          break;
        }

        const step = steps[i];
        const page = getActivePage(session);
        if (!page && step.action !== "close_session") {
          results.push({
            step: i + 1,
            action: step.action,
            success: false,
            error: "No active page in session",
          });
          break;
        }

        try {
          switch (step.action) {
            case "goto": {
              if (!step.url) throw new Error("url is required for goto");
              // SSRF protection
              if (isPrivateUrl(step.url)) {
                throw new Error(
                  "Cannot navigate to private/internal URLs for security reasons"
                );
              }
              await page!.goto(step.url, {
                waitUntil: "domcontentloaded",
                timeout: BROWSERLESS_TIMEOUT,
              });
              results.push({
                step: i + 1,
                action: "goto",
                success: true,
                data: `Navigated to ${step.url}`,
              });
              break;
            }

            case "click": {
              if (!step.selector)
                throw new Error("selector is required for click");
              await page!.click(step.selector, {
                timeout: BROWSERLESS_TIMEOUT,
              });
              results.push({
                step: i + 1,
                action: "click",
                success: true,
                data: `Clicked ${step.selector}`,
              });
              break;
            }

            case "type": {
              if (!step.selector)
                throw new Error("selector is required for type");
              if (!step.value)
                throw new Error("value is required for type");
              await page!.fill(step.selector, step.value, {
                timeout: BROWSERLESS_TIMEOUT,
              });
              results.push({
                step: i + 1,
                action: "type",
                success: true,
                data: `Typed into ${step.selector}`,
              });
              break;
            }

            case "select": {
              if (!step.selector)
                throw new Error("selector is required for select");
              if (!step.value)
                throw new Error("value is required for select");
              await page!.selectOption(step.selector, step.value, {
                timeout: BROWSERLESS_TIMEOUT,
              });
              results.push({
                step: i + 1,
                action: "select",
                success: true,
                data: `Selected "${step.value}" in ${step.selector}`,
              });
              break;
            }

            case "press_key": {
              if (!step.value)
                throw new Error("value (key name) is required for press_key");
              await page!.keyboard.press(step.value);
              results.push({
                step: i + 1,
                action: "press_key",
                success: true,
                data: `Pressed ${step.value}`,
              });
              break;
            }

            case "wait": {
              const ms = step.waitMs || 2000;
              await page!.waitForTimeout(Math.min(ms, 10000));
              results.push({
                step: i + 1,
                action: "wait",
                success: true,
                data: `Waited ${ms}ms`,
              });
              break;
            }

            case "scroll": {
              const direction = step.direction || "down";
              const pixels = step.pixels || 500;
              const scrollAmount = direction === "down" ? pixels : -pixels;
              await page!.evaluate((amount) => {
                window.scrollBy(0, amount);
              }, scrollAmount);
              results.push({
                step: i + 1,
                action: "scroll",
                success: true,
                data: `Scrolled ${direction} ${pixels}px`,
              });
              break;
            }

            case "screenshot": {
              const buffer = await page!.screenshot({
                type: "jpeg",
                quality: 60,
              });
              const base64 = buffer.toString("base64").slice(0, 5000);
              results.push({
                step: i + 1,
                action: "screenshot",
                success: true,
                data: `Screenshot taken (${buffer.length} bytes). Page title: "${await page!.title()}", URL: ${page!.url()}. Base64 preview: ${base64.slice(0, 100)}...`,
              });
              break;
            }

            case "extract_text": {
              let text: string;
              if (step.selector) {
                text = await page!
                  .locator(step.selector)
                  .first()
                  .innerText({ timeout: BROWSERLESS_TIMEOUT });
              } else {
                text = await page!
                  .locator("body")
                  .innerText({ timeout: BROWSERLESS_TIMEOUT });
              }
              const truncated = text.slice(0, 5000);
              results.push({
                step: i + 1,
                action: "extract_text",
                success: true,
                data: truncated,
              });
              break;
            }

            case "get_accessibility_tree": {
              // Extract interactive elements with their roles and text
              const tree = await page!.evaluate(() => {
                const items: Array<{
                  ref: string;
                  tag: string;
                  role: string;
                  text: string;
                  href?: string;
                  type?: string;
                }> = [];
                const interactiveSelectors =
                  'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [onclick]';
                const elements = document.querySelectorAll(interactiveSelectors);
                elements.forEach((el, i) => {
                  const text = (el.textContent || "").trim().slice(0, 100);
                  if (!text && !(el as HTMLInputElement).placeholder) return;
                  items.push({
                    ref: `@e${i}`,
                    tag: el.tagName.toLowerCase(),
                    role:
                      el.getAttribute("role") || el.tagName.toLowerCase(),
                    text: text || (el as HTMLInputElement).placeholder || "",
                    href: (el as HTMLAnchorElement).href || undefined,
                    type: (el as HTMLInputElement).type || undefined,
                  });
                });
                return items.slice(0, 100);
              });
              const treeStr = JSON.stringify(tree, null, 2).slice(0, 5000);
              results.push({
                step: i + 1,
                action: "get_accessibility_tree",
                success: true,
                data: treeStr,
              });
              break;
            }

            case "get_tabs": {
              const tabs = Array.from(session.pages.entries()).map(
                ([id, p]) => ({
                  id,
                  url: p.url(),
                  active: id === session.activePageId,
                })
              );
              results.push({
                step: i + 1,
                action: "get_tabs",
                success: true,
                data: JSON.stringify(tabs),
              });
              break;
            }

            case "new_tab": {
              const { pageId } = await createTab(session);
              if (step.url) {
                if (isPrivateUrl(step.url)) {
                  throw new Error(
                    "Cannot navigate to private/internal URLs for security reasons"
                  );
                }
                const newPage = getActivePage(session)!;
                await newPage.goto(step.url, {
                  waitUntil: "domcontentloaded",
                  timeout: BROWSERLESS_TIMEOUT,
                });
              }
              results.push({
                step: i + 1,
                action: "new_tab",
                success: true,
                data: `Opened new tab ${pageId}${step.url ? ` at ${step.url}` : ""}`,
              });
              break;
            }

            case "switch_tab": {
              if (!step.value)
                throw new Error("value (tab ID) is required for switch_tab");
              if (!session.pages.has(step.value)) {
                throw new Error(`Tab ${step.value} not found`);
              }
              session.activePageId = step.value;
              results.push({
                step: i + 1,
                action: "switch_tab",
                success: true,
                data: `Switched to tab ${step.value}`,
              });
              break;
            }

            case "close_tab": {
              const tabId = step.value || session.activePageId;
              const tabPage = session.pages.get(tabId);
              if (tabPage) {
                await tabPage.close();
                session.pages.delete(tabId);
                // Switch to first remaining tab
                if (session.activePageId === tabId) {
                  const firstTab = session.pages.keys().next().value;
                  session.activePageId = firstTab || "";
                }
              }
              results.push({
                step: i + 1,
                action: "close_tab",
                success: true,
                data: `Closed tab ${tabId}`,
              });
              break;
            }

            case "close_session": {
              await closeSession(sessionId);
              results.push({
                step: i + 1,
                action: "close_session",
                success: true,
                data: "Browser session closed",
              });
              return {
                success: true,
                sessionId: null,
                steps: results,
              };
            }
          }
        } catch (err: any) {
          results.push({
            step: i + 1,
            action: step.action,
            success: false,
            error: err.message?.slice(0, 200),
          });
          // Continue to next step on non-fatal errors
        }
      }

      const activePage = getActivePage(session);
      return {
        success: results.every((r) => r.success),
        sessionId, // Return sessionId for persistent sessions
        currentUrl: activePage ? activePage.url() : undefined,
        pageTitle: activePage
          ? await activePage.title().catch(() => "")
          : undefined,
        tabCount: session.pages.size,
        steps: results,
      };
    } catch (error: any) {
      return {
        success: false,
        sessionId,
        error: `Browser session failed: ${error.message?.slice(0, 300)}`,
      };
    }
  },
});
