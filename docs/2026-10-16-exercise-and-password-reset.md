# 2026-10-16: Exercise log, AI exercise lookup and password reset

## What was asked

- Add password reset.
- Add a page for logging and tracking exercise, saved in the local database.
- Add an AI lookup for exercise (text: "walking outdoor or walking indoor etc.") using Gemini
  `gemini-2.5-flash-lite`.
- Run the Ralph loop with the frontend-design skill for 2–3 rounds, then document.

**How conflicting instructions were read:**

- **"Frontend untouched":** this came from the earlier API-only prompt, and it contradicts "new
  frontend for the exercises page". The exercise page was built.
- **"Calories and macros" for exercise:** exercise burns calories but has no protein/carbs/fat.
  The AI returns calories burned, duration, intensity and a MET value.
- **"Two routes, text + image":** both were built for exercise. The photo route reads a watch,
  app or treadmill summary, or a photo of the activity.

## Architecture

**Password reset**

- **Token store:** a `password_resets` table holds the SHA-256 of a 32-byte random token,
  `expires_at` (30 min) and `used_at`. A new request replaces the user's older links.
- **`POST /api/auth/forgot`** always answers `200 { ok: true }`, whether or not the account
  exists, so it can't reveal which emails are registered. It's throttled to 3 requests per email
  per 15 min.
- **`POST /api/auth/reset`**, in one transaction:
  - sets the new password
  - burns the token
  - deletes **all** sessions for the user

  It then starts a fresh session on this device.
- **`/reset-password`** checks the token on the server before any typing, so a dead link shows
  "expired", "already used" or "isn't valid" with **Request a new link**.
- **Delivery:** `lib/mailer.ts`. There's no mail provider in a local app, so the email (with the
  link) is printed to the server console, and the "Check your email" screen says so.
  Hosting means swapping one function.

**Exercise**

- **Data:**
  - an `exercise_entries` table (user, date, source, name, category, intensity, minutes, MET,
    calories)
  - an optional `users.weight_kg`, edited on the account page
- **Calories** = MET × weight (kg) × hours, the standard Compendium of Physical Activities method.
  - With no saved weight it uses 70 kg and says so, with a link to add your weight.
  - Catalogue calories are always computed by the server.
- **Catalogue:** `lib/exercises.ts` has 27 activities with 2024 Compendium MET values. That
  includes outdoor easy and brisk walks, treadmill flat and incline walks, running, cycling,
  strength work, yoga and sports.
- **AI (`lib/exercise-ai.ts`):**
  - Gemini returns `name`, `category`/`intensity` (enums), `minutes`, `met` and
    `reportedCalories`.
  - The server clamps the values (minutes 1–600, MET 1–23) and computes calories from the user's
    weight.
  - The exception is when the user states, or the photo shows, a calories-burned number: a device
    measured that person, so it's used instead.
  - If no duration is given, it assumes 30 min and says so in `notes`.
- **Routes:**
  - `GET/POST /api/exercise`
  - `POST /api/exercise/custom` (confirmed AI items, range-checked)
  - `DELETE /api/exercise/:id`
  - `GET /api/exercise/week?end=` (7 days, zero-filled)
  - `POST /api/ai/exercise/{text,image}`, which never write to the database
  - All require a session.
- **UI:**
  - **Page:** `/exercise` has `DateNav`, then `ExerciseSummary` (kcal burned, active minutes, and
    a 7-day bar strip against the WHO 150 min/week guideline), then `ExerciseLog` (session cards
    with an intensity meter, and Undo on remove) beside `AddExercisePanel` (Search / Describe /
    Photo, with `ExerciseReview` checkboxes).
  - **Header:** a Food / Exercise switch.
  - **Food page:** shows "Burned N kcal in N min of exercise", linked to `/exercise?date=` for
    the same day.

**Model choice**

- **What happened:** `gemini-2.5-flash-lite` is listed for the API key, but `generateContent`
  returns **404 "no longer available to new users"**. This was confirmed with one direct call.
