# Plate & Pace: Plan

## What We Built

A calorie, macro and exercise tracker with personal accounts, built with Next.js 16, React 19,
TypeScript, Tailwind v4, MySQL (via `mysql2`; SQLite until phase 9) and Gemini. It was built in nine phases, and is now called **Plate & Pace**.

On 2026-10-14:

1. **Core tracker**: a 30-food catalogue with servings, a daily log persisted to SQLite, totals,
   and day navigation. See `docs/2026-10-14-initial-build.md`.
2. **AI lookup API**: `POST /api/ai/text` (describe a meal) and `POST /api/ai/image` (meal photo)
   using Gemini with a JSON schema, server-side validation and recomputed totals. See
   `docs/2026-10-14-gemini-ai-lookup-api.md`.
3. **AI frontend**: Quick add / Describe it / Photo tabs, a checkbox review list before anything
   is logged, AI badges, friendly errors, and in-browser photo downscaling. See
   `docs/2026-10-14-ai-frontend.md`.

On 2026-10-16:

4. **Accounts**: create an account, sign in, sign out, and account settings (name, email,
   daily goal, password).
   - Every entry and goal belongs to a user.
   - Sessions are stored in the database, and the cookie holds only a random token.
   - Passwords use scrypt, and sign-in is throttled after repeated failures.
   - It needed no new packages.
   - The first account adopts the existing single-user log, so nothing is lost.
   - See `docs/2026-10-16-accounts-ralph-polish.md`.
5. **Exercise and password reset**:
   - **Exercise page** (`/exercise`): log sessions from a 27-activity catalogue (MET values),
     by describing them, or from a photo of a watch or treadmill summary (Gemini). It shows kcal
     burned, active minutes and a 7-day strip against 150 minutes a week.
   - **Calories burned** use MET × your weight, which is optional on the account page.
   - **Food page:** shows the day's exercise and links to it.
   - **Password reset:** a one-time 30-minute link (printed in the server console, since there's
     no mail provider) that signs out every device.
   - See `docs/2026-10-16-exercise-and-password-reset.md`.
6. **Plate & Pace**:
   - **New name:** renamed from Calorie Tracker to cover food and exercise.
   - **Keep me signed in** on sign-in: ticked means a 30-day, self-renewing session, so you don't
     re-enter your password on that device. Unticked means you're signed out when the browser
     closes.
   - **Exercise page:** the Photo tab is removed; Search and Describe remain.
   - **Follow-up:** this laptop's IT policy disables browser password autofill, so after signing
     out the sign-in page now says "Welcome back, Name", fills in the email and focuses the
     password. "Not you?" clears it.
   - See `docs/2026-10-16-rename-remember-me.md`.

7. **Dashboard and profile**:
   - **`/dashboard`:** daily (14 days), weekly (12 weeks) and monthly (12 months) views of calories
     eaten against the goal, calories burned, active minutes, steps and macro split. It has a hero
     average, stat tiles and a table view. The charts are inline SVG.
   - **Steps:** daily counts are entered on the exercise page.
   - **Account settings:** a new Body and goals panel (calorie goal, step target, height, weight,
     BMI) and an Address panel with optional Google Places search (`GOOGLE_MAPS_API_KEY`, Places API
     (New), billing on).
   - See `docs/2026-10-16-dashboard-profile.md`.

8. **Email verification**:
   - **Sign-up** sends a 24-hour confirmation link, with a quiet banner and **Resend link** until
     it's confirmed.
   - **Changing your email** only takes effect once the new address is confirmed; until then you
     sign in with the old one, and you can cancel the change.
   - **A password reset** also confirms the email.
   - **Signing in** now lands on the Dashboard.
   - See `docs/2026-10-16-email-verification.md`.

9. **MySQL**:
   - **Database:** moved from the local SQLite file to MySQL 26.7.
   - **Schema:** managed by versioned migrations (`db/migrations/`, `npm run db:migrate`).
   - **Data:** copied with the same ids and checked row-by-row and by per-user totals.
   - **Concurrency:** link confirmations and password resets are now safe if clicked twice at once.
   - See `docs/2026-10-16-mysql-migration.md`.

10. **Water tracking**:
   - **A Water card on the Food page**, under the exercise link: litres against a daily target,
     **+ Glass 250 ml** and **+ Bottle 500 ml** (a toast with Undo), and Edit for an exact total.
   - **Daily water target** in Account → Body and goals (500–6,000 ml; 2 L if empty).
   - **Dashboard:** a Water chart (litre axis, target line, today as "so far") beside Steps, and a
     Water column in the table.
   - **Storage:** one total per day (`daily_water`, migration `002_water.sql`); quick adds are atomic.
   - See `docs/2026-10-16-water-tracking.md`.

