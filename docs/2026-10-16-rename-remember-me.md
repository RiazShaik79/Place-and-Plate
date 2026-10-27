# 2026-10-16: Renamed to Plate & Pace, "Keep me signed in", exercise Photo tab removed

## What was asked

1. A new name that suits both calorie and exercise tracking.
2. A "remember me" option on sign-in, so a returning user on the same browser or device doesn't
   need their password again.
3. Remove the Photo option from the exercise page, and only that.

## 1. The name: Plate & Pace

**Chosen: Plate & Pace.**

- "Plate" is what you eat and "Pace" is how you move: the two halves of the app.
- It's short, says what the app does, and has a natural rhythm.
- It fits the existing logo, a plate with a filled quarter, which also reads as a clock face
  (pace, time).
- No new artwork was needed, and the basil palette still fits.

**Also considered:**

| Name | Why not first |
|------|---------------|
| Tally | Calories in and out, balanced. Short, but generic and widely used |
| Fuel & Move | Clear, but "fuel" leans towards sports nutrition |
| Ember | Calories as energy that burns. Distinctive, but says nothing about food |
| Balance | Fits the in/out idea, but very common and abstract |

**Implementation:**

- `lib/brand.ts` exports `APP_NAME`, used by the header, the auth pages, every page title, the
  root metadata (with a new description) and the reset email. The npm package name is now
  `plate-and-pace`.
- **Kept on purpose:** the database file (`data/calorie-tracker.db`) and the session cookie
  (`ct_session`). Renaming them would orphan existing data and sign everyone out.
- Copy that only talked about food now covers both:
  - **Sign-in:** "Pick up your meals and workouts where you left off."
  - **Create account:** "Log what you eat and how you move, and see each day add up against your
    goal."
  - **Auth panel:** "…or snap a photo of your plate." Photos are now food-only.

## 2. Keep me signed in

- **On the sign-in form:** a checkbox, **ticked by default**. The line under it changes with the
  choice:
  - "You won't need your password again on this device."
  - "You'll be signed out when you close the browser."
- **Ticked:** a persistent cookie and a 30-day session.
- **Unticked:** a browser-session cookie (no `Expires`), and the database session idles out after
  12 hours.
- **Renewal:** `requireUser()` renews a session once half its life is used. It extends the
  database row and re-sends the cookie (with `Expires` only when remembered). Someone who uses
  the app regularly on their own device effectively stays signed in, and a short session ends
  after 12 idle hours or when the browser closes.
- **Database:** `sessions.remember` was added with an additive migration (`DEFAULT 1`, so
  existing sign-ins keep working). `POST /api/auth/login` accepts `remember`, and only an
  explicit `false` gives a short session.
- **Not changed:** creating an account and resetting a password still start a remembered
  session, as before. Changing the password still signs out other devices.
- **Why ticked by default:** this is a personal app, and the request was to avoid re-typing
  passwords. The hint explains the alternative for shared computers.

## 3. Exercise Photo tab removed

- **Removed:**
  - the Photo tab from the exercise "Add exercise" panel, which now shows Search and Describe as
    two equal tabs
  - `components/ExercisePhotoLookup.tsx`, which nothing used any more
- **Unchanged:**
  - the food Photo tab
  - sessions already logged from a photo, which keep their "Photo" badge
  - `POST /api/ai/exercise/image`, kept as API only because it was an explicit earlier
    deliverable (CLAUDE.md says so). Deleting it is a one-line follow-up if wanted.

## How the Ralph loop ran

The Ralph Loop plugin was set for 3 iterations. My first setup call split on `;` and started the
loop with **no limit and no completion promise**. I spotted this straight away and corrected its
state file to `max_iterations: 3` and `completion_promise: "RENAME POLISHED"`.

Each round had three steps:

1. **Rebuild** and serve the production build on port 3100. Your own `npm run dev` was left
   running.
2. **Screenshot** at 1440 × 900 and 390 × 844 with the headless Chrome CDP driver.
3. **Judge** against the frontend-design criteria.

The driver gained `allCookies()`, so the test checks the **real browser cookie**, including
httpOnly ones.

### Round 1

