/**
 * Embedding generation and text chunking utilities for the persistent memory system.
 * Uses OpenAI text-embedding-3-small (1536 dimensions) to match our Convex vector index.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generate a 1536-dimension embedding vector for a text string.
 * Requires OPENAI_API_KEY env var. Returns null if unavailable.
 */
export async function generateEmbedding(
  text: string
): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "[memory] OPENAI_API_KEY not set — skipping embedding generation"
    );
    return null;
  }

  // Truncate to ~8000 tokens (~32000 chars) to stay within model limits
  const truncated = text.slice(0, 32000);

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: truncated,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    console.error(
      `[memory] Embedding API error: ${response.status} ${errorText}`
    );
    return null;
  }

  const data = await response.json();
  return data.data?.[0]?.embedding ?? null;
}

/**
 * Split text into chunks of ~400 tokens (~1600 chars) with 80-token (~320 char) overlap.
 * Splits on paragraph boundaries first, then sentences.
 */
export function chunkText(text: string, maxChars = 1600): string[] {
  if (text.length <= maxChars) return [text];

  const overlapChars = 320;
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current.length > 0) {
      chunks.push(current.trim());
      // Keep overlap from end of current chunk
      current = current.slice(-overlapChars) + "\n\n" + para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  // If any chunk is still too large, split by sentences
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxChars) {
      finalChunks.push(chunk);
      continue;
    }
    const sentences = chunk.match(/[^.!?]+[.!?]+\s*/g) || [chunk];
    let sub = "";
    for (const sentence of sentences) {
      if (sub.length + sentence.length > maxChars && sub.length > 0) {
        finalChunks.push(sub.trim());
        sub = sub.slice(-overlapChars) + sentence;
      } else {
        sub += sentence;
      }
    }
    if (sub.trim()) finalChunks.push(sub.trim());
  }

  return finalChunks;
}
