// ── Context Window Management ────────────────────────────────────────
// Prevents context_length_exceeded errors by proactively compacting
// conversation history when it approaches the model's limit.

interface Message {
  role: string;
  content: string | any[];
}

interface ContextConfig {
  contextWindow: number;
  maxOutputTokens: number;
}

interface CompactResult {
  messages: Message[];
  wasCompacted: boolean;
}

/**
 * Estimate token count using a ~4 chars/token heuristic.
 * Avoids expensive tiktoken dependency while being close enough
 * for budget decisions (typically within 10-15% of actual).
 */
export function estimateTokens(messages: Message[]): number {
  let totalChars = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      // Multi-part content (text + images, etc.)
      for (const part of msg.content) {
        if (typeof part === "string") {
          totalChars += part.length;
        } else if (part?.text) {
          totalChars += part.text.length;
        } else if (part?.type === "image") {
          // Images are ~85 tokens for low-res, ~765 for high-res
          totalChars += 1000;
        }
      }
    }
    // Add overhead for role, formatting tokens (~4 tokens per message)
    totalChars += 16;
  }

  return Math.ceil(totalChars / 4);
}

/**
 * Estimate tokens for a single string.
 */
export function estimateStringTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Compact conversation if it's approaching the context window limit.
 *
 * Strategy: if estimated tokens > 80% of available budget:
 * 1. Keep first 2 messages (establishes context/persona)
 * 2. Keep last N messages that fit in 70% of remaining budget
 * 3. Replace middle with a summary marker
 */
export function compactIfNeeded(
  messages: Message[],
  systemPrompt: string,
  config: ContextConfig
): CompactResult {
  if (!messages || messages.length <= 4) {
    return { messages, wasCompacted: false };
  }

  const systemTokens = estimateStringTokens(systemPrompt);
  const availableForMessages = config.contextWindow - config.maxOutputTokens - systemTokens;
  const messageTokens = estimateTokens(messages);

  // Only compact if we're using > 80% of the available budget
  const threshold = availableForMessages * 0.8;
  if (messageTokens <= threshold) {
    return { messages, wasCompacted: false };
  }

  // Budget: keep messages that fit in 70% of available space
  const targetBudget = availableForMessages * 0.7;

  // Always keep first 2 messages (usually user's opening + assistant response)
  const keepStart = Math.min(2, messages.length);
  const headMessages = messages.slice(0, keepStart);
  const headTokens = estimateTokens(headMessages);

  // Fill from the end with recent messages
  const remainingBudget = targetBudget - headTokens;
  const tailMessages: Message[] = [];
  let tailTokens = 0;

  for (let i = messages.length - 1; i >= keepStart; i--) {
    const msgTokens = estimateTokens([messages[i]]);
    if (tailTokens + msgTokens > remainingBudget) break;
    tailMessages.unshift(messages[i]);
    tailTokens += msgTokens;
  }

  const droppedCount = messages.length - keepStart - tailMessages.length;

  // Build compacted message array
  const compacted: Message[] = [
    ...headMessages,
    {
      role: "system",
      content: `[Earlier conversation compacted: ${droppedCount} messages summarized to fit context window. The conversation continued with the messages below.]`,
    },
    ...tailMessages,
  ];

  console.log(
    `[context-manager] Compacted: ${messages.length} → ${compacted.length} messages ` +
    `(dropped ${droppedCount}, est. ${messageTokens} → ${estimateTokens(compacted)} tokens)`
  );

  return { messages: compacted, wasCompacted: true };
}
