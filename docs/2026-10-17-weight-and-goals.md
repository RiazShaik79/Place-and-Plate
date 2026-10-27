# 2026-10-17: Weight log, trend and a suggested calorie goal

## Why

The calorie goal was a number typed in with nothing behind it, and weight was a single value that
each save overwrote. Now:
- weigh-ins are kept over time
- a smoothed trend shows the real direction under day-to-day swings
- progress to a goal weight is shown
- the app suggests a calorie goal from your details, which you can use or ignore

## What was built

- **Dashboard: Weight panel**, after the charts, and also shown on an otherwise empty dashboard.
  - **Logging:** "Today's weight [ … ] kg, Log weight", pre-filled with the last weigh-in. Logging
    the same day again replaces it.
  - **Chart:** a new `LineChart` with weigh-ins as dots and the trend as a 2px line, on one y-axis
    that fits the data (weight doesn't start at zero).
    - The goal weight is a reference line named in the legend.
    - Each point has a hover and keyboard-focus tooltip: weight, day and trend.
    - It follows the Daily / Weekly / Monthly switch.
  - **Summary line:** for example "Trend 80.6 kg, down 0.4 kg since Oct 5. 5.6 kg to go to 75 kg,
    about 12 weeks at 0.5 kg a week." It links to "Set a goal weight" or "Set a pace" when those
    are missing.
  - **Table:** "Show the weigh-ins" lists every point with its trend.
- **Account → Body and goals**, now in three groups:
  - **Daily targets:** calories, steps, water.
  - **About you:** year of birth, sex (optional), height, current weight, activity level.
  - **Weight goal:** goal weight and pace.
  - **Live suggestion:**
    - for example "Suggested goal **2,150 kcal**. About 2,700 kcal a day keeps your weight
      steady; losing 0.5 kg a week takes about 550."
    - **Use 2,150 kcal** fills the goal field, and saving makes it your goal
    - until the details are in, it says what's missing
  - **Saving a new current weight** also logs it as today's weigh-in.
- **The current weight follows the newest weigh-in** (`users.weight_kg`), so exercise calories keep
  using it.

## The numbers

- **Resting energy (Mifflin–St Jeor):** `10 × kg + 6.25 × cm − 5 × age + s`.
  - `s` is +5 for men and −161 for women.
  - **Sex is optional.** Without it the midpoint (−78) is used, and the card says it's a rougher
    estimate, give or take about 80 kcal.
- **Activity multipliers:** 1.2 / 1.375 / 1.55 / 1.725 / 1.9, from "mostly sitting" to "extremely
  active", described in plain words in the select.
- **Pace:** about 7,700 kcal per kg of body weight, so 0.5 kg a week is 550 kcal a day. The choices
  are lose 0.25–1 kg a week, keep, or gain 0.25–0.5 kg a week.
- **Safety floor:**
  - The suggestion never goes below 1,200 kcal (1,500 for men), the usual minimum without medical
    supervision.
  - When the floor applies, the card says "A slower pace is safer".
  - The suggestion is also clamped to the app's 800–6,000 range.
  - There's no suggestion for anyone under 13: the year of birth only accepts ages 13 and over.
- **Trend:**
  - An exponentially smoothed average with 10% per day ("The Hacker's Diet").
  - After a gap of `g` days the new reading counts `1 − 0.9^g`, so a week away moves the trend
    more than a single day.
  - The trend starts from the last weigh-in before the chosen period.
- **Example:** a 35-year-old man, 178 cm, 80 kg, moderately active, losing 0.5 kg a week.
  - BMR 1,742.5, maintenance about 2,700, suggestion **2,150 kcal**.
  - Without sex: **2,020 kcal**.

All of this is in `lib/goals.ts`: pure functions, shared by the page and the tests.

## Data

- **Migration `004_weight_goals.sql`:**
  - `weight_entries` (one row per user and day, cascades on account deletion)
  - on `users`: `birth_year`, `sex`, `activity`, `goal_weight_kg`, `weekly_change_kg`, all nullable
  - existing weights were copied as today's weigh-in, and both real accounts were checked
- **API:**
  - `GET /api/weight?from&to` → `{ entries, before, goalKg, weeklyChangeKg }`
  - `PUT /api/weight { date, kg }`: 30–300 kg, no future days
  - `DELETE /api/weight/:date`
  - `PUT /api/account/body` takes the new fields. Each is validated, and a field left out keeps its
    saved value.

## Checks (production build, MySQL)

- **New unit tests: 11.**
  - BMR for men, women and not given
  - the activity factors
  - the 2,150 / 2,020 example
  - maintain and gain
  - the floor, and missing details
  - the trend step and gaps, and input order
  - goal progress, including going the wrong way
- **New API suite: 33 checks.**
  - signed-out 401s
  - log, replace and delete
  - the current weight follows the newest weigh-in; an older one logged later doesn't change it
  - range, type, date and future-day errors
  - isolation between accounts
  - the new body fields saved, kept when left out, clearable, and each invalid value rejected with
    its field
  - the migration is recorded, and weigh-ins cascade on account deletion
- **New browser suite: 35 checks (desktop and mobile).**
  - **Dashboard:** the Weight panel shows the trend; logging adds a point and a toast; the focused
    point shows its tooltip; the table lists every weigh-in; an out-of-range weight gives an
    inline error.
  - **Account:**
    - the "missing details" text
    - the 2,150 kcal suggestion, and 2,020 without sex
    - **Use** fills the goal, and saving stores the profile
  - **Food page:** it uses the new 2,150 goal.
  - **Dashboard goal progress:** "kg to go … weeks at 0.5 kg a week" and the goal line key.
  - **Overall:** no overflow and no console errors.
- **Design review of the screenshots:** an account with weigh-ins but no meals saw "Nothing logged
  in the last 14 days" above its weight chart. The empty state now reads "No meals, workouts or
  steps in the last 14 days".
- **The full `npm test` passes**, including every earlier suite.

## Not done

- Editing or deleting a past weigh-in from the dashboard: the API supports delete, but there's no
  UI yet.
- Units in lb or stone.
- Adjusting the suggestion as weight changes over time; it updates when the current weight is
  saved.
