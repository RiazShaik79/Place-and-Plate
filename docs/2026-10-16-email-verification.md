# 2026-10-16: Email verification

## What was asked

Add a way to verify email addresses.

## Behaviour

- **New accounts:** creating an account sends a confirmation link to the address. The account
  starts unconfirmed (`users.email_verified_at` is null).
- **Not blocking:** you can use the app straight away. Until you confirm, an amber banner under the
  header says "Confirm your email address. We sent a link to …" with **Resend link**. Once
  confirmed, the banner disappears.
- **Opening the link:**
  - It works signed in or signed out.
  - `GET /api/auth/verify-email?token=` confirms the address and redirects to
    `/verify-email?status=…`.
  - That page explains the result: *Email confirmed*, *Email address updated*, *expired* (links
    last 24 hours), *already used*, *can't be used*, or *now used by another account*.
  - When you're signed in and the link can't be used, the page offers **Send a new link**.
- **Changing your email:**
  - Changing it in Account settings → Profile doesn't switch it straight away. It sets
    `users.pending_email` and sends the link to the **new** address.
  - You keep signing in with the old address until that link is opened. A typo or a mistyped
    address can't lock you out, and someone with brief access to your session can't silently take
    over the account by changing the email.
  - The Profile panel shows "Waiting for you to confirm …" with **Resend link** and **Cancel the
    change**. Cancelling voids the link.
  - If another account takes that address before the link is opened, the change is refused
    ("now used by another account") and your sign-in email stays as it was.
- **Password reset counts as confirmation.** The reset link went to that inbox, so completing a
  reset marks the address as confirmed.
- **Resends** are limited to 3 per user per 15 minutes.
- **Delivery:** like password reset, there's no mail provider, so `sendVerificationEmail` in
  `lib/mailer.ts` prints the email and its link in the server console.

## Implementation

- **Data:**
  - an `email_verifications` table: `token_hash` (SHA-256 of a 32-byte random token), `user_id`,
    `email`, `created_at`, `expires_at` (24 h), `used_at`
  - two additive columns on `users`: `email_verified_at` and `pending_email`
- **Links:**
  - A new link for an address replaces that address's older ones.
  - `completeEmailVerification` runs in one transaction, so checking the token, applying the change
    and burning the token all happen together.
- **Routes:**
  - `POST /api/account/verify-email` resends, to the pending address if there is one, otherwise to
    the unconfirmed sign-in address.
  - `DELETE /api/account/pending-email` cancels a change.
  - `PATCH /api/account` now saves name and weight immediately and starts a pending change for a
    new email.
- **Remembered device:** confirming an email change also updates the "Welcome back" details on
  that browser.
- **UI:**
  - `ResendVerification`, used in the banner, the Profile panel and the result page
  - the banner in `Header`
  - the Profile status: "Confirmed. You use this to sign in.", "Not confirmed yet…", or the
    pending-change panel
- **Existing accounts:** they start unconfirmed and see the banner. Use **Resend link**; the link
  appears in the `npm run dev` terminal.

## Verification

- **API, reading the real links from the server's console log:** 34 of 34.
  - not signed in → 401
  - sign-up sends a link; opening it confirms (also when signed out); used, garbage and missing
    links are refused
  - resending when already confirmed → 400
  - changing to another account's email → 409
  - a change stays pending, and the old email signs in while the new one doesn't
  - resend goes to the pending address and replaces the old link
  - opening the link switches the sign-in email
  - a cancelled change's link stops working
  - an address taken meanwhile is refused
  - an expired link is refused
  - the 4th resend in 15 minutes → 429
  - links last 24 hours
  - completing a password reset confirms the email
  - all three result pages render
- **Browser, at 1440 and 390:** 15 of 15.
  - the banner shows after sign-up, Resend confirms it was sent, and the pending change is
    explained
  - the email field keeps showing the sign-in email
  - opening the change link in the browser updates the account, and the banner disappears
  - no console errors, no overflow
- **Design review fixed three things:**
  - The banner repeated the address after a resend. It now says "New link sent."
  - On phones, the warning icon wrapped onto its own line. It now sits beside the text.
  - "Not confirmed yet" competed with the pending-change panel. Only one status shows now, and the
    save note says "Confirmation link sent".
- **Regression:** every earlier suite still passes. Two scripts were updated for the earlier
  "sign in lands on the Dashboard" change.
- **Not verified:** real email delivery (no provider is connected).

## Next steps

- **Delivery:** connect a mail provider in `lib/mailer.ts` (Resend, Postmark or SES) before hosting.
- **Optional:** require a confirmed email for sensitive actions (for example data export, once that
  exists), or before first sign-in on a hosted deployment.
