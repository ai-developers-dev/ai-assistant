import { tool } from "ai";
import { z } from "zod";

export const webSearchTool = tool({
  description:
    "Search the web for current information. Use this when you need up-to-date information, facts, or data that might not be in your training data.",
  parameters: z.object({
    query: z
      .string()
      .describe("The search query to look up on the web"),
  }),
  execute: async ({ query }) => {
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
      return {
        results: [],
        error: "Search API not configured. Please add TAVILY_API_KEY to your environment.",
      };
    }

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: "basic",
          max_results: 5,
          include_answer: true,
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
          content: r.content?.slice(0, 500),
        })),
      };
    } catch (error: any) {
      return {
        results: [],
        error: `Search failed: ${error.message}`,
      };
    }
  },
});

export const calculatorTool = tool({
  description:
    "Evaluate a mathematical expression. Supports basic arithmetic, percentages, and common math functions.",
  parameters: z.object({
    expression: z
      .string()
      .describe("The mathematical expression to evaluate (e.g., '2 + 2', '15% of 200', 'sqrt(144)')"),
  }),
  execute: async ({ expression }) => {
    try {
      // Safe math evaluation using Function constructor with restricted scope
      const sanitized = expression.replace(/[^0-9+\-*/().,%\s\w]/g, "");
      const withFunctions = sanitized
        .replace(/sqrt/g, "Math.sqrt")
        .replace(/pow/g, "Math.pow")
        .replace(/abs/g, "Math.abs")
        .replace(/round/g, "Math.round")
        .replace(/floor/g, "Math.floor")
        .replace(/ceil/g, "Math.ceil")
        .replace(/(\d+)%\s*of\s*(\d+)/gi, "($1/100)*$2")
        .replace(/(\d+)%/g, "($1/100)");

      const result = new Function(`return ${withFunctions}`)();

      return {
        expression,
        result: Number(result),
      };
    } catch (error: any) {
      return {
        expression,
        error: `Could not evaluate: ${error.message}`,
      };
    }
  },
});
