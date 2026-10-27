# lib/: data model, database access and shared logic

Read the root `CLAUDE.md` first. Routes are in `app/api/CLAUDE.md`.

## Files

- **`db.ts`:** the **only** database access: the mysql2 pool and every query. It's server-only.
  - The pool is cached on `globalThis` for dev hot reload.
  - Pool options: `decimalNumbers`, `dateStrings`, `timezone: "Z"`.
  - **TLS for hosted MySQL:** `ssl-mode=REQUIRED|VERIFY_CA|VERIFY_IDENTITY` in `DATABASE_URL` (Aiven
    adds it) is removed from the URL (mysql2 doesn't know it) and becomes
    `ssl: { ca: DATABASE_CA_CERT, rejectUnauthorized: true }`. Without `DATABASE_CA_CERT` it throws a
    clear error. A URL without `ssl-mode` (local MySQL) connects without TLS, as before. Never set
    `rejectUnauthorized: false`.
- **`db-migrate.ts`:** runs `db/migrations/NNN_*.sql` once each, recorded in `schema_migrations`.
- **`auth.ts`:** scrypt passwords, sessions, `requireUser` with renewal, throttles, the device cookie.
- **`account.ts`:** field rules and limits, BMI, `HOME_PATH`, `safeNextPath`.
- **`goals.ts`:** the suggested calorie goal and the weight trend (pure functions).
- **`sleep.ts`:**
  - `sleepMinutes(bed, wake)`: a wake time at or before the bedtime means the night crossed midnight
  - `sleepProblem`: 30 min to 16 h
  - the target limits (4–12 h), `QUALITY_LABELS` and `hours()`
- **`history.ts`:** dashboard buckets and labels.
- **`foods.ts`:** the catalogue, `foodKey` / `FOOD_KEY_SQL`, the Recent and repeat limits.
- **`exercises.ts`:** the MET catalogue.
- **`nutrition.ts`:** totals, goal status, formatting and date helpers.
- **`gemini.ts`** and **`exercise-ai.ts`:** the Gemini client and the food/exercise prompts.
- **`places.ts`:** the Google Places client (server).
- **`verification.ts`**, **`mailer.ts`** (console delivery), **`http.ts`**, **`client.ts`**
  (browser: `apiFetch`, `signOut`, flash, `requestEstimate`), **`types.ts`**, **`brand.ts`**.

## Data model (`db/migrations/NNN_*.sql`)

**Types:**
- ids are `INT UNSIGNED AUTO_INCREMENT`, and numbers are `DOUBLE`
- `date` is `CHAR(10)` 'YYYY-MM-DD', the user's local day
- timestamps are ISO-8601 UTC strings in `VARCHAR(30)`
- token hashes are `CHAR(64)`
- foreign keys cascade on user delete

**Tables:**
- **`users`:**
  - `email` (unique, lower-cased), `name`, `password_hash` (scrypt), `calorie_goal`, `created_at`
  - optional numbers: `weight_kg` (current weight), `height_cm`, `steps_target`, `water_target_ml`
    (NULL means the 2,000 default)
  - `address` (JSON)
  - `email_verified_at`, `pending_email`
  - from 004: `birth_year`, `sex` (NULL = not given), `activity`, `goal_weight_kg`, `weekly_change_kg`
- **`sessions`:** `token_hash` (SHA-256), `user_id`, `expires_at`, `remember`. The cookie is
  `ct_session`.
- **`password_resets`:** `token_hash`, `expires_at` (30 min), `used_at`.
- **`email_verifications`:** `token_hash`, `user_id`, `email` (the sign-in or pending address),
  `expires_at` (24 h), `used_at`.
- **`log_entries`:**
  - `user_id`, `date`, `meal`
  - `food_id`: a catalogue id or `ai:text|ai:photo`
  - `name`, `serving_size`, `servings`
  - `calories`, `protein`, `carbs`, `fat`, already multiplied by servings
  - entries snapshot nutrition, so changing the catalogue never rewrites history
- **`exercise_entries`:** `user_id`, `date`, `source`, `name`, `category`, `intensity`, `minutes`,
  `met`, `calories`.
- **`daily_steps`:** (`user_id`, `date`) primary key, `steps`.
- **`daily_water`** (002):
  - (`user_id`, `date`) primary key, `ml` (0–10,000)
  - quick adds are one atomic `INSERT … ON DUPLICATE KEY UPDATE ml = LEAST(GREATEST(ml + ?, 0), max)`
- **`favorite_foods`** (003):
  - one serving snapshotted from an entry
  - unique per (`user_id`, `food_key`)
- **`daily_sleep`** (005):
  - (`user_id`, `date`) primary key; `date` is **the day you woke up**
  - `bed_time` and `wake_time` as 'HH:MM', `minutes` (computed by the server), `quality` (1–5,
    nullable)
  - from 005, `users.sleep_target_min` (NULL = 480)
- **`weight_entries`** (004):
  - (`user_id`, `date`) primary key, `weight_kg`
  - the newest also sets `users.weight_kg`, which exercise calories use

**Schema changes:**
- Add the next `db/migrations/NNN_<name>.sql` (**006 next**). Never edit an applied file.
- It runs on the next server start (the first query waits for it), or with `npm run db:migrate`.

## db.ts patterns

- **Everything is `async`.** Multi-step writes use `transaction(async (tx) => …)`.
- **There's no `RETURNING`:** insert, then select by id.
- **Upserts** use `ON DUPLICATE KEY UPDATE`.
- **Link confirmations and password resets lock their row** (`SELECT … FOR UPDATE`), so a
  double-click can't succeed twice.
- **`repeatEntries`:** look every source row up first; any one that isn't the user's means nothing
  is inserted.
- **`foodKey()` / `FOOD_KEY_SQL`** (`foods.ts`): the catalogue id, or `ai:` + lower(name) + `|` +
  portion. Keep the two in sync.

## Auth and sessions (`auth.ts`)

- **Cookies:**
  - "Keep me signed in" gives a 30-day cookie, renewed at half-life by `requireUser()`
  - otherwise a browser-session cookie with a 12-hour idle limit
- **Device memory:** `ct_device_user` (email and name only) powers "Welcome back".
- **Throttles** (in memory, via `createThrottle`): login, reset, verify (3 per 15 min) and places
  (60 per 10 min).
- **Links:** reset links last 30 min and verification links 24 h. Only SHA-256 hashes are stored.

## History buckets (`history.ts`, `/api/history`)

- **Each bucket has:**
  - `start`, `end` (never after `end`), `days`
  - `foodDays`, `daysOnTarget`
  - totals of `eaten`, `protein`, `carbs`, `fat`, `burned`, `minutes`, `steps`, `stepDays`, `water`
    (ml) and `waterDays`
- **Weeks start on Monday.**
- **Averages:** the client turns totals into per-day values.
  - Food, steps and water average over the days that were logged; an unlogged day isn't a day of
    eating nothing.
  - Burn and minutes average over every day.
  - The KPI tiles average from the first period with data.
- **Today is left out:** today's food, steps and water stay out of the buckets, because the day isn't
  over.
  - They come back as `today: { eaten, steps, water, protein, carbs, fat }` (`todaySoFar`).
  - **Sleep is different:** a night is finished once it's logged, so today's sleep stays in the
    buckets (`sleep`, `sleepDays`), like exercise.
  - The dashboard draws the newest column as "so far", with today included (`soFarValue` in
    `Dashboard.tsx`).
  - Exercise stays in the buckets.

## Goals maths (`goals.ts`)

- **Resting energy (Mifflin–St Jeor):** `10·kg + 6.25·cm − 5·age + s`. `s` is +5 for male, −161 for
  female, and −78 when sex isn't given.
- **Maintenance** = resting energy × the activity factor (1.2 / 1.375 / 1.55 / 1.725 / 1.9).
- **Pace:** 7,700 kcal per kg, divided by 7.
- **The suggestion** is rounded to 10 and clamped to 800–6,000. It never goes below the safety floor:
  1,500 for men, otherwise 1,200.
- **Trend:** an exponentially smoothed average, α = 0.1 a day; a gap of `g` days uses `1 − 0.9^g`.
- **`goalProgress`:** weeks is null when the pace is 0 or points the wrong way.
