import { tool } from "ai";
import { z } from "zod";

export const deepSearchTool = tool({
  description:
    "Perform an in-depth web search on a topic. Returns up to 10 results with detailed content snippets. Use this for research tasks that need comprehensive information from multiple sources.",
  parameters: z.object({
    topic: z
      .string()
      .describe("The research topic or question to search for"),
    include_domains: z
      .array(z.string())
      .optional()
      .describe(
        "Only include results from these domains (e.g. ['reddit.com', 'yelp.com'])"
      ),
    exclude_domains: z
      .array(z.string())
      .optional()
      .describe(
        "Exclude results from these domains (e.g. ['pinterest.com'])"
      ),
  }),
  execute: async ({ topic, include_domains, exclude_domains }) => {
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
      return {
        results: [],
        error:
          "Search API not configured. Please add TAVILY_API_KEY to your environment.",
      };
    }

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: topic,
          search_depth: "advanced",
          max_results: 10,
          include_answer: true,
          include_raw_content: false,
          ...(include_domains?.length && { include_domains }),
          ...(exclude_domains?.length && { exclude_domains }),
        }),
      });

      if (!response.ok) {
        throw new Error(`Search API returned ${response.status}`);
      }

      const data = await response.json();

      return {
        answer: data.answer || null,
        results: (data.results || []).map((r: any) => ({
          title: r.title,
          url: r.url,
          content: r.content?.slice(0, 2000),
          score: r.score,
        })),
        resultCount: data.results?.length || 0,
      };
    } catch (error: any) {
      return {
        results: [],
        error: `Deep search failed: ${error.message}`,
      };
    }
  },
});

export const readWebpageTool = tool({
  description:
    "Extract and read the main content from a specific webpage URL. Returns the page's text content cleaned of navigation and ads. Use this to read articles, product pages, documentation, or any webpage the user wants summarized.",
  parameters: z.object({
    url: z
      .string()
      .url()
      .describe("The full URL of the webpage to read (e.g. 'https://example.com/article')"),
  }),
  execute: async ({ url }) => {
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
      return {
        content: null,
        error:
          "Search API not configured. Please add TAVILY_API_KEY to your environment.",
      };
    }

    try {
      const response = await fetch("https://api.tavily.com/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          urls: [url],
        }),
      });

      if (!response.ok) {
        throw new Error(`Extract API returned ${response.status}`);
      }

      const data = await response.json();
      const result = data.results?.[0];

      if (!result) {
        return {
          url,
          content: null,
          error: "Could not extract content from this URL.",
        };
      }

      // Truncate to ~8000 chars to keep tool results manageable for the model
      const content = result.raw_content?.slice(0, 8000) || result.content?.slice(0, 8000);

      return {
        url,
        title: result.title || null,
        content: content || null,
        contentLength: result.raw_content?.length || result.content?.length || 0,
      };
    } catch (error: any) {
      return {
        url,
        content: null,
        error: `Failed to read webpage: ${error.message}`,
      };
    }
  },
});
