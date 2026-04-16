/**
 * Single entry point for reporting unexpected errors.
 *
 * Currently just logs to console with structured context. Designed so that
 * adding Sentry / Datadog / Axiom later is a one-file change — replace the
 * body here and every caller gets it.
 *
 * Usage:
 *   import { reportError } from "@/lib/observability/report-error";
 *   try { ... } catch (err) { reportError(err, { where: "my-tool", businessId }); }
 *
 * Do not use for expected user errors (validation, rate limits). Those should
 * return a structured API response, not trip an alarm.
 */

export interface ErrorContext {
  where: string;        // e.g. "chat/route", "outreachCron.processOutreachSequences"
  [key: string]: unknown;
}

export function reportError(err: unknown, ctx: ErrorContext): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  // Structured log — JSON in prod makes log aggregation trivial.
  if (process.env.NODE_ENV === "production") {
    console.error(
      JSON.stringify({
        level: "error",
        at: new Date().toISOString(),
        message,
        stack,
        ...ctx,
      })
    );
  } else {
    // Dev: human-readable
    console.error(`[${ctx.where}]`, message, ctx, stack);
  }

  // Future hook points:
  // - Sentry.captureException(err, { extra: ctx });
  // - datadogLogs.logger.error(message, ctx);
  // - axiom.ingest("errors", [{ ...ctx, message, stack, at: Date.now() }]);
}
