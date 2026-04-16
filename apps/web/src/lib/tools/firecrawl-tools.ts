import { tool } from "ai";
import { z } from "zod";
import { isSafeUrl } from "@/lib/security/url-safety";

const FIRECRAWL_API_BASE = "https://api.firecrawl.dev/v1";

/**
 * Resolve the Firecrawl API key — org override (set per-request in chat route) > platform env var.
 */
function getFirecrawlApiKey(): string | null {
  return (
    (process.env as any).__FIRECRAWL_ORG_OVERRIDE ||
    process.env.FIRECRAWL_API_KEY ||
    null
  );
}

function firecrawlHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

// ── Web Search (replaces Tavily web_search) ─────────────────────────

export const firecrawlSearchTool = tool({
  description:
    "Search the web for current information. Returns relevant results with titles, URLs, and descriptions. Supports search operators like site:, intitle:, -exclude. Use this when you need up-to-date information, facts, or data.",
  parameters: z.object({
    query: z.string().describe("The search query to look up on the web"),
    limit: z
      .number()
      .min(1)
      .max(10)
      .default(5)
      .describe("Number of results to return (1-10)"),
  }),
  execute: async ({ query, limit }) => {
    const apiKey = getFirecrawlApiKey();
    if (!apiKey) {
      return {
        results: [],
        error:
          "Web search not configured. Add FIRECRAWL_API_KEY to your environment.",
      };
    }

    try {
      const res = await fetch(`${FIRECRAWL_API_BASE}/search`, {
        method: "POST",
        headers: firecrawlHeaders(apiKey),
        body: JSON.stringify({ query, limit }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Firecrawl search returned ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const results = (data.data || []).map((r: any) => ({
        title: r.title || "",
        url: r.url || "",
        description: r.description || r.snippet || "",
      }));

      return { results, count: results.length };
    } catch (error: any) {
      return { results: [], error: `Search failed: ${error.message}` };
    }
  },
});

// ── Deep Search (replaces Tavily deep_search) ───────────────────────

export const firecrawlDeepSearchTool = tool({
  description:
    "Perform in-depth web research on a topic. Returns more results with full page content extracted as clean markdown. Use for thorough research requiring detailed information from multiple sources.",
  parameters: z.object({
    topic: z.string().describe("The research topic to investigate"),
    limit: z
      .number()
      .min(1)
      .max(10)
      .default(5)
      .describe("Number of results to return"),
    includeDomains: z
      .array(z.string())
      .optional()
      .describe("Only include results from these domains"),
    excludeDomains: z
      .array(z.string())
      .optional()
      .describe("Exclude results from these domains"),
  }),
  execute: async ({ topic, limit, includeDomains, excludeDomains }) => {
    const apiKey = getFirecrawlApiKey();
    if (!apiKey) {
      return {
        results: [],
        error:
          "Deep search not configured. Add FIRECRAWL_API_KEY to your environment.",
      };
    }

    try {
      // Build query with domain filters as search operators
      let query = topic;
      if (includeDomains?.length) {
        query += " " + includeDomains.map((d) => `site:${d}`).join(" OR ");
      }
      if (excludeDomains?.length) {
        query += " " + excludeDomains.map((d) => `-site:${d}`).join(" ");
      }

      const res = await fetch(`${FIRECRAWL_API_BASE}/search`, {
        method: "POST",
        headers: firecrawlHeaders(apiKey),
        body: JSON.stringify({
          query,
          limit,
          scrapeOptions: {
            formats: ["markdown"],
            onlyMainContent: true,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Firecrawl deep search returned ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const results = (data.data || []).map((r: any) => ({
        title: r.title || "",
        url: r.url || "",
        description: r.description || "",
        content: r.markdown?.slice(0, 4000) || r.description || "",
      }));

      return { results, resultCount: results.length };
    } catch (error: any) {
      return { results: [], error: `Deep search failed: ${error.message}` };
    }
  },
});

// ── Scrape / Read Webpage (replaces Tavily read_webpage) ────────────

export const firecrawlScrapeTool = tool({
  description:
    "Extract content from a web page as clean markdown. Handles JavaScript-rendered pages (SPAs), strips navigation/ads/footers. Can also extract structured JSON data with a schema. Use this to read the full content of a specific URL.",
  parameters: z.object({
    url: z.string().url().describe("The URL to extract content from"),
    onlyMainContent: z
      .boolean()
      .default(true)
      .describe("Strip navigation, ads, and footers (default true)"),
    waitFor: z
      .number()
      .optional()
      .describe(
        "Milliseconds to wait for JS to render before extracting (e.g. 5000 for slow pages)"
      ),
    jsonPrompt: z
      .string()
      .optional()
      .describe(
        "If set, extract structured data instead of markdown. Describe what data to extract."
      ),
  }),
  execute: async ({ url, onlyMainContent, waitFor, jsonPrompt }) => {
    const safe = isSafeUrl(url);
    if (!safe.ok) {
      return { content: null, error: `Refused URL: ${safe.reason}` };
    }
    const apiKey = getFirecrawlApiKey();
    if (!apiKey) {
      return {
        content: null,
        error:
          "Page extraction not configured. Add FIRECRAWL_API_KEY to your environment.",
      };
    }

    try {
      const isJsonMode = !!jsonPrompt;
      const body: any = {
        url,
        formats: isJsonMode ? ["json"] : ["markdown"],
        onlyMainContent,
      };

      if (waitFor) body.waitFor = waitFor;

      if (isJsonMode) {
        body.jsonOptions = { prompt: jsonPrompt };
      }

      const res = await fetch(`${FIRECRAWL_API_BASE}/scrape`, {
        method: "POST",
        headers: firecrawlHeaders(apiKey),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Firecrawl scrape returned ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const result = data.data || {};

      if (isJsonMode) {
        return {
          url,
          title: result.metadata?.title || null,
          data: result.json || result.extract || null,
          format: "json",
        };
      }

      const content = result.markdown || "";
      return {
        url,
        title: result.metadata?.title || null,
        content: content.slice(0, 12000),
        contentLength: content.length,
        format: "markdown",
      };
    } catch (error: any) {
      return {
        url,
        content: null,
        error: `Page extraction failed: ${error.message}`,
      };
    }
  },
});

// ── Map Website (new capability) ────────────────────────────────────

export const firecrawlMapTool = tool({
  description:
    "Discover all URLs on a website. Useful for finding specific pages on large sites before scraping them. Can filter URLs by a search keyword. Use this when you need to find a specific page (like pricing, docs, blog) on a website.",
  parameters: z.object({
    url: z.string().url().describe("The base URL of the website to map"),
    search: z
      .string()
      .optional()
      .describe(
        "Filter URLs by this keyword (e.g. 'pricing', 'api-docs', 'blog')"
      ),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(50)
      .describe("Max number of URLs to return"),
  }),
  execute: async ({ url, search, limit }) => {
    const safe = isSafeUrl(url);
    if (!safe.ok) {
      return { urls: [], error: `Refused URL: ${safe.reason}` };
    }
    const apiKey = getFirecrawlApiKey();
    if (!apiKey) {
      return {
        urls: [],
        error:
          "Website mapping not configured. Add FIRECRAWL_API_KEY to your environment.",
      };
    }

    try {
      const body: any = { url, limit };
      if (search) body.search = search;

      const res = await fetch(`${FIRECRAWL_API_BASE}/map`, {
        method: "POST",
        headers: firecrawlHeaders(apiKey),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Firecrawl map returned ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const urls = data.links || data.urls || [];

      return { urls, count: urls.length };
    } catch (error: any) {
      return { urls: [], error: `Website mapping failed: ${error.message}` };
    }
  },
});
