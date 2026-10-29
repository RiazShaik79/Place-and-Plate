# 2026-10-29: Monitoring readiness (health check, JSON logs, Sentry, CI)

## Why

The app now runs on Render (Free) with MySQL on Aiven. A separate system, **Watchtower**, will watch it:
1. It groups errors into incidents and diagnoses them.
2. After the owner approves, it proposes fixes as pull requests.

To do that it needs to know whether the app is up, to read errors from the logs, and to rely on CI to check any fix. None of that existed. This change adds it without changing how any feature works.

## What changed

- **`GET /api/health`** (no sign-in):
  - runs `SELECT 1` through `lib/db.ts` with a 3 s limit
  - answers 200 `{status: "ok", db: "up", db_ms, version, uptime_s}`, or 503 `{status: "degraded", db: "down", code}`
  - `version` is the deployed commit (`RENDER_GIT_COMMIT`)
  - responses are never cached and never include hosts, URLs or error messages
  - it's the path Render's health check uses, and the endpoint Watchtower polls
- **Structured logs (`lib/log.ts`):** one JSON object per line (`ts`, `level`, `msg`, fields, and `err` as name, message, code and stack). The events are:

  | Event | Level | When |
  |---|---|---|
  | `request_failed` | error | Any unhandled server error, from `instrumentation.ts` `onRequestError`. Covers every route and page without touching route files. |
  | `db_connect_failed` | error | The pool or migrations failed on startup |
  | `db_query_failed` | error | A query failed. Duplicate-key errors are expected outcomes and are not logged. |
  | `slow_query` | warn | A query took longer than `SLOW_QUERY_MS` (default 1000). Only the first 200 characters of the SQL are logged, **never the parameters**. |
  | `health_db_down` | error | The health check couldn't reach the database |
  | `db_migrations_applied` | info | Replaces the old plain `console.log` |

- **Sentry (`@sentry/nextjs` 11.7, pinned):**
  - set up in `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` and `app/global-error.tsx`, with `next.config.ts` wrapped in `withSentryConfig`
  - **off unless `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set**, so local dev, tests and CI are unchanged
  - privacy: `dataCollection` turns off user info, cookies, bodies and secret headers. `lib/sentry-scrub.ts` masks emails, `token=` values, database URLs and PEM blocks, and **drops the console mailer's breadcrumbs**, which contain reset links.
  - no Session Replay and no User Feedback, and traces are sampled at 5%, to stay inside the free plan
- **`GET /api/debug/error`** (temporary). It throws one known error so the Sentry and log path can be tested end to end. It returns 404 unless **all** of these hold:
  - `DEBUG_ERROR_TOKEN` (32+ characters) is set
  - the request sends it in `x-debug-token`
  - the caller is signed in

  Unset the variable after testing. A double-gated chaos module will replace this route later.
- **CI (`.github/workflows/ci.yml`):**
  - **`ci`** runs typecheck and `test:quick` against a MySQL 8.4 service container on every PR and push to `main`. It's the check branch protection will require.
  - **`e2e`** runs the browser suites with Ubuntu's Chrome, for `fix/**` branches and on manual dispatch.
  - no Gemini, Places or Sentry keys exist in CI
- **`next` 16.4.0 → 16.4.3.** `npm audit` reported three advisories for 16.0.0–16.4.0: two critical unauthenticated remote code execution issues (Image Optimization with SVG, and `use cache` with typed arrays) and a Server Actions denial of service. 16.4.3 fixes them, and `npm audit` now reports 0 vulnerabilities.
- **`.env.example`** now exists (names only).

## Decisions

- **One error hook, not per-route try/catch.** `onRequestError` sees every unhandled server error with its route, so route files stay as they were.
- **Logs are the main signal, and Sentry is for people.** Sentry's free plan has no API or webhooks, so Watchtower reads Render's logs. The JSON shape is the contract between the two.
- **The mailer is unchanged.** The tests read emailed links from the server log, and on Render the console is the only delivery path for now.
- **Known risk:** reset and verification links, which carry tokens, and email addresses are printed to Render's logs. Watchtower scrubs them before storing or sending anything. The real fix is a mail provider (roadmap item 2).

## Tests

- `tests/unit/log.test.ts` covers the line shape, dropped undefined values, reserved keys and error serialisation.
- `tests/unit/sentry-scrub.test.ts` covers masked text, stripped events and dropped mailer breadcrumbs.
- `tests/api/health.test.mjs` checks:
  - the health route returns 200 with `no-store` and no leaks
  - the debug route is 404 both anonymously and signed in when the variable is unset

## Owner steps after merge

1. Create the Sentry project, then set these on Render: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT`.
2. On Render, set the Health Check Path to `/api/health`.
3. Set `DEBUG_ERROR_TOKEN`, call `/api/debug/error` once while signed in, confirm the error shows in Sentry and the Render logs, then unset the variable.
