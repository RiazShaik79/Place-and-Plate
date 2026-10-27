# 2026-10-14: Gemini AI nutrition lookup API

## What was added

Two backend routes that estimate nutrition with Google Gemini. The frontend is unchanged; these
will be connected to the UI in the next phase.

| Route                 | Input                                                  | Output              |
| --------------------- | ------------------------------------------------------ | ------------------- |
| `POST /api/ai/text`   | JSON `{ description }` (≤ 500 chars)                   | `NutritionEstimate` |
| `POST /api/ai/image`  | multipart `image` (JPEG/PNG/WebP/HEIC ≤ 10 MB) + optional `hint` | `NutritionEstimate` |

`NutritionEstimate` = `{ items: [{ name, portion, calories, protein, carbs, fat }], totals, notes }`.

New and changed files:
- `lib/gemini.ts`: the Gemini client (prompt, response schema, error mapping, validation)
- `lib/types.ts`: added `NutritionItem` and `NutritionEstimate`
- `app/api/ai/text/route.ts` and `app/api/ai/image/route.ts`: input validation and HTTP mapping

### Verified manually against the live API
- "grilled chicken with rice and salad" → 3 items (chicken 150 g, rice 1 cup, salad), 565 kcal
- "a red bicycle" → `items: []` with an explanatory note
- A public-domain photo of a spread of foods → 7 items identified, about 5 s response time
- The same photo with the hint "just the fish and the broccoli" → only those 2 items
- Bad input: empty description, invalid JSON, missing image, `text/plain` upload and a
  JSON body to the image route all return 400 or 415 with a clear message

## Decisions

### Model: `gemini-3.5-flash-lite` instead of the requested `gemini-2.5-flash-lite`
- The brief specified `gemini-2.5-flash-lite`, but the API returned **404: "This model
  models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to
  use models/gemini-3.5-flash-lite"**.
- We used Google's named replacement, which is still the cheap, fast "flash-lite" tier.
- The model is read from `GEMINI_MODEL` (with that default), so switching back is just a config
  change if 2.5 access becomes available.

### Direct REST `fetch` instead of the `@google/genai` SDK
- It's one endpoint (`generateContent`) with a small JSON body, so an SDK would add a
  dependency and bundle weight for little gain. This matches the project's dependency-light rule.
- **Trade-off:** we maintain the request and response shapes ourselves. If we later need
  streaming, file uploads over 20 MB, or chat sessions, switching to the SDK makes sense.
- We used the `generateContent` endpoint rather than the newer "Interactions API" that Google's
  error message mentions. `generateContent` is stable, well documented and enough for
  single-shot requests.

### Structured output via `responseSchema`
- Gemini is forced to return JSON matching a fixed schema (`items[]` + `notes`), so we never
  parse prose or markdown-fenced JSON.
- `temperature: 0.2` keeps estimates consistent between identical requests.
- A `notes` field holds the model's assumptions (portion sizes, cooking oil, dressing). The UI
  can show these so users understand the estimate.

### Model output is validated, and totals are computed by the server
- Even with a schema, values are checked: non-numeric, negative or missing numbers become 0,
  items without a name are dropped, and values are rounded to 0.1.
- `totals` is **summed by the server**, not taken from the model, because LLMs can get
  arithmetic wrong.

### One shared response shape for text and image
- Both routes return `NutritionEstimate`, so the frontend can use one review-then-log component
  for either input method.
- Each item has a free-text `portion` rather than catalogue-style servings. AI items aren't
  catalogue foods, so forcing them into `{ foodId, servings }` would be lossy.

### Images sent inline as base64 (not via the Files API)
- Meal photos are small. Inline data is a single request with nothing stored on Google's side.
- The 10 MB upload cap keeps the base64 payload (about 33% larger) well under Gemini's 20 MB
  inline request limit. The allowed types are those Gemini accepts (JPEG, PNG, WebP, HEIC/HEIF).
- An optional `hint` field lets the user narrow the analysis (for example "only my plate"),
  which proved effective in testing.

### AI routes don't write to the database
- They return estimates only. Saving is a separate, explicit user action, to be built in the
  next phase. It will need a way to log non-catalogue items (for example making `food_id`
  nullable or using an `ai:` prefix).

### Errors and security
- The key is read only on the server and sent in the `x-goog-api-key` header, never in the
  URL, so it can't leak via logged URLs.
- Gemini's raw error body is logged on the server only. Clients get a short message with a
  meaningful status: 429 rate limit, 502 upstream failure or 30 s timeout, 500 missing key.
- Input length caps (500 or 300 chars) limit prompt-injection surface and token cost.

## Known limitations / follow-ups
- Non-catalogue AI items can't be saved to the log yet (the schema needs a small change).
- No rate limiting on our own routes. That's fine for a local single-user app, but needed
  before any deployment.
- No automated tests. Gemini calls should be mocked at the `fetch` level.
- Estimates from photos are inherently approximate (portion size is hard to judge from an image).
