# components/: pages, features and UI patterns

Read the root `CLAUDE.md` first (design system, conventions). This file is the detailed feature
catalogue and how the UI is put together.

## Pages and features

- **Accounts**:
  - `/register`, and `/login` with "Forgot password?" and **Keep me signed in** (ticked by default).
  - Sign out from the header menu or `/account`.
  - **Ticked:** a 30-day cookie renewed while in use, and the person is remembered on that browser
    (`ct_device_user`, email and name only). After a sign-out, `/login` says "Welcome back, Name"
    with the email filled in ("Not you?" clears it).
  - **Unticked:** a browser-session cookie with a 12-hour idle limit, never remembered.
- **Email verification**:
  - Sign-up sends a one-time 24-hour link: `/api/auth/verify-email?token=` →
    `/verify-email?status=verified|changed|expired|used|invalid|taken`.
  - It doesn't block anything: an amber banner under the header ("Confirm your email address…
    Resend link") until confirmed.
  - **Changing your email** sets `pendingEmail` and sends the link to the new address. You keep
    signing in with the old one until the link is opened, and "Cancel the change" voids it.
  - Resends are limited to 3 per user per 15 minutes.
  - Completing a password reset also confirms the email.
  - Links print in the server console (`lib/mailer.ts`).
- **Password reset**:
  - `/forgot-password` → a one-time 30-minute link → `/reset-password?token=`.
  - All devices are signed out, and you're signed in on this one.
- **Home is the Dashboard** (`HOME_PATH` in `lib/account.ts`):
  - signing in and a password reset land on `/dashboard`
  - a `?next=` page wins
  - creating an account lands on Food (nothing to chart yet)
- **Header**:
  - the logo links to the dashboard
  - the Dashboard / Food / Exercise switch is inline from `md`, and a second row on phones
  - today's date
  - the avatar menu (keyboard: Enter, arrows, Escape)
- **Food** (`/`, `CalorieTracker`):
  - **Summary:**
    - the "kcal left" hero, and a goal bar split per meal (green; amber at 90% or more; red over
      100%)
    - macro bars
    - "Burned N kcal" links to the same day's exercise (it doesn't change the budget)
  - **Water card** (`WaterCard`):
    - litres against the target (default 2 L)
    - "+ Glass 250 ml" and "+ Bottle 500 ml", with a toast offering Undo
    - Edit sets an exact total
  - **Meal cards** (`FoodLog`):
    - Breakfast, Lunch, Dinner and Snacks are always shown.
    - Tap an entry to **edit servings or move it to another meal**; the remove button offers Undo.
    - An empty meal offers **"Same as yesterday"** (or the weekday when viewing a past day), with a
      confirm step and then Undo.
  - **Add panel** (`AddFoodPanel`, tabs stay mounted):
    - the meal picker is preselected from the time of day
    - **Recent** (`RecentFoods`): favourites ★ plus the last 60 days. It opens first once you've
      logged anything; `hasHistory` comes from the server so the tabs don't flip while loading.
    - Search (the 30-food catalogue)
    - Describe (AI) / Photo (AI): results go to a **review list with checkboxes**, and nothing is
      logged until confirmed
- **Exercise** (`/exercise?date=`, `ExerciseTracker`):
  - kcal burned, active minutes
  - **Steps card** (`StepsCard`): enter the day's count, with a meter against the target
  - The tab reads **Activity** (the URL stays `/exercise`).
  - **Sleep card** (`SleepCard`): the night that ended on the viewed day. Bedtime and wake time
    (`type="time"`) with a live duration (across midnight), an optional 1–5 "how rested"
    (radio buttons), and Save / Cancel / Clear. Impossible nights (under 30 min, over 16 h) get an
    inline error.
  - **Weight card** (`WeightCard`): the day's weigh-in (Add weight / Edit; an empty value clears it).
    The newest becomes the current weight, and the page refreshes so exercise calories use it.
  - a 7-day strip against the WHO 150 minutes a week
  - Add: Search (27 activities) / Describe (AI). There's no Photo tab; the image API route remains.
