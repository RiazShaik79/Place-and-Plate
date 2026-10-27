# 2026-10-16: From SQLite to MySQL

## Why

The app stored everything in a local SQLite file (`data/calorie-tracker.db`) through Node's built-in
`node:sqlite`. MySQL Server 26.7 (Community) was installed as the Windows service `MySQL267` on
port 3306, and the app now uses it. That's also a step towards hosting: a hosted MySQL works the
same way.

## Decisions

- **Driver:** `mysql2` (promise API) with plain SQL, the same style as before. No ORM.
- **Replace, don't dual-run:** SQLite is no longer used by the app. The SQLite file and its backups
  stay in `data/` as the rollback.
- **The app connects as its own user,** not root. That user has only
  `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES` on `plate_and_pace`.
- **Same value formats:**
  - `date` stays a `CHAR(10)` 'YYYY-MM-DD' string (the user's local day).
  - Timestamps stay ISO-8601 UTC strings (`VARCHAR(30)`).
  - Comparisons, sorting and every API response are unchanged.
  - Switching to `DATETIME` is a possible later migration.
- **Versioned migrations instead of startup checks:**
  - Each `db/migrations/NNN_*.sql` runs once and is recorded in `schema_migrations`.
  - `001_initial.sql` is the full schema as it stood at the move.
  - The SQLite-only upgrade code (column checks, meal backfill, "first account adopts old data")
    was removed.

## Type mapping

| SQLite | MySQL |
|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `INT UNSIGNED AUTO_INCREMENT PRIMARY KEY` |
| `REAL` | `DOUBLE` |
| flags and counts (`remember`, `steps`, `calorie_goal`) | `TINYINT(1)` / `INT` |
| `token_hash TEXT PRIMARY KEY` | `CHAR(64)` |
| `email TEXT UNIQUE` | `VARCHAR(254)` + unique index (case-insensitive collation; emails are lower-cased anyway) |
| other text | `VARCHAR(16…255)`; `address` stays `TEXT` holding JSON |
| `log_entries.user_id` (nullable, pre-accounts) | `NOT NULL` (all rows had owners) |

## Code changes

- **Connection (`lib/db.ts`):**
  - one mysql2 pool from `DATABASE_URL`, cached on `globalThis` for dev hot reload
  - options: `decimalNumbers`, `dateStrings` and `timezone: "Z"`
  - migrations run once per process, before the first query
  - a missing `DATABASE_URL` fails with a clear message
- **Async functions:** every function is now `async`, with the same names, arguments and return
  types.
- **SQL differences:**
  - `RETURNING *` isn't available in MySQL, so writes insert or update and then read the row back
    by id (inside the same transaction where it matters).
  - `ON CONFLICT … DO UPDATE` became `ON DUPLICATE KEY UPDATE`.
- **Stronger under concurrency:**
  - **Confirming an email link and completing a password reset** run in one transaction with the
    token row locked (`SELECT … FOR UPDATE`). Two clicks at once give one success and one "already
    used". `completePasswordReset` now returns whether it won, and `/api/auth/reset` answers
    "already used" if it didn't.
  - **Two sign-ups for the same email at once:** the unique index decides, and the duplicate-key
    error becomes the normal "already exists".
- **Callers:**
  - **25 files** now wait for each database call (41 places): every API route,
    `app/page.tsx`, `app/account/page.tsx`, `app/reset-password/page.tsx`, `lib/auth.ts` and
    `lib/verification.ts`.
  - **Typecheck caught 4 calls** that `await` applied to the wrong part of, e.g.
    `await getSettings(id).calorieGoal`. They're fixed as `(await getSettings(id)).calorieGoal`.
- **Build:** `mysql2` builds with Next 16 without any `serverExternalPackages` setting.

## Setup that was needed (done)

1. **As MySQL root:**
   - `CREATE DATABASE plate_and_pace CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`
   - `CREATE USER 'platepace_app'@'localhost' …`
   - `GRANT … ON plate_and_pace.*`
2. **In `.env`:** `DATABASE_URL=mysql://platepace_app:<password>@127.0.0.1:3306/plate_and_pace`
3. **Problems hit on the way, now listed in CLAUDE.md Gotchas:**
   - the `.env` line wasn't saved
   - the password didn't match the one set in MySQL (`ER_ACCESS_DENIED_ERROR`)
   - the user had no grant on the database (`ER_DBACCESS_DENIED_ERROR`: only `USAGE`)

## The data copy (`npm run db:copy-from-sqlite`)

The script works in this order:
1. Apply the schema.
2. Refuse to run if MySQL already has data (unless `--force`).
3. Back up the SQLite file.
4. Copy every table in foreign-key order with the same ids, in one transaction.
5. Set `AUTO_INCREMENT` past the copied ids.
6. Check row counts and per-user totals, rolling back on any mismatch.

SQLite is opened read-only.

**The report:**

```
Table                 SQLite  MySQL
PASS  users                    2      2
PASS  sessions                 1      1
PASS  password_resets          0      0
PASS  email_verifications      0      0
PASS  log_entries              9      9
PASS  exercise_entries         1      1
PASS  daily_steps              0      0
PASS  per-user kcal eaten: user 1 1667, user 99 165
PASS  per-user kcal burned: user 1 180
PASS  per-user active minutes: user 1 44
Not copied (legacy, pre-accounts): settings [{"key":"calorieGoal","value":"2000"}]
```

**Notes:**
- **The legacy `settings` row** (a 2,000 kcal goal from before accounts) wasn't needed: the goal is
  already on the account.
- **The session was copied too,** so signed-in browsers stay signed in.
- **A second run is refused** ("already has 2 rows. Nothing was copied"). The script was then
  changed to back up only when it's actually going to copy.
- **Backups:** `data/backup-2026-10-16-21-20-47.db`, plus an identical one from the refused run.

## Verification (all against MySQL, on a production build)

- **Setup:** `npm run db:migrate` applied `001_initial.sql`; a second run said "Database is up to
  date". Typecheck and build are clean.
- **API checks:**
  - auth 46 of 46
  - reset/exercise 43 of 43
  - "Keep me signed in" 14 of 14
  - dashboard 39 of 39
  - email verification 34 of 34
  - The test scripts that set up data directly (expired tokens, renewed sessions, cleanup) now use
    MySQL.
- **Race checks:** 6 of 6.
  - 3 simultaneous sign-ups for one email → one 201 and two 409, with one row.
  - The same verification link twice at once → one `verified`, one `used`.
  - The same reset link twice at once → one 200, one 400, and the winning password works.
  - Two step saves for the same day at once → one row.
- **Browser checks:** landing 9, verification 15, welcome-back 23, rename 19, account 16, exercise
  states 13, dashboard 15 (all passing), plus the exercise and account screenshot runs. No failures,
  no overflow, no console errors.
- **Your dev server** on port 3000 serves `/login` (200) and answers a signed-out API call with
  401, read from MySQL.
- **Cleanup:** 32 test accounts were deleted, with nothing left behind. The two real accounts are
  untouched (8 + 1 food entries, 1 exercise session).

## Rollback

1. Revert the code to the SQLite version.
2. Remove `DATABASE_URL`.
3. `data/calorie-tracker.db` is still there, unchanged since the copy.

Anything logged after the move exists only in MySQL.