11. **Faster logging**:
   - **Recent tab**, first in the add panel once you've logged anything: foods from the last 60 days,
     newest first, one serving each; tap to add again at your usual serving ("usually 1.5").
   - **Favourites:** star a recent food; starred foods sit on top.
   - **Same as yesterday:** an empty meal offers the day before's foods; confirm, then Undo if needed.
   - **Edit a logged entry:** tap it to change servings (calories and macros rescale) or move it to
     another meal.
   - **Safety:** copies and edits are computed from rows the server holds (migration
     `003_favorites.sql`); a request naming someone else's entry adds nothing.
   - See `docs/2026-10-17-recent-foods.md`.

12. **Tests in the project (`npm test`)**:
   - **Moved in:** the API and browser checks from the scratchpad, plus new unit tests for `lib/`.
     - **Unit:** 24 tests.
     - **API:** 8 suites.
     - **Browser:** 11 suites, desktop and phone.
   - **No new dependencies:** `node:test` plus a small headless-Chrome driver.
   - **Isolated from your dev server:** a production build in `.next-test` on port 3100.
   - **No quota spent:** the AI and Places keys are blanked for the test server.
   - **Clean-up:** test accounts are removed afterwards.
   - See `docs/2026-10-17-tests-in-repo.md`.

13. **Weight log and a suggested calorie goal**:
   - **Weight panel on the Dashboard:**
     - log today's weight
     - a chart of weigh-ins with a smoothed trend and your goal-weight line
     - "kg to go, about N weeks at your pace"
     - a table of every weigh-in
   - **Account → Body and goals:**
     - new fields: year of birth, sex (optional), activity level, goal weight and pace
     - a live **suggested calorie goal** (Mifflin–St Jeor, with a safety floor) and **Use N kcal**
     - saving a new current weight also logs a weigh-in
   - **Tests:** 11 unit, 33 API and 35 browser checks; the full `npm test` passes.
   - See `docs/2026-10-17-weight-and-goals.md`.

14. **Sleep tracking**:
   - **What a night records:** bedtime and wake time (the duration is worked out, across midnight)
     plus an optional 1–5 "how rested", logged on the **Activity** page (formerly Exercise).
   - **Dashboard:** last night's card in Daily, and an hours-per-night chart in Weekly / Monthly.
   - **Account:** a sleep target.
   - See `docs/2026-10-17-sleep-tracking.md`.

## What We Improved

**Round one: the tracker** (three rounds, see `docs/2026-10-14-ralph-design-polish.md`)

- **Features:** an editable goal, a meal-segmented green / amber / red bar, macro bars,
  Breakfast / Lunch / Dinner / Snacks groups, a dated header and card entries.
- **Design system:** sage / basil colour tokens, Figtree, a radius hierarchy and an inline icon set.
- **Usability:** a meal picker preselected by time of day, per-meal Add buttons, a servings
  stepper, example prompts and drag-and-drop photos.
- **Details:** toasts, Undo on remove, loading skeletons, empty states, Retry on errors, status
  labels that don't rely on colour, focus rings and reduced motion.

**Round two: accounts** (three Ralph iterations, see `docs/2026-10-16-accounts-ralph-polish.md`)

- **Auth screens:** a form beside a live-looking preview of a logged day, built on the
  product's own segmented calorie bar rather than decoration.
- **Header menu:** an initials avatar with a keyboard-navigable menu.
- **Form errors:** shown inline under each field and announced to screen readers. An invalid
  field stays red while it's focused.
- **Expired sessions:** they return you to sign-in with an explanation and bring you back
  afterwards.
- **Sign-out:** removals still in their Undo window are sent before the session ends.
- **Welcome:** a new account gets a one-time welcome toast.
- **Goal:** the goal can be edited from the tracker or the account page, and both stay in sync.
- **Layout fixes:** the sign-out row overflowed with long emails; the goal hint wrapped; there
  was an empty band above the mobile form; the menu cut off emails.
- **Checks:** the API smoke test passed 46 of 46 and the browser checks 16 of 16. No horizontal
  overflow at 390 or 1440 px. Typecheck and build are clean.

**Round three: exercise and password reset** (three Ralph iterations, see
`docs/2026-10-16-exercise-and-password-reset.md`)

- **Week strip:** an empty week now explains itself, the hint no longer overlaps the bars (focus
  ring, clicks), and the bars work as keyboard buttons that open that day.
- **Copy:** the auth panel now covers meals *and* workouts.
- **Long text:** emails wrap whole, and activity names wrap instead of being cut off.
- **Reset toast:** short enough to fit on a phone.
- **Checks:**
  - AI errors (rate limit, non-exercise input) and the no-match search link are tested.
  - The food → exercise hand-off keeps the date.
  - Scripts: reset/exercise API 43 of 43, auth API 46 of 46, browser checks 13 + 16 of 16.
  - One real Gemini call each for text and photo.
  - No overflow at 390 or 1440 px; typecheck and build clean.

**Round four: rename and Keep me signed in** (two Ralph iterations, see
`docs/2026-10-16-rename-remember-me.md`)

- **Copy:** the sign-in and create-account intros were still food-only and now cover meals and
  workouts.
