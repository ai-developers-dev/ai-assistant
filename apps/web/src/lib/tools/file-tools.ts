import { tool } from "ai";
import { z } from "zod";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

interface FileToolsConfig {
  organizationId: Id<"organizations">;
  projectId: Id<"projects">;
  convex: ConvexHttpClient;
}

const MAX_TEXT_SIZE = 50_000; // 50KB text limit to keep within context window
const CSV_PREVIEW_ROWS = 50; // Show first 50 rows for CSV files

/**
 * Parse CSV text into a structured preview (headers + rows).
 */
function parseCSVPreview(text: string): {
  headers: string[];
  rows: string[][];
  totalRows: number;
  truncated: boolean;
} {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [], totalRows: 0, truncated: false };
  }

  // Simple CSV parser — handles quoted fields with commas
  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = parseLine(lines[0]);
  const totalRows = lines.length - 1;
  const previewLines = lines.slice(1, CSV_PREVIEW_ROWS + 1);
  const rows = previewLines.map(parseLine);

  return {
    headers,
    rows,
    totalRows,
    truncated: totalRows > CSV_PREVIEW_ROWS,
  };
}

/**
 * Factory: creates a read_file tool bound to a Convex client and org/project IDs.
 * Reads files from Convex storage and returns their content to the model.
 */
export function createFileTools(config: FileToolsConfig) {
  const { convex } = config;
  const readFileTool = tool({
    description:
      "Read the contents of an uploaded file from project storage. Supports text files (.txt, .md, .json, .csv, .xml, .html, .css, .js, .ts, .py, etc.). " +
      "For CSV files, returns a structured preview with headers and rows. " +
      "For binary files (images, PDFs, etc.), returns file metadata only. " +
      "Use this when the user asks you to analyze, review, or work with a file they uploaded.",
    parameters: z.object({
      fileId: z
        .string()
        .describe("The Convex storage file ID to read (from the project's uploaded files)"),
    }),
    execute: async ({ fileId }) => {
      try {
        // Get file metadata from Convex
        const file = await convex.query(api.files.getById, {
          fileId: fileId as Id<"files">,
        });

        if (!file) {
          return {
            success: false,
            error: `File not found: ${fileId}. Make sure the file ID is correct and belongs to this project.`,
          };
        }

        const { name, mimeType, sizeBytes, url } = file;

        // For binary files, return metadata only
        const textTypes = [
          "text/",
          "application/json",
          "application/xml",
          "application/javascript",
          "application/typescript",
          "application/csv",
          "application/x-yaml",
        ];
        const isText =
          textTypes.some((t) => (mimeType || "").startsWith(t)) ||
          /\.(txt|md|csv|json|xml|html|css|js|ts|jsx|tsx|py|rb|sh|yaml|yml|toml|ini|cfg|log|sql|r|go|java|c|cpp|h|hpp|rs|swift|kt|dart)$/i.test(
            name || ""
          );

        if (!isText) {
          return {
            success: true,
            name,
            mimeType,
            sizeBytes,
            contentType: "binary",
            message: `This is a binary file (${mimeType || "unknown type"}). Cannot display raw content, but metadata is available.`,
          };
        }

        // Fetch the file content
        if (!url) {
          return {
            success: false,
            error: "File URL is not available. The file may still be processing.",
          };
        }

        const response = await fetch(url);
        if (!response.ok) {
          return {
            success: false,
            error: `Failed to fetch file content: HTTP ${response.status}`,
          };
        }

        let text = await response.text();
        const totalSize = text.length;
        let truncated = false;

        if (text.length > MAX_TEXT_SIZE) {
          text = text.slice(0, MAX_TEXT_SIZE);
          truncated = true;
        }

        // For CSV files, return structured data
        const isCSV =
          (mimeType || "").includes("csv") ||
          /\.csv$/i.test(name || "");

        if (isCSV) {
          const preview = parseCSVPreview(text);
          return {
            success: true,
            name,
            mimeType: mimeType || "text/csv",
            sizeBytes,
            contentType: "csv",
            headers: preview.headers,
            rows: preview.rows,
            totalRows: preview.totalRows,
            previewRows: preview.rows.length,
            truncated: preview.truncated || truncated,
            message: truncated
              ? `Showing first ${preview.rows.length} of ${preview.totalRows} rows (file truncated at ${MAX_TEXT_SIZE} chars).`
              : `Showing ${preview.rows.length} of ${preview.totalRows} rows.`,
          };
        }

        // For JSON files, try to parse for structure
        const isJSON =
          (mimeType || "").includes("json") ||
          /\.json$/i.test(name || "");

        if (isJSON) {
          try {
            const parsed = JSON.parse(text);
            return {
              success: true,
              name,
              mimeType: mimeType || "application/json",
              sizeBytes,
              contentType: "json",
              content: parsed,
              truncated,
              totalSize,
            };
          } catch {
            // Fall through to plain text
          }
        }

        // Plain text
        return {
          success: true,
          name,
          mimeType: mimeType || "text/plain",
          sizeBytes,
          contentType: "text",
          content: text,
          truncated,
          totalSize,
          message: truncated
            ? `File truncated to ${MAX_TEXT_SIZE} chars (total: ${totalSize} chars).`
            : undefined,
        };
      } catch (error: any) {
        console.error("[read_file] Error:", error);
        return {
          success: false,
          error: `Failed to read file: ${error.message?.slice(0, 500)}`,
        };
      }
    },
  });

  return { read_file: readFileTool };
}
