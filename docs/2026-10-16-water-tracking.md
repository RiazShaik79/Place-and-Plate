# 2026-10-16: Water tracking

## What was asked

Add water tracking, and decide whether it needs its own page or belongs with food.

## Decisions

- **On the Food page, not a separate page.**
  - Water is logged at the same moments as meals, for the same day.
  - The Food page already has the day navigation.
  - A fourth tab would be one more place to visit for a two-second action.
  - Steps work the same way: a card on the Exercise page, a target in Account, a dashboard chart.
- **Quick-add buttons, one total per day.**
  - **+ Glass (250 ml)** and **+ Bottle (500 ml)** add in one tap, with a toast offering **Undo**.
  - **Edit** sets an exact total, or clears it.
  - Individual drinks aren't stored: nothing in the app needs per-drink times, and one row per day
    matches steps.
- **Taps sent at the same moment all count.**
  - The client sends an increment, not a new total.
  - The server applies it in one statement:
    `INSERT … ON DUPLICATE KEY UPDATE ml = LEAST(GREATEST(ml + ?, 0), 10000)`.
  - The card updates at once, and takes the server's total only when every pending tap has
    answered.
  - Undo sends the negative amount for the day the water was added on, even if you've moved to
    another day.
- **Target:**
  - An optional **Daily water target** sits in Account → Body and goals (500–6,000 ml).
  - Empty means 2,000 ml.
  - A body save that doesn't mention the target keeps the saved one.
- **Colour:**
  - The plan suggested a new blue `water` token. It wasn't added.
  - On the Food page the water meter sits beside the blue Carbs bar, and a second blue would read
    as another macro.
  - Progress toward a target is the same job as the Steps meter, so it uses basil like Steps.
  - A drop icon and the word "Water" carry identity, and "Target reached" is text, not only
    colour.
- **Dashboard:**
  - **Water chart:** it averages over the days with water, like food and steps.
  - **Today:** it's left out of the buckets and shown as the dashed "Today so far" column, with
    the same rule as food and steps.
  - **Axis:** it's labelled in litres (`ColumnChart` gained an optional `tickFormat`).
  - **Layout:** Steps and Water are now a half-width pair under Calories eaten.
  - **Table:** the table gains a "Water (L)" column.

## Changes

- **`db/migrations/002_water.sql`:**
  - `daily_water (user_id, date, ml, updated_at)`, with primary key (`user_id`, `date`) and a
    cascade on user delete
  - `users.water_target_ml`
  - It applies itself on the server's first query.
- **`lib/db.ts`:**
  - `getWater`, `addWater` (atomic, clamped, returns the new total), `setWater`
  - `updateBodyGoals` and the user mapping include `waterTargetMl`
  - `dailyTotals` adds `water` / `waterDays`
- **`lib/account.ts`:** water limits, the glass and bottle sizes, `WATER_TARGET_ERROR`.
- **`lib/history.ts`, `lib/types.ts`, `app/api/history/route.ts`:**
  - buckets carry water
  - `today.water`
  - `waterTarget`
- **`app/api/water/route.ts`:**
  - `GET ?date` → `{ ml, target }`
  - `POST { date, add }` (±1 to ±2,000, not 0)
  - `PUT { date, ml | null }` (0 to 10,000)
- **`app/api/account/body/route.ts`:** validates `waterTargetMl`.
- **UI:**
  - `components/WaterCard.tsx`
  - `DailySummary` (a `water` slot under the exercise link)
  - `CalorieTracker` / `app/page.tsx` (pass the target and the toast)
  - `BodyGoalsSection` (the new field; the three targets come first, then height and weight on
    their own row)
  - `Dashboard`, `ColumnChart`
  - a `Droplet` icon and `fmtLitres` in `lib/nutrition.ts`

## How it was checked (production build on port 3100, MySQL)

- **Typecheck and build:** clean. Migration `002_water.sql` is recorded in `schema_migrations`.
- **New water API checks: 37 of 37.**
  - **Sign-in and requests:** 401 when signed out; empty to start; +250, +500, then −250 (undo);
    undo stops at 0; exact totals and clearing; adds stop at 10,000 ml.
  - **Rejections:** a bad date, 0, a fraction, ±5,000, text, and totals that are negative or over
    the maximum.
  - **Concurrency:** **10 simultaneous +250 taps give exactly 2,500**.
  - **Privacy:** another account can't see it.
  - **Target:** it is checked and saved, and a save that omits it keeps it.
  - **History:**
    - the finished days are in the buckets and today isn't
    - `today.water`
    - `waterTarget`
    - week totals
- **New browser checks: 35 of 35 (desktop and mobile).**
  - **Adding:** a glass gives 0.25 L with an "Added 250 ml of water" toast; Undo goes back to
    0 L; three fast bottle taps give 1.5 L.
  - **Edit:** 2,100 shows 2.1 L with "Target reached". A bad value shows an inline error.
  - **Persistence:** a reload keeps the total, and the previous day has its own total.
  - **Account:** a 100 ml target is rejected; 2,500 saves, and the card then reads "of 2.5 L".
  - **Dashboard:** the Water chart has a "Target, 2.5 L" key, a "Today so far" key and litre
    ticks. The table shows "2.1 so far" and yesterday's 0.25.
  - **Overall:** no horizontal overflow and no console errors.
- **Design review of the screenshots:** on mobile the Edit button wrapped under the label once
  "Target reached" appeared. Edit is now pinned right and the label wraps instead.
- **Regression:** the earlier suites all pass:
  - auth 46, reset/exercise 43, "Keep me signed in" 14, verification 34, race 6
  - dashboard 41: the one failing check is the known "places not configured → 503", because this
    server has a Places key
  - browser: landing, verification, welcome-back, rename, account, exercise, dashboard,
    first-day
- **Cleanup:** the test accounts were deleted, and the real accounts are untouched.

## Not done (possible next steps)

- Per-drink history with times, other drink sizes, or custom amounts as buttons.
- Units other than ml/L (fl oz) belong with the "user preferences" roadmap item.
- A water target suggested from body weight (about 30–35 ml per kg).

## Follow-up (2026-10-17): "the Steps chart shows no steps"

- **Cause:** nothing was broken. Neither real account had ever saved a step count. The day's
  activity was walking sessions, which count toward Calories burned and Active minutes, not Steps.
  A test account on the running dev server saved 6,400 steps and read them back.
- **A real bug found while checking:**
  - In the **Weekly and Monthly** views, today's food, steps and water disappeared completely.
  - Today is kept out of the buckets, and only the Daily view drew the "so far" column.
  - A person who had only logged today saw an empty Steps chart there.
- **Fix:**
  - The newest column in every view is now drawn as "so far" with today included.
  - The keys read "This week so far" / "This month so far", with a tooltip and the table row.
  - Averages and "days within goal" still count only finished days.
- **Copy:** the empty Steps chart now says "Enter the day's steps on the exercise page: logged
  walks add minutes, not steps."
- **Checks:**
  - new `scenario-periods` 13 of 13 (Daily / Weekly / Monthly, plus walks-only)
  - dashboard 15, first-day 7, water 35, landing 9
  - API: dashboard 41 (the known places 503 check fails), water 37
