import { logger } from "@/lib/logger";

/**
 * Central error capture for server code. Always logs a structured error line;
 * if ERROR_WEBHOOK_URL is set it also forwards the JSON payload to that webhook
 * (Slack/Datadog/etc.), fire-and-forget. Adding another sink (e.g. Sentry) is a
 * small change here.
 */
/** Best-effort extraction of a human-readable message from any thrown value. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const o = error as Record<string, unknown>;
    // Common shapes: { message }, { error: { message, http_code } } (Cloudinary/SDKs)
    if (typeof o.message === "string" && o.message) return o.message;
    const nested = o.error as Record<string, unknown> | undefined;
    if (nested && typeof nested.message === "string" && nested.message) {
      return nested.http_code
        ? `${nested.message} (http ${String(nested.http_code)})`
        : nested.message;
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") return json;
    } catch {
      /* fall through */
    }
  }
  return String(error);
}

export function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const err =
    error instanceof Error ? error : new Error(messageOf(error));
  logger.error(err.message, {
    ...context,
    name: err.name,
    stack: err.stack,
  });

  const webhook = process.env.ERROR_WEBHOOK_URL;
  if (webhook) {
    try {
      void fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: err.message,
          name: err.name,
          stack: err.stack,
          context: context || {},
          at: new Date().toISOString(),
        }),
      }).catch(() => {});
    } catch {
      /* never let telemetry break the request */
    }
  }
}
