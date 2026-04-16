import { tool } from "ai";
import { z } from "zod";

const MIME_TYPES: Record<string, Record<string, string>> = {
  code: {
    typescript: "text/typescript",
    javascript: "text/javascript",
    python: "text/x-python",
    html: "text/html",
    css: "text/css",
    json: "application/json",
    sql: "text/x-sql",
    yaml: "text/yaml",
    markdown: "text/markdown",
    default: "text/plain",
  },
  document: { default: "text/markdown" },
  spreadsheet: { default: "text/csv" },
  html: { default: "text/html" },
  slides: { default: "text/markdown" },
  diagram: { default: "text/plain" },
  other: { default: "text/plain" },
};

function getMimeType(type: string, language?: string): string {
  const group = MIME_TYPES[type] || MIME_TYPES.other;
  if (language && group[language]) return group[language];
  return group.default || "text/plain";
}

// ─── Server-side content cache ───────────────────────────────────────
// The full artifact content is cached here so we DON'T send 50KB+ HTML
// back through the AI SDK data stream (which also sends it back to the
// model as tool-result context and kills the connection).
// The route's onFinish callback reads from this cache to persist to Convex.
const CONTENT_CACHE = new Map<string, string>();
let cacheCounter = 0;

export function getArtifactContent(cacheId: string): string | undefined {
  return CONTENT_CACHE.get(cacheId);
}

export function clearArtifactContent(cacheId: string): void {
  CONTENT_CACHE.delete(cacheId);
}

// Preview limit sent through the stream (keeps chunks small)
const STREAM_PREVIEW_LIMIT = 800;

// ─── Extract HTML from model text output ─────────────────────────────
// When the model writes HTML in a ```html code fence and then calls
// save_artifact without inline content, we pull the HTML from the text.
function extractHtmlFromText(text: string): string | undefined {
  // 1. Try ```html ... ``` fenced code block (most reliable)
  const fenceMatch = text.match(/```html\s*\n([\s\S]*?)\n```/);
  if (fenceMatch?.[1]?.trim()) return fenceMatch[1].trim();

  // 2. Fallback: bare <!DOCTYPE html> ... </html> block
  const rawMatch = text.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
  if (rawMatch?.[1]?.trim()) return rawMatch[1].trim();

  return undefined;
}

// ─── Factory: creates a save_artifact tool bound to a text accumulator ─
// The text accumulator collects the model's text output during streaming.
// If the model omits the content arg (or sends a short placeholder),
// the execute function extracts the real content from the accumulated text.
export function createSaveArtifactTool(textAccumulator?: { current: string }) {
  return tool({
    description:
      "Save generated content (code files, documents, spreadsheets, HTML pages, slide decks) as a downloadable artifact. Use this whenever you create substantial content that the user would want to download, copy, or reference later. Give it a descriptive filename with the appropriate extension. For large HTML files: write the HTML in a ```html code block in your text response, then call this tool with just the title and type — the server will extract the HTML automatically.",
    parameters: z.object({
      title: z
        .string()
        .describe(
          "Filename with extension (e.g. 'report.md', 'app.tsx', 'data.csv', 'index.html')"
        ),
      type: z
        .enum([
          "code",
          "document",
          "spreadsheet",
          "html",
          "slides",
          "diagram",
          "other",
        ])
        .describe("The type of artifact being saved"),
      language: z
        .string()
        .optional()
        .describe(
          "Programming language or format (e.g. 'typescript', 'python', 'markdown', 'csv')"
        ),
      content: z
        .string()
        .optional()
        .describe(
          "The full content of the artifact. For HTML websites, OMIT this field — write the HTML in a ```html code block instead and the server extracts it automatically."
        ),
    }),
    execute: async ({ title, type, language, content }) => {
      let actualContent = content || "";

      // If content is missing or looks like a placeholder (short, not real HTML),
      // try to extract the real content from the model's text output.
      const looksLikePlaceholder =
        !content ||
        (content.length < 500 &&
          !content.includes("<!DOCTYPE") &&
          !content.includes("<html"));

      if (looksLikePlaceholder && textAccumulator?.current) {
        const extracted = extractHtmlFromText(textAccumulator.current);
        if (extracted) {
          console.log(
            `[save_artifact] Extracted ${extracted.length} chars of HTML from text output`
          );
          actualContent = extracted;
        }
      }

      if (!actualContent) {
        return {
          __artifact: false,
          error: "No content provided and no HTML found in text output.",
        };
      }

      const mimeType = getMimeType(type, language);
      const sizeBytes = new TextEncoder().encode(actualContent).length;

      // Cache full content server-side so we keep the stream payload small.
      const cacheId = `artifact_${++cacheCounter}_${Date.now()}`;
      CONTENT_CACHE.set(cacheId, actualContent);

      // Send a truncated preview through the stream
      const preview =
        actualContent.length > STREAM_PREVIEW_LIMIT
          ? actualContent.slice(0, STREAM_PREVIEW_LIMIT) +
            `\n\n... (${Math.round(sizeBytes / 1024)}KB total)`
          : actualContent;

      return {
        __artifact: true,
        _cacheId: cacheId,
        title,
        type,
        language: language || undefined,
        content: preview,
        fullSize: sizeBytes,
        mimeType,
        sizeBytes,
      };
    },
  });
}

// Static export for backwards compatibility (no text extraction)
export const saveArtifactTool = createSaveArtifactTool();
