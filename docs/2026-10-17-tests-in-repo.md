# 2026-10-17: Tests in the project (`npm test`)

## Why

Every feature so far was checked with API and browser scripts kept in a temporary folder. They
would have disappeared with the session that wrote them. They now live in `tests/` and run with
one command, so any change can be checked the same way.

## How to run

| Command | What runs | Time |
|---|---|---|
| `npm test` | unit, API, browser | about 10 min (mostly browser) |
| `npm run test:quick` | unit + API | about 2 min plus the build |
| `npm run test:e2e` | browser only | about 8 min |
| `npm test -- water` | only files whose name contains "water" | |
| `npm test -- --no-build` | reuse the last test build | |
| `npm run test:screens` | screenshot walkthroughs (`tests/review/`), for design reviews | |

Screenshots and the test server's log go to `tests/.output/`, which is git-ignored.

## Decisions

- **No new dependencies:**
  - The tests use Node's built-in `node:test`.
  - The browser tests use a ~200-line headless-Chrome driver (`tests/helpers/browser.mjs`) over the
    DevTools protocol, instead of Playwright and its browser download.
  - The unit tests import `lib/*.ts` directly. Node 24 strips the types, and
    `tests/helpers/ts-hooks.mjs` resolves `@/…` and extensionless imports the way the app does.
- **A real production build, kept separate:**
  - `npm test` builds into `.next-test` (`NEXT_DIST_DIR`, read by `next.config.ts`) and serves it
    on port 3100.
  - The `.next` used by `npm run dev` on port 3000 is never touched, so the dev server keeps
    working during a run.
  - On Windows the runner first clears OneDrive's read-only marks in the build folder.
- **Tests never spend AI or Places quota:**
  - The test server starts with `GEMINI_API_KEY` and `GOOGLE_MAPS_API_KEY` blanked.
  - Browser tests mock `/api/ai/*` and `/api/places/*` inside the page.
  - The old opt-in check that made real Gemini calls was removed.
- **Database:**
  - **Default:** tests use `DATABASE_URL` with throwaway `@example.com` accounts. The runner deletes
    them at the end, and their rows cascade. Other accounts are never touched.
  - **Optional separate test database:** set `TEST_DATABASE_URL` in `.env`, after running once as
    MySQL root:
    ```sql
    CREATE DATABASE plate_and_pace_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
    GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON plate_and_pace_test.* TO 'platepace_app'@'localhost';
    ```
    The schema is created on the test server's first query, as in production.
- **Soft checks:**
  - API and browser suites keep their `check(label, condition)` style (`tests/helpers/checks.mjs`).
  - Every check runs; a suite fails at the end and lists *every* failed check, so one failure
    never hides the rest.
- **Emailed links:**
  - The console mailer prints mail to the server log.
  - Tests read links from `tests/.output/server.log` (`linkFor()` in `tests/helpers/http.mjs`).

## Layout

```
tests/
  run.mjs           the runner (build, start server, run phases, clean up, summary)
  helpers/          checks, http, db, browser, server, ts-hooks/register
  unit/*.test.ts    lib/ functions: nutrition, history, foods + exercises, account
  api/*.test.mjs    auth, reset-exercise, remember, dashboard, verify, race, water, recent
  e2e/*.test.mjs    landing, verify, device, rename, account, exercise-states, dashboard,
                    first-day, water, periods, recent
  review/*.test.mjs whole, accounts, exercise (screenshots only)
```

## Adding a test

- **A `lib/` function:** add a `test(...)` to the matching `tests/unit/*.test.ts`. Import with
  `@/lib/...`.
- **A route:** create `tests/api/<area>.test.mjs`:
  ```js
  import { check, suite } from "../helpers/checks.mjs";
  import { client } from "../helpers/http.mjs";
  suite("Area: what it covers", async () => {
    const a = client();
    await a("/api/auth/register", { method: "POST", body: { name: "T", email: `t.${Date.now()}@example.com`, password: "a good password" } });
    const r = await a("/api/...");
    check("does the thing", r.status === 200, JSON.stringify(r.json));
  });
  ```
- **A page:** create `tests/e2e/<page>.test.mjs` with `openBrowser()` from `../helpers/browser.mjs`.
  - Use `@example.com` emails.
  - Mock `/api/ai/*` in the page.
  - Check `page.consoleErrors` and `page.overflow()`.

## Requirements

- MySQL reachable through `DATABASE_URL` (or `TEST_DATABASE_URL`).
- Chrome for the browser tests. The standard Windows, macOS and Linux paths are found
  automatically, or set `CHROME_PATH`. Edge works too.
- Port 3100 free (or set `TEST_PORT`).

## Results

- **Full `npm test` runs (production build, MySQL):** all passed, in 7–8½ minutes.
- **Unit:** 35 tests in 5 files (nutrition, history, foods and exercises, account, goals), all passing.
- **API:** 9 suites.
  - auth 46, reset and exercise 43, "Keep me signed in" 14, dashboard 42, verification 34
  - race 6, water 37, recent 44, weight 33
  - `places: not configured → 503` now passes, because the test server has no Places key.
- **Browser:** 13 suites, desktop and mobile.
  - landing 9, verification 15, welcome back 23, rename 19, account 16, exercise states 13
  - dashboard 23, first day 7, water 35, periods 13, recent 43, weight 35
- **Total:** 556 of 556 suite checks, plus the 35 unit tests.
- **Fixes made while moving the tests in:**
  - **Overflow checks didn't check anything:** in four browser suites they only printed a line, and
    now they fail the suite on horizontal overflow.
  - **Dashboard suite:** it now checks the no-Places-key path (search hidden, typed address saves)
    instead of a mocked search box.
  - **Real-AI checks removed:** an opt-in check that called Gemini for real is gone.
- **Your dev server** on :3000 kept answering during the runs, because tests build into `.next-test`.
  - Next added `.next-test/types` to `tsconfig.json`'s `include` by itself, which is harmless.
