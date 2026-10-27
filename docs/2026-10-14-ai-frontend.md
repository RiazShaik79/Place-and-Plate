# 2026-10-14: AI lookup wired into the frontend

## What changed

The app now has **three ways to add food**, shown as tabs in the "Add food" card:

| Tab           | Flow                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------- |
| Quick add     | Unchanged: search the 30-food catalogue, set servings, Add                               |
| Describe it   | Type a meal in plain English → **Look up nutrition** → review list → **Add N items**     |
| Photo         | **Take photo** / **Upload photo** → preview (+ optional hint) → **Analyze photo** → review list → **Add N items** |

Everything persists to SQLite. AI entries show an "AI text" or "AI photo" badge in the food log.

### New files
- `components/AddFoodPanel.tsx`: the tab switcher
- `components/AiTextLookup.tsx`, `components/AiPhotoLookup.tsx`: the two AI input flows
- `components/EstimateReview.tsx`: a shared checkbox list for confirming AI items
- `components/Spinner.tsx`
- `lib/client.ts`: browser helpers (`requestEstimate`, `FriendlyError`, `prepareImage`)
- `app/api/log/custom/route.ts`: saves confirmed AI items

### Changed files
- `lib/db.ts`: `addCustomEntries()` (a transactional batch insert); the insert SQL is now shared
- `lib/types.ts`: added the `AiSource` type
- `lib/nutrition.ts`: `sumTotals` now accepts any `Totals[]` (log entries or AI items)
- `components/CalorieTracker.tsx`: added `logItems()` and renders `AddFoodPanel`
- `components/FoodSearch.tsx`: now a plain panel (the card and heading moved to `AddFoodPanel`);
  the "no match" message points to the Describe it tab
- `components/FoodLog.tsx`: added AI badges; AI rows show the portion instead of "N × serving"

## Decisions

### AI items stored in the existing table with `food_id = "ai:text" | "ai:photo"`
- No schema migration was needed: `food_id` stays `NOT NULL`, and the prefix marks
  non-catalogue entries. The estimated portion goes in `serving_size`, and `servings` is 1.
- Recording the source lets the UI show a badge and keeps later analysis (for example how
  often photos are used) possible.
- **Alternative rejected:** a nullable `food_id` plus a new `source` column. That's cleaner in
  theory, but it needs a migration on existing databases for no user-visible gain right now.

### A separate `POST /api/log/custom` endpoint rather than overloading `POST /api/log`
- The two request bodies are different (catalogue reference vs. explicit nutrition), so one
  endpoint each keeps validation simple and readable.
- It's a **batch** (1–20 items) in a **single transaction**: a photo usually yields several
  foods, and they should all save or none should.

### AI items: the client sends nutrition values, which bends an earlier rule
- In the first build, the server computed all nutrition from `foodId`. AI estimates have no
  catalogue entry to recompute from, and the user has already reviewed them, so the client sends
  the values.
- The server still validates them: the name is required (≤ 100 chars), the portion is ≤ 60
  chars, calories are 0–10,000 and macros 0–1,000 g. This is a local single-user app, so the
  risk is self-inflicted bad data, not abuse.

### A review step for both text and photo, not just photo
- The brief asked for confirmation on photos with multiple items. We applied the same review
  list to text lookups too, because they also often return several items ("chicken with rice
  and salad" → 3 items). One shared `EstimateReview` component keeps the experience consistent
  and the code smaller.
- All items start ticked; untick anything you didn't eat. The button shows the item count and
  total calories for the selection ("Add 2 items · 395 kcal"), so the effect is clear before
  confirming.
- The model's `notes` (its assumptions about portions, oil and dressing) are shown under the list.

### Separate "Take photo" and "Upload photo" buttons
- `capture="environment"` opens the rear camera directly on phones but blocks choosing from
  the gallery, so two hidden file inputs provide both options. On desktop, both open the
  file picker.

### Photos downscaled in the browser before upload
- Modern phone photos are often 5–15 MB, and the server limit is 10 MB. `prepareImage()`
  resizes to at most 1600 px on the long side and encodes as JPEG at quality 0.85, which is
  plenty for food recognition. Uploads are faster and stay well under the limit.
- If the browser can't decode the image (for example HEIC in Chrome), the original file is
  sent; the server accepts HEIC and Gemini can read it. The preview falls back to a text message.
- Small images (≤ 1600 px and ≤ 4 MB) are sent unchanged.

### Friendly errors via `FriendlyError`
- Every failure maps to a plain-English message: network down, rate limited (429), photo too
  large (413), wrong file type (415), missing API key (500), any other AI failure (502),
  "no food found" (an empty `items` list, shown together with the model's explanation), and
  a failure to save.
- Only `FriendlyError` messages are shown verbatim; unexpected errors become "Something went
  wrong. Please try again." so raw stack traces never reach the user.
- AI errors appear **inline in the relevant tab** (amber, so they don't read as a fatal error).
  Quick-add and delete errors keep using the existing banner.

### Loading states
- A spinner in the button plus a status line for text lookups. For photos, a spinner overlays
  the preview ("Analyzing your meal…"). The inputs are disabled while loading, so requests
  can't be sent twice.

### Tabs keep their panels mounted (`hidden`) instead of unmounting
- Switching tabs mid-lookup doesn't lose the typed text, the chosen photo or a pending review.

## Verified
- `npm run typecheck` and `npm run build`: clean.
- End to end over HTTP against live Gemini: text "two scrambled eggs and a slice of toast" →
  2 items → saved as `ai:text`; the test photo → 5 items → 2 selected → saved as `ai:photo`;
  quick-add still works; all 5 entries read back from the DB; test data was cleaned up.
- `POST /api/log/custom` rejects empty item lists, an unknown source, negative calories and
  missing names (all 400).
- **Not automated:** the in-browser interactions (clicking the tabs, the camera on a real phone, the
  preview rendering) were built but need a manual check.

## Follow-ups
- Let the user edit an item's portion or calories in the review list before logging.
- Automated UI tests (for example Playwright) with a mocked Gemini.
