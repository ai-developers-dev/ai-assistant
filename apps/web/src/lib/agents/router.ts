import type { AgentType } from "./registry";

interface RouteResult {
  suggestedAgent: AgentType;
  confidence: number;
  reason: string;
}

/**
 * Keyword-based agent routing — no LLM call needed.
 * Returns the best agent for a given message, or the current agent if no strong match.
 */

const ROUTING_RULES: Array<{
  agent: AgentType;
  keywords: string[];
  phrases: string[];
  weight: number;
}> = [
  {
    agent: "websites",
    keywords: ["website", "webpage", "html", "css", "landing page", "web app"],
    phrases: [
      "build a website",
      "create a website",
      "make a website",
      "build me a",
      "design a page",
      "web design",
    ],
    weight: 0.8,
  },
  {
    agent: "documents",
    keywords: ["report", "proposal", "article", "essay", "document", "memo", "brief"],
    phrases: [
      "write a report",
      "create a document",
      "draft a proposal",
      "write an article",
      "write a detailed",
      "write up",
    ],
    weight: 0.7,
  },
  {
    agent: "sheets",
    keywords: ["spreadsheet", "csv", "data analysis", "chart", "graph", "dataset"],
    phrases: [
      "analyze data",
      "create a spreadsheet",
      "data analysis",
      "make a chart",
      "calculate statistics",
    ],
    weight: 0.7,
  },
  {
    agent: "slides",
    keywords: ["presentation", "slides", "slide deck", "pitch deck", "keynote"],
    phrases: [
      "create a presentation",
      "make slides",
      "build a deck",
      "create slides",
    ],
    weight: 0.7,
  },
  {
    agent: "images",
    keywords: ["image", "photo", "picture", "illustration", "graphic"],
    phrases: [
      "generate an image",
      "create an image",
      "make a picture",
      "design a logo",
    ],
    weight: 0.7,
  },
  {
    agent: "tools",
    keywords: ["automate", "browser", "booking", "reservation", "scrape"],
    phrases: [
      "book a",
      "automate this",
      "browser automation",
      "scrape the website",
      "fill out the form",
    ],
    weight: 0.6,
  },
  {
    agent: "videos",
    keywords: ["video", "script", "storyboard", "film", "youtube"],
    phrases: [
      "write a script",
      "create a video",
      "video production",
      "youtube video",
    ],
    weight: 0.6,
  },
];

export function routeMessage(
  messageText: string,
  currentAgentType: AgentType
): RouteResult {
  const lower = messageText.toLowerCase();

  let bestMatch: RouteResult = {
    suggestedAgent: currentAgentType,
    confidence: 0,
    reason: "No strong match — staying with current agent",
  };

  for (const rule of ROUTING_RULES) {
    let score = 0;

    // Check phrases (higher signal)
    for (const phrase of rule.phrases) {
      if (lower.includes(phrase)) {
        score = Math.max(score, rule.weight + 0.1);
      }
    }

    // Check keywords (lower signal)
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) {
        score = Math.max(score, rule.weight);
      }
    }

    if (score > bestMatch.confidence && rule.agent !== currentAgentType) {
      bestMatch = {
        suggestedAgent: rule.agent,
        confidence: score,
        reason: `Message matches "${rule.agent}" agent capabilities`,
      };
    }
  }

  // Only suggest routing if confidence is above threshold
  if (bestMatch.confidence < 0.5) {
    return {
      suggestedAgent: currentAgentType,
      confidence: 0,
      reason: "No strong match — staying with current agent",
    };
  }

  return bestMatch;
}
