# Plate & Pace

A web app for logging food against a daily calorie goal (macros, meal categories), logging exercise,
steps, water and weight, and seeing trends on a dashboard. Each person has an account; their data is
private to it. Everything lives in **MySQL** (moved from SQLite on 2026-10-16). The name lives in
`lib/brand.ts` (`APP_NAME`); the cookies keep their original internal names (`ct_session`, …).

## Where things are documented

This file holds what applies everywhere. Each main folder has its own `CLAUDE.md`, loaded when you
work there:

| File | Covers |
| --- | --- |
| `components/CLAUDE.md` | Every page and feature in detail, state owners, charts, UI patterns |
| `app/api/CLAUDE.md` | Route conventions and request/response shapes, AI and Places routes |
| `lib/CLAUDE.md` | Data model and migrations, `db.ts` patterns, auth/sessions, history, goals maths |
| `tests/CLAUDE.md` | How `npm test` works and how to add tests |

Decision history is in `docs/YYYY-MM-DD-*.md`; what's built and the roadmap are in `PLAN.md`.
**Writing these files:** rules that apply everywhere go here; reference detail goes in the folder's
file; the why goes in `docs/`. Keep each file focused rather than to a line count.

## Features at a glance

- **Accounts**: register, sign in ("Keep me signed in", "Welcome back"), email verification, password
  reset, sign out. **Home is the Dashboard** (`HOME_PATH`).
- **Food** (`/`): kcal left vs goal, meal-split bar, macros, water card, meal cards (edit, Same as
  yesterday), add panel: Recent / Search / Describe (AI) / Photo (AI).
- **Activity** (`/exercise`; the tab was "Exercise"): kcal burned, active minutes, steps, weight and
  **sleep** cards (log them here), 7-day strip; add exercise: Search / Describe (AI).
- **Dashboard** (`/dashboard`, view only): Daily = today's numbers as cards (incl. last night's sleep);
  Weekly / Monthly = overview, exercise charts, a carousel of food / steps / water / weight / sleep
  charts, macros, table.
  Every card shows its period ("Today", "Last 12 weeks"…).
- **Account** (`/account`): profile, body and goals with a suggested calorie goal, address, password.

## Running

Node.js 22.6+ (Node 24) and **MySQL** (Windows service `MySQL267`, port 3306). `npm install`,
`npm run db:migrate`, `npm run dev` (:3000), `npm run typecheck`, **`npm test`** (unit + API + browser,
~8 min) or `npm run test:quick` (unit + API). DB setup as root: `CREATE DATABASE plate_and_pace
CHARACTER SET utf8mb4;` + a user with SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES.

> Node isn't on PATH here: in PowerShell first run `$env:Path = "C:\Program Files\nodejs;$env:Path"`.

**Stack:** Next.js 16 (App Router) + React 19, TypeScript strict, Tailwind v4 (tokens in
`app/globals.css`), Figtree, MySQL via `mysql2` (plain SQL), Gemini and Google Places REST via `fetch`.
No ORM, state, AI SDK, auth, chart or icon library (charts are inline SVG; icons `components/Icons.tsx`).

## Environment variables (`.env`, restart after editing)