- **Dashboard** (`/dashboard`), view only (everything is logged on Food or Exercise):
  - **Period switch:** Daily, Weekly (12 Monday-start weeks) or Monthly (12 months), remembered per
    browser. The layout follows the *loaded* history's period, so a switch never mixes two layouts.
  - **Every card names its period** in a small badge (`CardHeader` / `PeriodBadge`): "Today",
    "Last 12 weeks" or "Last 12 months".
  - **Daily (`TodayView`):** today at a glance, with no charts and no averages.
    - six equal cards, two to a row (one on phones): calories eaten (bar ok/near/over, plus a text
      pill), calories burned (with the minutes), active minutes (of 21 a day), steps (of the
      target), water (of the target), weight (`WeightPanel variant="today"`: the latest weigh-in
      and progress to the goal), sleep (`SleepToday`: last night against the target, the rested
      label and the times)
    - then today's macro split
    - nothing logged shows 0 in faint type, with a link to where to log it
    - every card has the same shape (number, then a bar or a note), so rows line up without empty
      space
  - **Weekly / Monthly:**
    1. the **Overview**: average eaten per logged day against the goal, plus tiles for days within
       goal, burned per day, active minutes a week and steps per day
    2. calories burned (average line) and active minutes (21 min a day line), side by side
    3. a **carousel** (`Carousel`) of four equal chart cards, two in view on wide screens and one
       on phones:
       - calories eaten (over-goal bars red, goal line)
       - steps (target line)
       - water (target line, litre axis)
       - weight (`WeightPanel variant="chart"`: a `LineChart` of weigh-ins with a smoothed trend
         and goal line; the summary in the subtitle; a weigh-ins table)
       - sleep (average per night logged, with an hours axis and a target line)
    4. macro split against 30/40/30
    5. a table view of every number
  - **The current period is unfinished:** the newest column is a dashed "This week so far" / "This
    month so far", kept out of averages.
  - **No data in the period** (weekly / monthly): one empty panel with Log food / Log exercise, and
    the Weight card.
- **Account** (`/account`, `AccountSettings`):
  - **Profile:** name and email, with verification status and a pending-change panel.
  - **Body and goals** (`BodyGoalsSection`), in three groups:
    - **Daily targets:** calorie, step and water targets.
    - **About you:** year of birth, sex (optional), height, current weight, activity level.
    - **Weight goal:** goal weight and pace.
    - A live **suggested calorie goal** card (`lib/goals.ts`) with **Use N kcal**, and the BMI.
    - Saving a changed current weight logs it as today's weigh-in.
  - **Address** (`AddressSection`): Google Places search when the key is configured; the fields
    (street, unit, city, region, postcode, country) can always be typed.
  - Password, and sign out.

## State and data flow

- **Page state owners:** `CalorieTracker`, `ExerciseTracker` and `Dashboard`. Children get props and
  callbacks; local UI state is fine.
- **Removing an entry:** it disappears straight away, and `DELETE` is sent after 5 seconds unless
  Undo is pressed. Pending deletes are flushed with `keepalive` on `pagehide` and before sign-out.
- **A day that fails to load:**
  - its entries are cleared
  - only the Retry notice shows
  - the summary and log are `hidden`, not unmounted, so the add panel keeps a half-done search or
    AI review
- **Toasts:** every add and save shows one. Undo appears where it can be undone.
- **States everywhere:** skeletons, empty states, inline errors with Retry, focus rings, reduced
  motion.

## Charts

- **`ColumnChart`:**
  - one series, one axis, an optional reference line named in the legend
  - a hover/focus tooltip on each column
  - `tone: "partial"` draws the dashed "so far" column
  - `tickFormat` for unit ticks such as litres
- **`LineChart`:**
  - readings as dots with a 2px surface ring, and a 2px trend line
  - a y-axis that fits the data (weight doesn't start at 0)
  - a goal reference line
  - a focusable hit target per point
- **Every chart:**
  - has a legend; reference lines are line keys
  - has a table view
  - never uses colour alone: dashed outlines, keys and text say the same thing

## Shared pieces

- **Forms:** `FormField` (`TextField`, `PasswordField`, `SelectField`, `SubmitButton`).
- **Steppers:** `ServingsStepper` (shared by Search, Recent and the entry editor).
- **`Carousel`:**
  - a scroll-snap row with Previous / Next, dots and no autoplay
  - all slides stay in the DOM
  - every card fully in view has a filled dot, and a live region says what's in view
  - slides need `className="w-full"` on their panel so the heights match
  - the track has `scroll-px-1` so cards align with the grid above
- **Primitives:** `Notice`, `Toast`, `Spinner`, and `Icons` (inline SVG, 24px grid).
