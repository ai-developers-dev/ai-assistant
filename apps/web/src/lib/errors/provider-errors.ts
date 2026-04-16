export type ErrorCategory =
  | "invalid_key"
  | "expired_key"
  | "rate_limit"
  | "insufficient_credits"
  | "model_not_found"
  | "content_filtered"
  | "context_length_exceeded"
  | "network_error"
  | "server_error"
  | "unknown";

export interface ClassifiedError {
  category: ErrorCategory;
  provider: string;
  userMessage: string;
  suggestion: string;
  httpStatus: number;
  retryable: boolean;
}

const ERROR_MESSAGES: Record<
  ErrorCategory,
  { userMessage: string; suggestion: string; httpStatus: number; retryable: boolean }
> = {
  invalid_key: {
    userMessage: "Your API key is invalid.",
    suggestion:
      "Check that your key is correct in Settings, or remove it to use the platform key.",
    httpStatus: 401,
    retryable: false,
  },
  expired_key: {
    userMessage: "Your API key has expired.",
    suggestion:
      "Generate a new key from your provider's dashboard and update it in Settings.",
    httpStatus: 401,
    retryable: false,
  },
  rate_limit: {
    userMessage: "Rate limit exceeded.",
    suggestion:
      "Wait a moment and try again, or switch to a different model.",
    httpStatus: 429,
    retryable: true,
  },
  insufficient_credits: {
    userMessage: "Insufficient credits or quota on your provider account.",
    suggestion:
      "Add billing info or credits to your provider account, or use a different model.",
    httpStatus: 402,
    retryable: false,
  },
  model_not_found: {
    userMessage: "The selected model is not available.",
    suggestion:
      "The model may have been deprecated or your account may not have access. Try a different model.",
    httpStatus: 404,
    retryable: false,
  },
  content_filtered: {
    userMessage: "Your request was blocked by the provider's content filter.",
    suggestion: "Rephrase your message and try again.",
    httpStatus: 400,
    retryable: false,
  },
  context_length_exceeded: {
    userMessage: "The conversation is too long for this model.",
    suggestion:
      "Start a new session or switch to a model with a larger context window.",
    httpStatus: 400,
    retryable: false,
  },
  network_error: {
    userMessage: "Could not reach the AI provider.",
    suggestion:
      "Check your internet connection and try again. The provider may be experiencing downtime.",
    httpStatus: 502,
    retryable: true,
  },
  server_error: {
    userMessage: "The AI provider returned a server error.",
    suggestion:
      "This is usually temporary. Wait a moment and try again, or switch to a different model.",
    httpStatus: 502,
    retryable: true,
  },
  unknown: {
    userMessage: "Something went wrong.",
    suggestion: "Try again, or switch to a different model.",
    httpStatus: 500,
    retryable: false,
  },
};

function categorizeByStatus(status: number): ErrorCategory | null {
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 429) return "rate_limit";
  if (status === 402) return "insufficient_credits";
  if (status === 404) return "model_not_found";
  if (status >= 500) return "server_error";
  return null;
}

function categorizeByMessage(message: string): ErrorCategory | null {
  const lower = message.toLowerCase();

  // Auth / key issues
  if (
    lower.includes("invalid api key") ||
    lower.includes("invalid x-api-key") ||
    lower.includes("incorrect api key") ||
    lower.includes("authentication") ||
    lower.includes("unauthorized") ||
    lower.includes("permission denied")
  ) {
    return "invalid_key";
  }

  if (lower.includes("expired") || lower.includes("revoked")) {
    return "expired_key";
  }

  // Rate limiting
  if (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("too many requests") ||
    lower.includes("quota exceeded")
  ) {
    return "rate_limit";
  }

  // Billing
  if (
    lower.includes("insufficient") ||
    lower.includes("billing") ||
    lower.includes("payment required") ||
    lower.includes("exceeded your current quota")
  ) {
    return "insufficient_credits";
  }

  // Model issues
  if (
    lower.includes("model not found") ||
    lower.includes("does not exist") ||
    lower.includes("not available") ||
    lower.includes("deprecated")
  ) {
    return "model_not_found";
  }

  // Content filtering
  if (
    lower.includes("content filter") ||
    lower.includes("content_filter") ||
    lower.includes("safety") ||
    lower.includes("blocked")
  ) {
    return "content_filtered";
  }

  // Context length
  if (
    lower.includes("context length") ||
    lower.includes("context_length") ||
    lower.includes("maximum.*tokens") ||
    lower.includes("too many tokens") ||
    lower.includes("token limit")
  ) {
    return "context_length_exceeded";
  }

  // Network
  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("etimedout") ||
    lower.includes("fetch failed") ||
    lower.includes("network")
  ) {
    return "network_error";
  }

  return null;
}

export function classifyProviderError(
  error: unknown,
  providerName: string
): ClassifiedError {
  const err = error as any;
  const message = err?.message || String(error);
  const status: number | undefined =
    err?.status || err?.statusCode || err?.response?.status;

  // Try HTTP status first
  let category: ErrorCategory | null = null;
  if (status) {
    category = categorizeByStatus(status);
  }

  // Fall back to message matching
  if (!category) {
    category = categorizeByMessage(message);
  }

  // Default to unknown
  if (!category) {
    category = "unknown";
  }

  const template = ERROR_MESSAGES[category];

  return {
    category,
    provider: providerName,
    userMessage: `${providerName}: ${template.userMessage}`,
    suggestion: template.suggestion,
    httpStatus: status || template.httpStatus,
    retryable: template.retryable,
  };
}