| Variable              | Required        | Purpose                                                             |
| --------------------- | --------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`        | **Yes**         | `mysql://user:password@127.0.0.1:3306/plate_and_pace` (URL-encode `@ : / # %` in the password) |
| `GEMINI_API_KEY`      | For AI          | Google AI Studio key; server-side only                              |
| `GEMINI_MODEL`        | No              | Pin one model (default: try `gemini-2.5-flash-lite`, then `gemini-3.5-flash-lite`) |
| `GOOGLE_MAPS_API_KEY` | For address search | Google Cloud key with **Places API (New)** enabled and **billing on**; restrict it to that API. Server-side only |
| `APP_URL`             | No              | Origin for reset links (default: the request's origin)              |
| `DATABASE_CA_CERT`    | When the URL has `ssl-mode=REQUIRED` (e.g. Aiven) | The provider's CA certificate (PEM). `lib/db.ts` turns `ssl-mode` into a verified TLS connection; missing → a clear startup error |
| `TEST_DATABASE_URL`   | No              | A separate database for `npm test` (default: `DATABASE_URL` with throwaway `@example.com` accounts) |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | No (hosted) | Sentry for the server / the browser (the public one is read at build time). Unset = Sentry off |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | No (hosted) | Source-map upload during the Render build only |
| `SLOW_QUERY_MS`       | No              | Log queries slower than this (default 1000) as `slow_query` |
| `LOG_FORMAT`          | No              | `pretty` for readable local logs; JSON lines otherwise |
| `DEBUG_ERROR_TOKEN`   | No              | Temporary, 32+ chars: enables `/api/debug/error` for one Sentry/log test. Unset afterwards |
| `CHAOS_MODE` / `CHAOS_TOKEN` | No       | Watchtower test sessions only: `enabled` + a 32+ char token turn on `/api/chaos/*` (seeded bugs). Unset afterwards |

`.env.example` lists every name. **Hosting:** Render (Free web service, auto-deploys `main`, health
check `/api/health`) with MySQL on Aiven. **CI:** `.github/workflows/ci.yml` runs typecheck +
`test:quick` against a MySQL container on every PR (`ci`, the required check) and browser tests on
`fix/**` branches (`e2e`).

## Folder structure

```
app/          page.tsx (Food), exercise/, dashboard/, account/; auth pages; api/ (see app/api/CLAUDE.md)
components/   pages' state owners and UI (see components/CLAUDE.md)
lib/          db.ts (the only DB access), auth, goals, history, gemini, places… (see lib/CLAUDE.md)
db/migrations/NNN_*.sql   Schema, applied in order, recorded in `schema_migrations`
scripts/      db-migrate.mjs (npm run db:migrate); migrate-sqlite-to-mysql.mjs (one-time copy, done)
tests/        run.mjs (npm test); helpers/; unit/ api/ e2e/ review/ (see tests/CLAUDE.md)
docs/         Decision logs        PLAN.md   Built / improved / roadmap
```

## Design system

- Tokens only (`paper`, `surface`, `sunken`, `line`, `ink`, `muted`, `faint`, `basil`, `ok`/`near`/`over`,
  `protein`/`carbs`/`fat`, `ai`). Macro colours were validated with the dataviz script (CVD-safe, 3:1).
  Status colours (`ok`/`near`/`over`) are for goal status only.
- Radii: panels 20px, cards 12px, controls and chips fully rounded. Sentence case, plain verbs,
  no all-caps, no `·` meta strings, no arrows in buttons. Colour is never the only signal.
- **Charts:** one y-axis (never dual), solid hairline grid, bars ≤ 24px with 4px rounded tops,
  reference lines named in the legend as a line key (never drawn over bars), x-labels thinned from
  the newest column, a hover/focus tooltip on each mark, and a table view of every value.
- One bold element per page: meal bar (food), 7-day strip (exercise), hero average (dashboard).

## Conventions

- Every API route except `/api/auth/*` and `/api/health` starts with `requireUser()` and scopes by
  `user.id`; pages use `getCurrentUser()` + `redirect()`. Errors return `{ error, field }`, shown under
  that field.
- Server logs go through `log` (`lib/log.ts`, one JSON line each); unhandled server errors are logged
  and sent to Sentry by `instrumentation.ts`, so routes don't need try/catch for that. Never log
  passwords, tokens, query parameters or request bodies. Keep `lib/mailer.ts`'s console format: the
  tests read emailed links from it.
- Client calls use `apiFetch` (401 → sign-in). Sign-out flushes pending Undo deletes first.
- Catalogue items: the server computes values. AI and Places results: the user confirms, the server
  range-checks. Repeats and edits copy/rescale stored rows; the client never sends nutrition numbers.
- "Today" is computed on the client (the user's local day) and sent to the server. Route files export
  only handlers; shared constants go in `lib/`.
- DB access only through `lib/db.ts`; never import it from client components. Schema changes are a
  new migration file, never an edit to an applied one.
- Never show numbers for a day that didn't load.
- **Run `npm run test:quick` after every change and `npm test` before finishing a feature**; add tests
  for new routes and pages.

## Gotchas

- `gemini-2.5-flash-lite` 404s for this key ("no longer available to new users"); the client falls
  back to `gemini-3.5-flash-lite`. AI and Places calls cost quota: never call them in loops or tests.
- This laptop's IT policy disables the browser password manager, hence "Welcome back" pre-fill.
- Places is called from the server, which sends no referrer: a key with a website (HTTP referrer)
  restriction gets 403 "Requests from referer <empty> are blocked". Use Application restriction
  None (local) or IP addresses (hosted). Address searches are capped at 60 per user per 10 minutes.
- After adding exports to `lib/`, restart `npm run dev` if a page sees an export as undefined.
- OneDrive can lock `.next/static/<id>` (`EPERM` on build): `attrib -R` it, delete it, rebuild.
  (`npm test` does this itself for its `.next-test` folder.)
- Throttles are in memory. Reset all data: `DROP DATABASE plate_and_pace; CREATE DATABASE …` as root,
  then `npm run db:migrate`. The old SQLite file and its backups stay in `data/` (rollback only).
- "DATABASE_URL is not set" or `ER_ACCESS_DENIED_ERROR` / `ER_DBACCESS_DENIED_ERROR`: the `.env`
  line isn't saved, the password doesn't match `CREATE/ALTER USER`, or the user lacks the GRANT.

## Next Steps

- **Hosting follow-ups (Render + Aiven, deployed).** A real mail provider in `lib/mailer.ts` (reset
  and verification links currently land in Render's logs); throttles in Redis; auth hardening as needed.
- **Food history charts.** Custom date range, per-meal / per-food breakdowns, CSV export.
- **User preferences.** Macro split, units (kcal/kJ, kg/lb), meal names, eat-back exercise, dark mode.
- **Barcode scanning.** `BarcodeDetector` where available + Open Food Facts lookup.
- Also queued: steps estimated from walks; custom foods; step sync (Apple Health, Google Fit);
  editing past weigh-ins; sleep insights (bedtime consistency, sleep vs next-day intake); browser
  tests on every PR in CI; timestamps as `DATETIME`.
