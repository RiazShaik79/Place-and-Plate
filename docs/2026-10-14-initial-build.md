# 2026-10-14: Initial build

## What was built

A single-page calorie tracker (Next.js + TypeScript + Tailwind) that runs with `npm run dev` at
http://localhost:3000.

- Built-in catalogue of 30 common foods, each with serving size, calories, protein, carbs and fat
- Search bar that filters the catalogue as you type
- Add a food with a servings multiplier
- Daily log with the calorie total (and macro totals) at the top; entries can be removed
- Day navigation (previous / next / today)
- Log is persisted in a local SQLite database (`data/calorie-tracker.db`)

## Architecture

```
Browser (CalorieTracker client component)
   │  GET/POST /api/log, DELETE /api/log/:id
   ▼
Next.js route handlers (app/api/log)
   │  validate input, look up food in catalogue, compute nutrition
   ▼
lib/db.ts → SQLite (node:sqlite) → data/calorie-tracker.db
```

UI tree: `CalorieTracker` → `DateNav`, `DailySummary`, `FoodSearch` (→ `FoodRow`), `FoodLog`.

## Decisions

### SQLite via built-in `node:sqlite` (not better-sqlite3, Prisma, or localStorage)
- **Why SQLite:** the brief asked for a local database. SQLite is a real DB in a single file
  with zero setup, so it suits a single-user local app.
- **Why `node:sqlite`:** Node 24 ships SQLite natively. `better-sqlite3` needs native
  compilation, which often fails on Windows without build tools. Prisma/Drizzle add a
  migration and codegen workflow that's overkill for one table.
- **Why not localStorage/IndexedDB:** these would also persist across refreshes, but the data
  would be tied to one browser and be harder to grow into server-side features (e.g. AI lookups).
- **Trade-off:** requires Node ≥ 22.5. The API may print an experimental warning.

### Food catalogue as static TypeScript, not a DB table
- It's read-only reference data; keeping it in code makes it type-checked, version-controlled,
  and instantly searchable on the client with no network round-trip.
- When custom foods are added, a `foods` table can be introduced alongside it.

### Log entries snapshot nutrition values
- Each row stores name, serving size and the computed calories and macros. Changing the
  catalogue later won't silently alter past days' totals.

### Server computes nutrition; client sends only `{ foodId, servings, date }`
- There's a single source of truth for the maths, and the server validates input (known food,
  0 < servings ≤ 100, `YYYY-MM-DD` date).

### Dates are local-calendar strings chosen by the client
- "Today" depends on the user's timezone, which the server can't know. The client computes
  `YYYY-MM-DD` locally and sends it. Storing a plain date string makes per-day queries a simple
  indexed equality lookup.

### Route handlers instead of Server Actions
- Explicit REST endpoints are easy to test with curl and are reusable by future clients. The
  app is small enough that the extra fetch code is trivial.

### Single stateful client component
- `CalorieTracker` owns the date and entries; the other components are presentational. That's
  enough for this size, so there's no Redux, Zustand or React Query.

### Tailwind CSS v4
- It's the current major version: CSS-first config (`@import "tailwindcss"`), no
  `tailwind.config.js` needed.

### Project scaffolded by hand, not with `create-next-app`
- The folder already contained `.env` and `.gitignore`. Writing the handful of config files
  directly avoided conflicts and kept the setup minimal (no ESLint or sample assets).

## Not done / known limitations

- No automated tests yet.
- No editing of an existing entry's servings (remove and re-add instead).
- No daily goals.
- `GEMINI_API_KEY` in `.env` is unused for now.
