/**
 * Fire webhook for a given event. Non-blocking, non-fatal.
 * Called from API routes after lead events occur.
 */
export async function fireWebhooks(
  webhooks: Array<{ event: string; url: string; enabled: boolean }> | undefined,
  event: string,
  payload: Record<string, any>
) {
  if (!webhooks || webhooks.length === 0) return;

  const matching = webhooks.filter((w) => w.enabled && w.event === event);
  if (matching.length === 0) return;

  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  // Fire all webhooks in parallel, don't await — non-blocking
  for (const webhook of matching) {
    fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(10000),
    }).catch(() => {
      // Silently fail — webhook delivery is best-effort
    });
  }
}