**Browser checks passed 19 of 19:**

- The title is "Sign in to Plate & Pace".
- The option is ticked by default.
- Space toggles it, and the hint text follows.
- Unticked gives a real session cookie (`session: true`).
- Ticked gives a persistent cookie of about 30 days, httpOnly, SameSite=Lax.
- The exercise tabs are exactly Search and Describe, and the food tabs are unchanged.
- No console errors, no overflow.

**API checks:** "Keep me signed in" passed 14 of 14:

- the cookie type for each choice
- the stored flag
- omitting the option means ticked
- fresh sessions aren't re-issued
- renewal at half-life for both kinds
- an idle short session gets 401

The existing suites still pass: reset/exercise 43 of 43, auth 46 of 46.

| # | Finding | Fix |
|---|---------|-----|
| 1 | Sign-in intro was food-only ("Pick up your food log…") under the new name | "Pick up your meals and workouts where you left off." |
| 2 | Create-account intro was food-only | "Log what you eat and how you move, and see each day add up against your goal." |

### Round 2: verification

- **A fresh build, with everything re-run:**
  - rename browser checks: 19 of 19
  - exercise and reset screens (no Photo tab, Undo works, no overflow)
  - exercise behaviour: 13 of 13
  - account behaviour: 16 of 16
  - APIs: 14 + 43 + 46
- **Design check passed:**
  - The checkbox sits between the password and the primary button, where people expect it.
  - It uses the same custom checkbox as the review lists, with a visible focus ring.
  - The two-tab exercise panel reads cleanly.
  - The name fits the header at 390 px next to the date and avatar.
- **Not verified:** an actual browser restart (the cookie type was checked instead), password
  manager behaviour, and a screen-reader pass.

Test accounts (`@example.com`) were deleted afterwards. The owner's account was not touched.

## Follow-up: "Keep me signed in not working, it asks for the password every time"

**What the evidence showed:**

- **The app keeps you signed in.** A real Chrome restart test against the running dev server:
  - signed in with the box ticked, quit Chrome completely, relaunched it with the same profile
  - the 30-day cookie was still there and the app opened without a password
  - unticked, the cookie was gone and the app went to sign-in, as designed
- **No session rows existed for the owner's account.** Rows don't disappear when a browser closes
  or a cookie is lost. They're removed by **Sign out** (or a password reset). So the reported
  "every time" came after signing out, which by design asks for the password again.
- **IT policy blocks password autofill.** The registry shows `PasswordManagerEnabled = 0` for both
  Chrome and Edge. The browser can never fill the password in, so signing back in always meant
  typing the email *and* the password. No browser policy clears cookies.

**What changed:**

- **Remembered on this device.** A sign-in with the box ticked, and account creation, now also
  sets `ct_device_user`. It's an httpOnly cookie kept for a year, holding only the email and
  name, never a password.
- **After signing out, the sign-in page shows:**
  - "Welcome back, Riley", with "Enter your password to continue."
  - the email already filled in, and the cursor in the password field
  - "Not Riley?", which clears the remembered person (`POST /api/auth/forget-device`) and shows
    the blank form
- **An unticked sign-in removes it.** That's the right behaviour for a shared computer.
- **Changing your name or email** on the account page updates the remembered details.
- **Clearer copy:**
  - The checkbox hint now says "Stay signed in on this device until you sign out."
  - When the person is remembered, the signed-out notice adds "Next time, close the tab instead
    to stay signed in."
- **What wasn't changed:** signing back in after signing out still needs the password, as a
  sign-out should. Skipping it would let anyone at the computer back in.

**Verification:**

- **The welcome-back scenario passed 23 of 23** at 1440 and 390, including:
  - a fresh browser shows the plain sign-in
  - after sign-out: the greeting, the filled email, focus on the password, and the notice
  - signing back in with only the password
  - "Not you?" clears the remembered person, focuses the email field, and survives a reload
  - an unticked sign-in leaves no device cookie
  - no console errors, no overflow
- **The real-restart test passed** for both choices.
- **Regressions:** rename 19 of 19, "Keep me signed in" API 14 of 14, auth 46 of 46,
  reset/exercise 43 of 43.