- **Checks:**
  - The real browser cookie was checked for both choices (session vs about 30 days), along with
    keyboard toggling and the hint text.
  - The exercise panel is confirmed to have no Photo tab, and the food panel is unchanged.
  - Scripts: browser checks 19 + 13 + 16; APIs 14 + 43 + 46.

**Round five: dashboard and profile** (two Ralph iterations, see
`docs/2026-10-16-dashboard-profile.md`)

- **Charts, following the dataviz skill:**
  - Reference lines are named in the legend instead of being drawn over the bars.
  - X-axis labels no longer collide.
  - The y-axis is snug with round ticks.
  - Empty charts show only the baseline.
  - Every chart has hover/focus tooltips and a table view.
- **Stat tiles** now average from when logging started, instead of across empty months.
- **Address:** suggestions are anchored to the input, and the field labels fit on one line.
- **Macro colours** were re-tuned to pass the colour-blindness and contrast checks.
- **Checks:**
  - Dashboard browser checks 15 of 15, and every earlier suite still passes.
  - Dashboard API 39 of 39 (38 with a deliberately fake Places key), plus 46 + 43 + 14 for the
    other APIs.
  - Address mapping 3 of 3 (UK, US, India).

**Round six: whole-app review** (three Ralph iterations, see
`docs/2026-10-16-ralph-whole-app-review.md`)

- **Fixed:** a day that failed to load showed the previous day's entries under its heading.
- **Failed loads now** put the Retry notice right under the day heading and hide the summary, so
  there is no false "0 eaten".
- **A new account's dashboard** is one panel with Log food / Log exercise instead of four blank
  charts.
- **Today is no longer judged as a finished day:**
  - its food and steps are left out of averages and "days within goal"
  - the daily charts show today as a dashed "Today so far" column
  - a first-day account sees "Eaten today so far"
- **Copy:** "Back to dashboard" on the account page; the auth footer no longer says the log is
  stored "on this computer".
- **Checks:** every API and browser suite passes, plus a new first-day dashboard check (7 of 7).

**Round seven: CLAUDE.md split by folder** (see `docs/2026-10-17-claude-md-split.md`)

- **The old limit:** `CLAUDE.md` had been capped at 200 lines.
- **The split:**
  - a lean root file (123 lines) with the rules that always apply
  - focused files in `components/`, `app/api/`, `lib/` and `tests/`, which Claude Code loads only
    when work touches those folders
- **The new rule:** keep each file focused, rather than to a line count.

**Round eight: dashboard carousel** (see `docs/2026-10-17-dashboard-carousel.md`)

- **The carousel:** Calories eaten, Steps and Water are now three equal cards in one carousel. Two
  are in view on desktop and one on a phone (swipe, Previous / Next or dots), and the cards line up
  with the exercise pair above.
- **Test runner fix:** the runner now clears its whole `.next-test` folder before building, because
  OneDrive also locks files outside `static`.
- **Follow-up:** Weight joined the carousel as a fourth card (Weekly and Monthly). The Daily view now
  shows these four as "today at a glance" cards instead of two-week charts.
- **Test server warm-up:** the runner warms the server up before testing, fixing first-check
  timing failures.

**Round nine: dashboard rework after a full review** (see `docs/2026-10-17-dashboard-rework.md`)

- **Daily:** today for every card (seven equal cards plus today's macros), with no charts or
  averages.
- **Weekly / Monthly:** the overview, the exercise pair and the carousel.
- **Period labels:** every card says its period ("Today", "Last 12 weeks", "Last 12 months").
- **Logging:** the dashboard is view only; weight logging moved to the Activity page.
- **Layout:** no more empty bands at card bottoms.
- **Tests:** a new full-dashboard suite with 165 checks across all three periods.

## Future Roadmap

| Priority | Item | Notes |
| -------- | ---- | ----- |
| 1 | Deploy to Vercel | Point `DATABASE_URL` at a hosted MySQL (PlanetScale, Aiven, RDS), run `db:migrate`; set `GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `APP_URL`; Redis for throttles |
| 2 | Real email delivery | Reset and verification are built; swap the console in `lib/mailer.ts` for a provider (Resend, Postmark, SES) |
| 3 | More history (food history charts) | The dashboard is built; add a custom date range, per-meal and per-food breakdowns, weight over time, CSV export |
| 4 | User preferences | Custom macro split, units (kcal/kJ, kg/lb), meal names, opt-in "add exercise back to budget", dark mode |
| 5 | Barcode scanning | `BarcodeDetector` + Open Food Facts lookup for packaged food |
| 6 | Step sync | Import steps from Apple Health or Google Fit instead of typing them |
| 7 | Editing | Done: servings/meal on logged entries. Still open: edit AI items before logging, move an entry to another day |
| 8 | Account management | Delete account + export data; list "signed-in devices" and sign them out individually |
| 9 | Custom foods and activities | User-defined items, searchable alongside the catalogues |
| 10 | Tests | Done: `npm test` (unit, API, browser). Still open: run it in CI on every push, mutation checks |
