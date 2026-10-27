# 2026-10-16: Accounts, then a Ralph review loop

## Goal

Add create account, sign in and sign out, plus an account page to update the profile. The
accounts had to fit the existing tracker without breaking it, and meet the same quality bar:
a real product, a clean layout, intuitive on first use, good on desktop and mobile, and proper
error messages.

## What was built

- **Data:** `users` and `sessions` tables, plus a `user_id` column on `log_entries`. The
  calorie goal moved from the global `settings` table to `users.calorie_goal`.
  - Upgrading loses nothing: the first account created adopts every pre-accounts entry and the
    old global goal.
- **Auth, with no new packages:** `lib/auth.ts`.
  - Passwords use scrypt from `node:crypto` with a per-user salt, compared with `timingSafeEqual`.
  - Sessions are database-backed. The browser gets a random 32-byte token in an `httpOnly`,
    `SameSite=Lax` cookie (`Secure` in production), and the DB stores only its SHA-256 hash.
    Sessions last 30 days.
  - Sign-in is throttled after 5 failures per email for 15 minutes (in memory).
  - An unknown email is checked against a dummy hash, so it takes as long as a wrong password
    and gets the same message.
- **Routes:**
  - `POST /api/auth/register|login|logout`.
  - `GET/PATCH /api/account` for the profile.
  - `PUT /api/account/password`, which signs out every other device.
  - Every existing route (log, settings, AI) now requires a session and is scoped to the user.
    Deleting another user's entry returns 404.
- **Pages:**
  - `/login` and `/register`: a form beside a preview of a logged day on wide screens.
  - `/account`: the profile (name, email, daily goal), password and sign-out sections.
  - `/` redirects to `/login` when signed out.
  - The header gained an initials avatar with a keyboard-navigable menu (Account settings,
    Sign out).
- **Integration:**
  - `apiFetch` sends any 401 to `/login?expired=1&next=…`, which shows "Your session ended".
  - Sign-out first flushes removals still in their Undo window, using an `onBeforeSignOut`
    hook, so no delete is lost.
  - The goal is server-rendered into the tracker, so there's no loading flash.
  - A new account gets a one-time welcome toast.

## How the loop ran

The Ralph Loop plugin ran with `--max-iterations 3`. Each round had two steps:

1. **Review and fix.** Screenshot every state at 1440 × 900 and 390 × 844 with a headless
   Chrome CDP driver, list the problems, and fix them.
2. **Verify with the frontend-design skill.** Check hierarchy, spacing, type, copy, templated
   tells, accessibility and responsiveness, and measure `scrollWidth` against `innerWidth`.

The scripted states:

- Sign-in: empty, field errors, wrong password, signed out, session expired.
- Create account: field errors, then success.
- The tracker with the account menu open.
- The account page: default, saved, profile errors, wrong current password.

No AI route was called with a session, so no Gemini quota was used.

**The design plan, set before any code (frontend-design skill):**

- Keep the sage/basil tokens and Figtree, so accounts feel native.
- Spend the one bold moment on the auth screens: a basil panel showing the product's real
  signature, the meal-segmented calorie bar, instead of a gradient or testimonial.
- Plain copy: "Sign in", "Create account", "Save changes", "Change password".
- Avoid all-caps labels, `·` meta strings and arrows in buttons.

## Round 1

The API smoke test passed 46 of 46 checks. It covered:

- 401 on every route without a session.
- Field-level 400s.
- A 409 for a duplicate email.
- Email normalisation, and a cookie that is HttpOnly and SameSite=Lax.
- Per-user isolation of entries and goals.
- Logout, and case-insensitive login.
- A password change that signs out the other device and rejects the old password.
- A 429 after 5 failed sign-ins.

| # | Finding | Fix |
|---|---------|-----|
| 1 | A field with an error turned green on focus (`focus:border-basil` beat `border-over`), so the field being fixed lost its error state | `inputState()`: invalid fields stay red, with a red focus ring |
| 2 | Desktop "Sign out" panel: a long email in the 200 px column ran into the button, and a whole two-column panel was spent on one action | A single row, with the email set in `break-all` |
| 3 | The goal hint and error wrapped to two lines (the width cap was on the wrapper) | New `inputClassName` prop caps only the input |
| 4 | Mobile auth form was vertically centred, leaving a ~200 px empty band | Top-aligned on phones, centred from `sm` up |
| 5 | The account menu truncated long emails with no way to read them | A `title` with the full address |

**Verification 1:** all five fixed. No overflow at either size, and no console errors.

## Round 2

| # | Finding | Fix |
|---|---------|-----|
| 6 | The register intro was filler ("takes a few seconds…"), and phones don't see the preview panel | The intro now says what the app does |
| 7 | A new account landed on an empty tracker with no acknowledgement | A one-time toast: "Welcome, Priya. Log your first meal below." |

**Verification 2** ran a scripted check that passed 16 of 16 at both sizes:

- The welcome toast appears once.
- The menu opens on Enter and focuses the first item.
- ArrowDown moves through the items and wraps.
- Escape closes the menu and returns focus to the button.
- A goal set on the account page shows on the tracker, and a goal edited on the tracker shows
  on the account page.

It found one issue: the welcome toast wrapped to two lines inside a pill on mobile. The copy
was shortened.

## Round 3: final verification

- A full re-shoot of every state: no overflow (1440 = 1440, 390 = 390) and no console errors.
  The round 1 and round 2 fixes all hold.
- `npm run typecheck` and `npm run build` are clean. The API check still passes 46 of 46, and
  the browser check 16 of 16.
- The design check passed. The auth screens have one bold element, and the tracker's segmented
  bar still owns the main page. Copy is sentence case with verb-led buttons. Errors say what
  happened and how to fix it. Colour is never the only signal: errors also carry an icon and
  text tied to the field with `aria-describedby`.
- **Accepted:** an unusually long email breaks mid-word in the Sign out row on phones. That is
  the intended fallback.
- **Not verified:** a real phone, password-manager autofill, and a screen-reader pass.

## Decisions

- **Database sessions instead of signed JWTs.** Signing out and a password change revoke
  sessions immediately, and only a hash of the token is stored. It needs no secret env var
  and no packages.
- **Route handlers instead of server actions.** This matches the rest of the app (fetch +
  JSON), and the forms can show field-level errors from `{ error, field }`.
- **The first account adopts legacy data.** An existing single-user install keeps its history
  when it becomes multi-user. Accounts created after the first start empty.
- **No password reset by email:** the app is local-only, with no mail transport. It's on the
  roadmap with hosting.
