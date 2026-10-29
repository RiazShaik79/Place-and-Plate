# app/api/: route conventions and shapes

Read the root `CLAUDE.md` first. The data behind these routes is in `lib/CLAUDE.md`.

## Conventions

- **Exports:** a route file exports only HTTP handlers and `dynamic`. Helpers stay unexported in the
  file, and shared constants go in `lib/`.
- **Errors:** don't wrap handlers in try/catch just to log. `instrumentation.ts` logs every unhandled
  error as `request_failed` (JSON, `lib/log.ts`) and sends it to Sentry.
- **Every handler** except `/api/auth/*` and `/api/health`:
  - starts with `const user = await requireUser(); if (user instanceof NextResponse) return user;`
  - scopes every query by `user.id`
  - another account's ids behave as "not found" (404)
- **Bodies:**
  - read with `readJson(req)` (`lib/http.ts`), which gives 400 for invalid JSON
  - account forms answer `fieldError(field, message)` → `{ error, field }`
  - other routes answer `{ error }` with 400
- **Dates** are `YYYY-MM-DD` checked with `ISO_DATE_RE`, and are the **client's** local day.
- **Values from the client are range-checked; nutrition is never taken on trust:**
  - catalogue foods are computed from `lib/foods.ts`
  - AI items are range-checked
  - repeats and edits are computed from stored rows
- **Partial updates:** a field left out of a partial update keeps its saved value (`"field" in body`).

## Routes

- **Health:** `GET /api/health` (no sign-in, never cached) → 200 `{ status: "ok", db: "up", db_ms,
  version, uptime_s }` or 503 `{ status: "degraded", db: "down", code }`. It's Render's health check
  path and what Watchtower polls. It must never return hosts, URLs or error messages.
- **Debug (temporary):** `GET /api/debug/error` throws one test error only when `DEBUG_ERROR_TOKEN`
  (32+ chars) is set, `x-debug-token` matches it and the caller is signed in; otherwise 404.
- **Auth:**
  - **POST** `/api/auth/{register,login,logout,forgot,reset,forget-device}`
  - `GET /api/auth/verify-email?token=` redirects to `/verify-email?status=…`
  - throttles: login, reset and verification, from `lib/auth.ts`
- **Account:**
  - `GET` and `PATCH {name, email}` on `/api/account` (an email change becomes `pendingEmail` plus
    a link)
  - `POST /api/account/verify-email` (resend)
  - `DELETE /api/account/pending-email`
  - `PUT /api/account/password`
  - `PUT /api/account/address`
  - **`PUT /api/account/body`:**
    - fields: `calorieGoal` (whole number, 800–6,000; required), `stepsTarget`, `waterTargetMl`,
      `heightCm`, `weightKg`, `birthYear` (1900 to this year minus 13), `sex` (`female`|`male`|null),
      `activity`, `goalWeightKg`, `weeklyChangeKg` (one of `PACES`), `sleepTargetMin` (240–720), and
      `today`
    - a changed weight is logged as a weigh-in for `today`
    - returns `{ user }`
- **Food log:**
  - `GET /api/log?date` → `{ entries }`
  - `POST /api/log {foodId, servings, date, meal}` → 201 `{ entry }` (the server computes nutrition)
  - `PATCH /api/log/:id {servings?, meal?}` → `{ entry }`: every number rescales in proportion
  - `DELETE /api/log/:id` → 204
  - `POST /api/log/custom {date, meal, source: "text"|"photo", items[1–20]}` → 201 `{ entries }`
    (confirmed AI items, range-checked)
  - `GET /api/log/recent?today` → `{ recent, favorites }`: the last 60 days, one row per food key,
    one serving each
  - `POST /api/log/repeat {date, meal, items: [{entryId | favoriteId, servings?}] (1–30)}` → 201
    `{ entries }`. It copies the user's own rows; any foreign id means 404 and nothing is added.
  - `POST /api/favorites {entryId}` → `{ favorite }` (starring twice is a no-op)
  - `DELETE /api/favorites/:id`
  - `GET` and `PUT {calorieGoal}` on `/api/settings`
- **Exercise:**
  - `GET /api/exercise?date`
  - `POST /api/exercise {exerciseId, minutes, date}`
  - `DELETE /api/exercise/:id`
  - `POST /api/exercise/custom` (confirmed AI items)
  - `GET /api/exercise/week`
- **Steps:**
  - `GET /api/steps?date` → `{ steps, target }`
  - `PUT {date, steps | null}` (0–100,000)
- **Water:**
  - `GET /api/water?date` → `{ ml, target }` (target defaults to 2,000)
  - `POST {date, add}`: ±1–2,000 and not 0. It's atomic, and a negative amount is how Undo works.
  - `PUT {date, ml | null}` (0–10,000)
- **Sleep:**
  - `GET /api/sleep?date` → `{ sleep: {bed, wake, minutes, quality} | null, target }`
  - `PUT /api/sleep {date, bed: "HH:MM", wake: "HH:MM", quality: 1–5 | null}` → `{ sleep }`. The
    server computes the minutes (30 min to 16 h, across midnight). No future days.
  - `{date, clear: true}` removes a night
- **Weight:**
  - `GET /api/weight?from&to` → `{ entries, before, goalKg, weeklyChangeKg }`. `before` is the
    weigh-in just before `from`, which seeds the trend.
  - `PUT /api/weight {date, kg}`: 30–300 kg, no future days, and the same day replaces.
  - `DELETE /api/weight/:date`
- **History:** `GET /api/history?period=day|week|month&end=YYYY-MM-DD` → `{ period, buckets,
  calorieGoal, stepsTarget, waterTarget, today }`. The bucket rules are in `lib/CLAUDE.md`.

## AI and Places (cost quota: never call them in loops or tests)

- **Food AI:**
  - `POST /api/ai/text {description ≤ 500}`
  - `POST /api/ai/image` (multipart `image` JPEG/PNG/WebP/HEIC ≤ 10 MB, plus an optional `hint`)
  - returns `{ items: [{name, portion, calories, protein, carbs, fat}], totals, notes }`
- **Exercise AI:**
  - `/api/ai/exercise/{text,image}` → `{ items: [{name, category, intensity, minutes, met,
    calories}], totals, notes, weightKg, weightIsDefault }`
  - calories = MET × weight × time, unless a number is stated or shown
- **AI routes never write.**
  - Non-food input gives 200 with `items: []` and a note.
  - Errors: 400, 413/415, 429, 500 (no key) and 502 (Gemini failed or timed out).
  - Gemini output is never trusted: a JSON schema, clamped numbers and recomputed totals
    (`lib/gemini.ts`, `lib/exercise-ai.ts`).
- **Places:**
  - `POST /api/places/autocomplete {input, sessionToken}` → `{ suggestions }`
  - `GET /api/places/details?placeId&sessionToken` → `{ address }`
  - one session token per search, for cheaper billing
  - no key gives 503 and the UI hides search; Google errors give 502 and the UI says to type it
