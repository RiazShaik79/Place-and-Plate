# tests/: how `npm test` works

Read the root `CLAUDE.md` first. The full write-up is `docs/2026-10-17-tests-in-repo.md`.

## Commands

| Command | What runs |
| --- | --- |
| `npm test` | unit, then API and browser suites against a fresh production build (~8 min) |
| `npm run test:quick` | unit + API (~1 min plus the build) |
| `npm run test:e2e` | browser suites only |
| `npm test -- water` | only files whose name contains "water" (combine with `--only api`, `--no-build`) |
| `npm run test:screens` | `review/` screenshot walkthroughs, for design reviews |

Screenshots and the server log go to `tests/.output/` (git-ignored).

## What the runner does (`run.mjs`)

1. **Loads `.env`** and uses `TEST_DATABASE_URL`, or else `DATABASE_URL`. It fails fast with a
   readable message if MySQL refuses the connection.
2. **Unit tests:** `node --test` on `unit/*.test.ts`, with `helpers/register.mjs`. Node 24 strips the
   types, and `ts-hooks.mjs` resolves `@/…` and extensionless imports.
3. **Build and serve:**
   - builds into **`.next-test`** (`NEXT_DIST_DIR`, read by `next.config.ts`), so a running
     `npm run dev` is never touched
   - clears OneDrive locks first
   - serves on **:3100** (`TEST_PORT`) with **`GEMINI_API_KEY` and `GOOGLE_MAPS_API_KEY` blanked**,
     so tests never spend quota
4. **Runs** `api/` then `e2e/`, one file at a time (`--test-concurrency=1`).
5. **Always cleans up:** deletes `@example.com` users (their rows cascade), stops the server, prints a
   summary, and exits non-zero on any failure.

## Writing tests

- **Unit** (`unit/<area>.test.ts`):
  - plain `node:test` + `assert`, importing `@/lib/...`
  - for pure functions only: no database, no server
- **API** (`api/<area>.test.mjs`):
  - wrap the body in `suite("Area: what it covers", async () => { … })` from `helpers/checks.mjs`
  - use `check(label, condition, extra)`. Every check runs, and the suite fails at the end listing
    all failures.
  - `helpers/http.mjs` has `client()` (keeps its session cookie), `daysAgo`, `near` and `linkFor`
    (emailed links from the server log)
  - `helpers/db.mjs` sets up state the API can't
- **Browser** (`e2e/<page>.test.mjs`):
  - `const page = await openBrowser()` (`helpers/browser.mjs`: headless Chrome over DevTools, no
    Playwright); always `page.close()` in `finally`
  - the page has `goto`, `click`, `clickText`, `type`, `key`, `eval`, `waitFor`, `shot`,
    `overflow()` and `consoleErrors`
  - check desktop (1440×900) and mobile (390×844)
  - check no horizontal overflow and no console errors
- **Rules:**
  - Use **`@example.com`** emails, so the runner can delete the accounts.
  - **Mock `/api/ai/*` and `/api/places/*` in the page** (override `window.fetch`); the test server
    has no keys anyway.
  - React's `onPointerEnter` doesn't fire from a synthetic `pointerenter`. Use `.focus()` or a real
    `page.click`.
  - To set a controlled `<select>` or `<input>`, use the native value setter plus an
    `input`/`change` event.

## Requirements

- MySQL reachable.
- Chrome or Edge. It's found automatically, or set `CHROME_PATH`.
- Port 3100 free.
- **Optional separate database:** create `plate_and_pace_test` as root, grant the app user the same
  privileges, and set `TEST_DATABASE_URL`.
