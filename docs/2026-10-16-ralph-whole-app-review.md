# 2026-10-16: Whole-app Ralph review

## Scope

A review of the whole app rather than one feature, after the move to MySQL. It ran as three Ralph
rounds. Each round followed the same steps:
1. Rebuild and serve the production build on port 3100, against MySQL.
2. Screenshot every page at 1440×900 and 390×844 in two states:
   - **a brand-new account:** empty states, plus the unconfirmed-email banner
   - **a seeded account:** 70 days of food, exercise and steps
3. Screenshot the account menu and a forced "day failed to load" error.
4. List the problems, fix them, rebuild and run every test suite again.
5. Judge the result against the frontend-design criteria:
   - hierarchy, spacing, typography and copy
   - templated tells
   - accessibility and responsiveness
   - no horizontal overflow, no console errors

## Round 1: what Ralph found

1. **Bug: another day's numbers showed after a failed load.** On Food and Exercise, moving to a day
   whose load failed kept the previous day's entries on screen under the new day's heading.
2. **The error was hard to see and contradicted.** The "Couldn't load this day's log" notice sat
   below the summary, off-screen on a phone. The summary above it said "2,000 kcal left, 0 eaten"
   about a day that never loaded.
3. **A new account's dashboard was four blank charts.** It also showed an empty macro panel and
   "–" tiles, and nothing said what to do next.
4. **Out-of-date back link.** The account page's "Back to today" went to Food, but home has been
   the Dashboard since the landing change.

### Round 1: what was improved

- **Load failures:**
  - Entries are cleared as soon as the day changes.
  - The notice sits directly under the day heading.
  - The summary and log are hidden until a retry succeeds. They use `hidden` and are not
    unmounted, so a half-finished search or AI review in the add panel survives.
- **Empty dashboard:** a period with no food, exercise or steps now shows one panel: "Nothing
  logged in the last 14 days". It has **Log food** (primary) and **Log exercise**. The
  Daily / Weekly / Monthly switch stays, so other ranges can still be checked.
- **Back link:** it now reads "Back to dashboard" and links to `HOME_PATH`.

## Round 2: what Ralph found

1. **Today was judged as if it were over.** With breakfast and lunch logged (724 kcal), today's
   bar was drawn like a finished day. It also:
   - lowered "Average eaten per day"
   - counted as a "Day within goal" (any half-logged day is under goal)
   - did the same to steps
2. **First-day copy** (found while checking the fix for 1): an account with only today's meals saw
   "Log meals to see your macro split" right after logging one.

### Round 2: what was improved

- **Server (`lib/history.ts`, `/api/history`):**
  - Buckets leave out **today's food and steps**.
  - Exercise stays in: burned calories and minutes only add up, so a partial day is still accurate.
  - Today's running totals come back separately as `history.today = { eaten, steps }`.
- **Charts, daily view:**
  - Today's column shows the running total with a dashed basil outline and a light fill.
  - The legend has a "Today so far" key, and the tooltip says "So far. Counts once the day is
    over."
  - Identity never relies on colour alone: the outline, legend key, tooltip and table all say it.
- **Overview:**
  - The average reads "… across 10 logged days (today counts once it's over)".
  - Tiles with only today's data say "Today counts once it's over" instead of "Nothing logged".
  - A first-day account sees **Eaten today so far** as the hero, not the empty state.
- **Week and month:** tooltips count one day fewer in the current bucket.
- **Table:** today's row reads "724 so far" / "Today".
- **Macro panel:** a first-day account sees "Your split starts tomorrow…".

**Result on the seeded account:** the average moved from 1,437 kcal (11 days, including a
half-logged today) to 1,509 kcal (10 finished days). "Days within goal" went from 11 of 11 to
10 of 10.

## Round 3: what Ralph found

- **Stale copy:** the sign-in and create-account footer still said "Your log is stored on this
  computer", which was written for the SQLite file. It now says "Your log is private to your
  account: only you can see it."
- **Nothing else worth changing.**

## How the design skill verified it

- **Hierarchy:** each page still has one hero number and one bold element. The meal-segmented bar
  stays the only loud thing on Food, and the eaten chart leads the dashboard. The new "so far"
  column is quieter than the finished days.
- **Empty and error states give direction, not mood:**
  - the empty dashboard names the two actions
  - the load error says what to check and offers Retry
  - neither shows numbers that aren't true
- **Copy:**
  - sentence case and plain verbs
  - buttons say what happens ("Log food", "Back to dashboard")
  - no `·`-joined meta, no arrows, no all-caps labels
- **Charts (dataviz rules):**
  - one axis
  - the reference line is named in the legend
  - the partial column has its own legend key and tooltip
  - a table view of every number
- **Responsive and accessible:**
  - no horizontal overflow at 390 or 1440
  - the error notice is the first thing under the heading on a phone
  - focus rings unchanged
  - no console errors

## Checks (production build, MySQL)

- **Typecheck and build:** clean after every round.
- **API suites:**
  - auth 46
  - reset/exercise 43
  - "Keep me signed in" 14
  - verification 34
  - race 6
  - dashboard 41: updated to the new `today` contract (today's food and steps are now separate).
    The one failing check, "places not configured → 503", fails only because this server has a
    Places key.
- **Browser suites:**
  - landing 9, verification 15, welcome-back 23, rename 19, account 16, exercise states 13,
    dashboard 15
  - **new:** first-day dashboard 7 (desktop + mobile: not the empty state, the "so far" hero,
    the tile copy)
- **Cleanup:** test accounts (`@example.com`) were deleted afterwards. The real accounts were
  untouched.

## Files changed

- `components/CalorieTracker.tsx`, `components/ExerciseTracker.tsx`: clear on day change, notice
  placement, hidden-on-failure.
- `components/Dashboard.tsx`:
  - empty state
  - today so far (charts, legend, overview, table, macro copy)
- `components/ColumnChart.tsx`: `partial` tone (dashed outline, light fill).
- `lib/history.ts` (`todaySoFar`), `lib/types.ts` (`History.today`), `app/api/history/route.ts`.
- `app/account/page.tsx`: back link.
- `components/AuthShell.tsx`: footer copy.