- **What the client does:** `generateJson` tries `gemini-2.5-flash-lite` first as requested, falls
  back to `gemini-3.5-flash-lite` (Google's named replacement) on 404, and remembers the choice.
  `GEMINI_MODEL` pins a single model.
- **Shared code:** food and exercise share the client. Food behaviour is unchanged.

## Verification before the loop

The **API scripts passed 43 of 43 for reset and exercise**, plus **46 of 46 for the existing
auth checks**. The reset and exercise checks covered:

- 401 on every new route without a session.
- Forgot password: generic 200 for known and unknown emails, one hashed token, a 30-minute
  expiry, a new request replacing the old one, and 429 on the 4th request.
- The reset page states: valid, invalid and expired.
- The reset route:
  - bad, expired and used tokens are rejected
  - a short password is rejected
  - a successful reset signs in, signs out the other sessions, rejects the old password and
    accepts the new one
- Weight: validated, saved, and kept when omitted.
- Exercise calories:
  - brisk walk, 30 min, 80 kg → 172 kcal
  - a user with no weight uses 70 kg → 151 kcal
  - unknown activity, 0 minutes, a bad category and MET 99 are all rejected
- The week endpoint is zero-filled, and users are isolated from each other.

**Real Gemini calls, one each:**

- **Text:** "walking indoors on a treadmill for 40 minutes at a steady pace" →
  "Treadmill walk, indoor", 40 min, 3.5 MET, 163 kcal at 70 kg (8 s).
  - The first attempt hit the 30 s timeout once; the UI shows its friendly retry message.
- **Photo:** a rendered treadmill console (32:00, 5.5 km/h, 2% incline, 245 CALORIES) →
  "Treadmill walk, 2% incline", 32 min, 245 kcal (the displayed number).
  - The 2.5 → 3.5 fallback was logged on the first call.

## How the Ralph loop ran

The Ralph Loop plugin ran with `--max-iterations 3`. Each round had three steps:

1. **Rebuild** (`npm run build`) and serve on port 3100.
2. **Screenshot** every state at 1440 × 900 and 390 × 844 with a headless Chrome CDP driver.
3. **Judge** against the frontend-design criteria: hierarchy, spacing, type, copy, templated
   tells, accessibility and responsiveness. `scrollWidth` was measured against `innerWidth`.

AI responses were **mocked inside the page**, so Gemini was never called by the loop. The
scripted states:

- Exercise: empty, with sessions, search row expanded, Describe review, Photo review (an injected
  image), and remove with Undo.
- The food page's burned-calories link.
- Sign-in with the "Forgot password?" link.
- Forgot password: before and after sending.
- Reset password: valid, too short, done (toast), and expired.
- Account settings with the weight field and its error.

**The design plan, checked before code:**

- Reuse the sage/basil tokens and the panel/card radii so exercise feels native.
- Spend the page's one bold element on the **7-day bar strip**. It answers the real question
  ("am I moving enough this week?") and mirrors the food page's segmented bar.
- Show intensity as a three-bar meter *plus* the word, not colour alone.
- Avoided: a new accent colour, stat-card grids, gradient washes, all-caps labels.

### Round 1

| # | Finding | Fix |
|---|---------|-----|
| 1 | The empty "Last 7 days" strip was a big blank chart with no explanation | Added the hint "Each day fills in as you log sessions." |
| 2 | Auth side-panel copy was food-only ("one meal at a time"), though the app now logs workouts | "See where your calories come from and where they go." + meals and workouts |
| 3 | "Check your email" and the Sign out row broke the email mid-word (`break-all`) | `break-words`: the address moves to the next line whole |
| 4 | The reset-success toast wrapped to two lines inside a pill on mobile | "Password updated". The reset page already says other devices are signed out |

**Verification 1:** all four fixed. No overflow, and no console errors.

### Round 2

A scripted check passed 13 of 13 at both sizes:

- With no exercise, the food page link says "No exercise logged… Log exercise".
- From Yesterday on the food page, the link opens the exercise page on Yesterday.
- Week bars are keyboard buttons: Enter opens that day, and `aria-current="date"` is set.
- A mocked 429 shows "The AI is busy…".
- Non-exercise text ("a cheese sandwich") explains itself.
- A search with no match offers to switch to Describe.
- No console errors.

| # | Finding | Fix |
|---|---------|-----|
| 5 | The empty-week hint was drawn over the bars: the keyboard focus ring cut through it and it blocked clicks | Moved above a shorter empty chart |
| 6 | On phones, long activity names were truncated ("Walking outdoors, easy pa…"), losing the detail that tells similar activities apart | Names wrap to two lines |

**Verification 2:** a clean focus ring and no overlap. The full scenario still passes.

### Round 3: final verification

- **A fresh build, with everything re-run:**
  - the full screenshot scenario (no overflow at 1440 or 390; Undo restores; reset signs in)
  - round 2 checks: 13 of 13
  - reset/exercise API: 43 of 43
  - auth API: 46 of 46
  - account browser checks: 16 of 16
- **Design check passed:**
  - Each page has one bold element.
  - Copy is sentence case with verb-led buttons ("Log session", "Send reset link",
    "Save password and sign in").
  - Every error says what happened and what to do next.
  - Removing a session updates today's bar at once.
- **Not verified:** a real phone camera, password-manager autofill on the reset page, a
  screen-reader pass, and sending real email (there is no provider).

## Problems met along the way

- **A stale dev-server module.** After `RESET_LINK_PROBLEMS` was added to `lib/account.ts`, the
  running `npm run dev` kept an old server-component copy. `/reset-password` returned a 500
  ("reading 'invalid' of undefined") while API routes worked. A production build was correct.
  Restart the dev server after adding exports (noted in CLAUDE.md).
- **OneDrive and the build folder.** OneDrive turned `.next/static/<id>` into a read-only cloud
  placeholder, so `next build` failed with `EPERM`. Clearing the read-only flag and deleting the
  folder fixed it (noted in CLAUDE.md).
- **Test data.** Test accounts used `@example.com` addresses and were deleted afterwards. The
  owner's account and entries were left untouched.

## Decisions

- **Exercise doesn't change the food budget.** "kcal left" stays eaten-vs-goal, and burned
  calories appear beside it. Many people don't want exercise "earning" food, and estimates vary.
  An opt-in setting is on the roadmap.
- **MET × weight on the server, not AI calories.** Every number comes from one documented
  formula with clamped inputs. The only exception is a calories figure the user or a device
  reports.
- **Weight is optional,** and the 70 kg default is always disclosed.
- **Console "mailer" instead of showing the link on screen.** Showing the link would let anyone
  reset any account. The console keeps the real flow intact for when a provider is added.
