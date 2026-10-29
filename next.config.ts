import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // `npm test` builds into .next-test so it never touches the .next a running dev server uses.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

// Source maps upload to Sentry only when SENTRY_AUTH_TOKEN is set (the Render build); otherwise the
// build is unchanged.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  telemetry: false,
});
