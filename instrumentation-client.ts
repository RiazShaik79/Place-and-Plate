// Sentry in the browser. Off when NEXT_PUBLIC_SENTRY_DSN is unset at build time. No Session Replay
// or User Feedback, to stay inside the free plan's quota.
import * as Sentry from "@sentry/nextjs";
import { SENTRY_DATA_COLLECTION, scrubBreadcrumb, scrubEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
  tracesSampleRate: 0.05,
  dataCollection: SENTRY_DATA_COLLECTION,
  beforeSend: (event) => scrubEvent(event),
  beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
