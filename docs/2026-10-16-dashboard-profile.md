# 2026-10-16: Dashboard, body and goals, steps, and address

## What was asked

1. **A dashboard:** a high-level view of calories and exercise, grouped daily, weekly and monthly,
   shown as charts.
2. **Profile settings:** height, weight and a daily step target.
3. **Address details:** using Google address search where possible, or say which API key is needed.

## What was built

### Dashboard (`/dashboard`, "Dashboard" in the header nav)

- **Period switch:** Daily, Weekly or Monthly at the top. It controls everything below and is
  remembered on that browser.

  | Period | Range |
  |--------|-------|
  | Daily | 14 days |
  | Weekly | 12 Monday-start weeks |
  | Monthly | 12 calendar months |

- **Hero figure:** average kcal eaten per logged day, against the goal ("335 kcal under your
  2,000 kcal goal, across 11 logged days").
- **Stat tiles:** days within goal, kcal burned per day, active minutes a week (against 150), and
  steps per day (against the target).
- **Charts:**
  - calories eaten, with a goal line; bars over the goal are red, labelled in the legend
  - calories burned
  - active minutes, with a 21 min/day line (150 a week)
  - steps, with a target line
  - where your calories came from: the protein/carbs/fat share against 30/40/30, as stacked bars
- **Table view:** a toggle shows every number in a table.
- **Data:** `GET /api/history?period=&end=` (`lib/history.ts`) groups per-day totals from food,
  exercise and steps into buckets. The last bucket stops at today.
- **Averaging rules:**
  - **Food and steps** average over the days that were *logged*, because an unlogged day isn't a
    day of eating nothing.
  - **Burn and minutes** average over *every* day.
  - **The stat tiles** average from the first period that has data, so months before you started
    don't dilute them.

### Steps

- **The gap:** a step target needs step data, and the app had none.
- **The fix:** a `daily_steps` table, `GET/PUT /api/steps`, and a **Steps card** on the exercise
  page. You enter the day's count and see a meter against your target. Steps can't sync from a
  phone yet; that's on the roadmap.

### Account settings, reorganised

The page now has five panels:

1. **Profile:** name and email.
2. **Body and goals:** daily calorie goal, daily step target, height (cm) and weight (kg). A live
   BMI readout (with the WHO band and a "rough guide" caveat) updates as you type. Saved through
   `PUT /api/account/body`.
3. **Address:** street, unit, town/city, region, postcode and country. Saved through
   `PUT /api/account/address` as JSON on `users.address`. Street, city and country are required,
   and the address can be removed.
4. **Password.**
5. **Sign out.**

### Address search: Google Places API (New)

- **Server only:** `lib/places.ts` calls Autocomplete and Place Details from the server, so the
  key never reaches the browser.
- **One session token per search:** the token is sent with every keystroke's autocomplete
  request and with the final details call. Google then bills a search and its pick as one
  session.
- **The search box:** an accessible combobox. It waits 250 ms after typing, shows up to 5
  matches, and supports arrow keys, Enter and Escape.
- **Picking a match:** it fills the six fields, which stay editable. Nothing is saved until you
  click **Save address**.
- **Mapping:** Google's address parts are mapped onto the six fields. Unit tests pass for UK
  (`postal_town`), US (unit in `subpremise`) and India (`premise` and `sublocality`) formats.
- **When it isn't available:**
  - *No key:* the search box is hidden and you type the address yourself.
  - *Google errors (invalid key, API not enabled, billing off):* the UI says "Type the address
    below instead", and the server log explains what to check.

**What you need to turn address search on:**

1. A Google Cloud project with **billing enabled**. Places gives a monthly free allowance, but
   it won't run without a billing account.
2. **Places API (New)** enabled in that project, under APIs & Services → Library.
3. An API key restricted to Places API (New). Calls come from the server, so use an API
   restriction, not an HTTP-referrer one.
4. Add `GOOGLE_MAPS_API_KEY=...` to `.env` and restart the server.

The existing Gemini key comes from AI Studio, which normally isn't enabled for Places, so it
wasn't tried.

### Other changes

- **Macro colours checked for colour blindness.** The dataviz skill's validator failed carbs blue
  `#3a86a8`: its colour is too weak and reads as grey. Fat gold `#c98a2b` was below 3:1 contrast.
  Updated to `#2f84b8` and `#b97b1c`, which pass every check (worst colour-blind difference 12.2).
- **Header:** the nav is now Food / Exercise / Dashboard.

## How the Ralph loop ran

- **Settings:** `--max-iterations 3`, completion promise `DASHBOARD POLISHED`. The prompt avoided
  `;` this time, so the limits applied straight away.
- **Each round:**
  - rebuild and serve on port 3100, with a **fake** `GOOGLE_MAPS_API_KEY` so the search box
    renders, and `/api/places/*` mocked in the page
  - seed a test account with about 10 weeks of varied food, exercise and steps
  - screenshot at 1440 × 900 and 390 × 844
  - judge against **frontend-design** (hierarchy, copy, spacing, responsiveness) and **dataviz**
    (form, one axis, marks, labels, interaction, anti-patterns)

### Round 1

**Checks passed:**

- A tooltip shows the value and the day.
- The table shows 12 monthly rows.
- The chosen period is remembered.
- Picking a suggestion fills the address fields, and the address saves.
- No console errors, no overflow.
- **API:** 39 of 39. **Address mapping:** 3 of 3.

| # | Finding | Fix |
|---|---------|-----|
| 1 | Reference-line labels were drawn over the bars ("21 min a day = 150 a week" collided, worst on mobile) | The line is named in the legend with a line key, and nothing is drawn over the bars |
| 2 | X-axis labels collided at the right end ("15 Thu 16 Fri", "Oct 5 Oct 12") because the last label was forced | Labels are thinned counting back from the newest column |
| 3 | The y-axis was too loose (5K for about 2.4K of data), and the middle ticks weren't round (1.3K, 13) | Maximum chosen from 1/2/3/4/5/6/8/10 × 10ⁿ, so its half is round too (0 / 1.5K / 3K) |
| 4 | Empty charts showed nonsense ticks ("1, 1, 0") | Only the baseline when there's no data |
| 5 | Monthly stat tiles were diluted by months before logging started (28 kcal a day, 26 min a week); empty tiles said "0 kcal" | Averaged from the first period with data (now 125 kcal, 118 min); "–" with "No exercise logged" |
| 6 | Address suggestions opened under the hint text, away from the input | The list is anchored to the input |
| 7 | Address labels wrapped to two lines in the two-column grid | "Region (optional)" and "Postcode (optional)", with the detail in placeholders |

**Verification 1:** all seven fixed.

Two smaller items came up:

- The empty Steps subtitle read "Set a step target…, averaged per day". It was reworded, with a
  "Set a daily step target" link added.
- The body-and-goals error screenshot showed no errors. That was a test bug, not an app bug: it
  clicked the Profile section's disabled button. The test now targets the right form.

### Round 2: final verification

- **Dashboard scenario:** 15 of 15. That includes both field errors on the body form, with focus
  moving to the first invalid field.
- **Every earlier browser suite still passes:** exercise, AI states, rename, welcome back, account
  menu, accounts. The old account scripts were updated to the new layout.
- **APIs:** auth 46 of 46, reset/exercise 43 of 43, "Keep me signed in" 14 of 14, dashboard 38 of 39.
  - The one miss is expected. It checks "no key → 503", but this run deliberately had a fake key.
  - It shows the real error path: Google returned 400 for the invalid key, the app answered 502,
    and the UI showed "type it below".
  - The server log now also explains what to check for 400/403.
- **Design check passed:**
  - One hero figure per view.
  - Single-series charts in the brand colour, plus the reserved over-goal colour named in the
    legend.
  - One axis everywhere, with hairline grids and bars ≤ 24px with rounded tops.
  - The table view gives every value without hovering.
  - Keyboard focus shows the same tooltip as hover.
  - Copy is sentence case.
- **Not verified:**
  - a live Google Places call with a real key (none available)
  - a screen-reader pass
  - weeks starting on Sunday (not offered)

## Decisions

- **Inline SVG instead of a chart library:** no new dependency, full control of the dataviz specs,
  and the charts match the design tokens. `ColumnChart` is the one shared component.
- **Bars, not lines:** each period is a separate amount (a day, a week, a month), so bars read as
  "how much each". The goal and target are single reference lines on the same axis. There are no
  dual axes: burned and eaten are separate charts.
- **Steps are entered by hand:** this is a local web app with no access to phone health data.
  Sync is on the roadmap.
- **Address search is optional, never required:** the fields always work, so a missing or broken
  key never blocks saving an address.
