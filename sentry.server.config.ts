// Sentry for the Node.js server runtime. Off when SENTRY_DSN is unset (local dev, tests, CI).
import * as Sentry from "@sentry/nextjs";
import { SENTRY_DATA_COLLECTION, scrubBreadcrumb, scrubEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  release: process.env.RENDER_GIT_COMMIT,
  environment: process.env.SENTRY_ENVIRONMENT ?? "production",
  tracesSampleRate: 0.05, // the free plan's quota is small
  dataCollection: SENTRY_DATA_COLLECTION,
  beforeSend: (event) => scrubEvent(event),
  beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
});
