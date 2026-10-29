// Next.js server instrumentation: loads Sentry for the running runtime, and turns every unhandled
// server error (routes, pages, server actions) into one structured log line plus a Sentry event.
import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import { log } from "@/lib/log";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  log.error("request_failed", {
    route: context.routePath,
    kind: context.routeType,
    method: request.method,
    digest: (err as { digest?: string })?.digest,
    err,
  });
  Sentry.captureRequestError(err, request, context);
};
