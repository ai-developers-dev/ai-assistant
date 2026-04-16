/**
 * In-memory browser session store — same pattern as PLAN_CACHE and CONTENT_CACHE.
 * Each serverless invocation is isolated so there's no cross-request leakage.
 * Sessions persist across multiple tool calls within the same API request.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  pages: Map<string, Page>;
  activePageId: string;
  createdAt: number;
  lastUsedAt: number;
}

const BROWSER_SESSIONS = new Map<string, BrowserSession>();
const SESSION_TTL = 5 * 60 * 1000; // 5 minutes
let sessionCounter = 0;

/**
 * Get an existing session or create a new one.
 * Reuses CDP connection to Browserless.io across multiple tool calls.
 */
export async function getOrCreateSession(
  sessionId?: string
): Promise<{ session: BrowserSession; sessionId: string }> {
  // Try to reuse existing session
  if (sessionId) {
    const existing = BROWSER_SESSIONS.get(sessionId);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return { session: existing, sessionId };
    }
  }

  // Create new session
  const apiKey = process.env.BROWSERLESS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "BROWSERLESS_API_KEY is not configured. Add it to your environment to enable browser automation."
    );
  }

  const browser = await chromium.connectOverCDP(
    `wss://chrome.browserless.io?token=${apiKey}&stealth`,
    { timeout: 60_000 }
  );

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60_000);

  const newId = `browser_${++sessionCounter}_${Date.now()}`;
  const pageId = "page_1";

  const session: BrowserSession = {
    browser,
    context,
    pages: new Map([[pageId, page]]),
    activePageId: pageId,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };

  BROWSER_SESSIONS.set(newId, session);

  return { session, sessionId: newId };
}

/**
 * Get the active page for a session.
 */
export function getActivePage(session: BrowserSession): Page | undefined {
  return session.pages.get(session.activePageId);
}

/**
 * Create a new tab in the session.
 */
export async function createTab(
  session: BrowserSession
): Promise<{ pageId: string; page: Page }> {
  const page = await session.context.newPage();
  page.setDefaultTimeout(60_000);
  const pageId = `page_${session.pages.size + 1}`;
  session.pages.set(pageId, page);
  session.activePageId = pageId;
  return { pageId, page };
}

/**
 * Close a specific session.
 */
export async function closeSession(sessionId: string): Promise<void> {
  const session = BROWSER_SESSIONS.get(sessionId);
  if (session) {
    await session.browser.close().catch(() => {});
    BROWSER_SESSIONS.delete(sessionId);
  }
}

/**
 * Close all sessions older than SESSION_TTL. Call in onFinish.
 */
export async function cleanupStaleSessions(): Promise<void> {
  const now = Date.now();
  for (const [id, session] of BROWSER_SESSIONS) {
    if (now - session.lastUsedAt > SESSION_TTL) {
      await session.browser.close().catch(() => {});
      BROWSER_SESSIONS.delete(id);
    }
  }
}

/**
 * SSRF protection: reject URLs pointing to private/internal IPs.
 */
export function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost and loopback
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0"
    ) {
      return true;
    }

    // Block private IP ranges
    const parts = hostname.split(".").map(Number);
    if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
      // 10.x.x.x
      if (parts[0] === 10) return true;
      // 172.16-31.x.x
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      // 192.168.x.x
      if (parts[0] === 192 && parts[1] === 168) return true;
      // 169.254.x.x (link-local)
      if (parts[0] === 169 && parts[1] === 254) return true;
    }

    // Block metadata endpoints
    if (hostname === "metadata.google.internal") return true;
    if (hostname === "169.254.169.254") return true;

    return false;
  } catch {
    return true; // Block malformed URLs
  }
}
