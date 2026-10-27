# 2026-10-14: Ralph review loop and design polish

## Goal

Make the app look and feel like a real product: a clean, consistent layout and palette; intuitive
on first use; good on desktop and mobile; with loading, empty and error states. Also add a calorie
goal with a green/amber/red progress bar, a macro visual, meal categories, a header with today's
date, and card-style entries.

## How the loop ran

The Ralph Loop plugin was **not available** in this session (it didn't appear in the installed
skills), so the loop was run by hand as three explicit rounds. Each round had two steps:

1. **Review and improve.** Screenshot the running app, list the problems, fix them.
2. **Verify against the frontend-design skill.** Look at the new screenshots and judge them
   against the skill's criteria: hierarchy, spacing, typography, the templated "AI-look" tells
   to avoid, copy, accessibility, and responsiveness.

Screenshots came from headless Chrome, driven over the DevTools Protocol by a small script using
Node's built-in `WebSocket`. That gave true device emulation (390 × 844, mobile) plus scripted
clicks for tabs, row expansion, the goal editor, remove/undo and the AI review list. For the AI
review screenshots, `fetch` was **mocked in the page**, so no Gemini quota was used and nothing
was written to the DB.

## Round 0: baseline findings

| # | Finding | Severity |
|---|---------|----------|
| 1 | Total calories shown with no goal, no progress, no "left" | Missing feature |
| 2 | Macros were three coloured numbers, no visual and no targets | Missing feature |
| 3 | One flat list of 9 entries, no meal grouping | Missing feature |
| 4 | Page heading "Calorie Tracker" + bare ← → arrows; no date in the header | Layout |
| 5 | Quick add showed 30 rows, each with a servings box and a green Add button, the loudest thing on the page | Hierarchy |
| 6 | **Mobile overflow**: page was 429 px wide in a 390 px viewport (sideways scroll) | Bug |
| 7 | Default Tailwind slate/emerald, system font, `·`-joined meta lines, uppercase "AI PHOTO" badges | Generic look |
| 8 | Success messages were per-tab banners that stayed until the next action; no way to undo a delete | Interaction |

## Design plan (frontend-design pass, before code)

- **Subject:** a personal daily food log, mostly used on a phone right after eating. Its main
  job is to answer "how much is left today?" and make logging fast.
- **Palette:**
  - Base: cool sage-grey page `#F4F6F3` (deliberately not the cream / terracotta default),
    white surfaces, green-black ink `#1A2420`, brand "basil" `#24573F`.
  - Status: leaf `#2F8A57`, amber `#D4950F`, red `#C43D3D`.
  - Macros use food-derived hues: beet (protein), rice-water blue (carbs), olive-oil gold (fat).
- **Type:** Figtree, one family. It's rounded and friendly, not the default Inter. The hero
  number is 56–68 px extra-bold with tight tracking and tabular numerals.
- **The one memorable element:** the calorie bar is **split into one segment per meal**, so it
  shows where the calories went, not just a total. Everything else stays quiet.
- **Avoided on purpose:** all-caps eyebrows and badges, `A · B · C` meta strings, `→` in
  buttons, one radius on everything. Radii now encode hierarchy (panel 20 / card 12 / pill).

## Round 1: implemented

- `meal` column (with a migration that guesses meals for old rows from their local logging hour)
  and a `settings` table; `GET/PUT /api/settings`; `meal` required on both log POST routes.
- Header (logo, name, today's date), the day as the page heading, and a pill-shaped prev/next control.
- `DailySummary`: kcal left/over, inline goal editor (800–6000, validated on both sides), the
  meal-segmented status bar with a goal tick when over, and macro bars against 30/40/30 targets.
- `FoodLog`: four meal groups with subtotals and entry cards (macro dots, "AI"/"Photo" badges).
- `AddFoodPanel`: "Log it under" meal picker (preselected by time of day) and icon tabs.
- `FoodSearch`: quiet rows; tapping one expands a −/+ servings stepper and "Add to lunch".
- Toasts for every add; remove with **Undo** (5 s deferred delete, flushed on `pagehide`).
- Restyled AI flows: example prompts, drag-and-drop photos, custom checkboxes, `Notice` errors.

**Verification 1** found: mobile still overflowed (the single-column grid track sized to
min-content); three empty meals took about 400 px of dashed boxes; the date appeared twice;
the goal status was carried by colour alone.

## Round 2: fixes

- Grid track `minmax(0,1fr)` (overflow fixed: 390 = 390).
- Empty meals collapsed to one line ("Nothing logged yet") with an "+ Add" pill.
- Dropped the duplicate long date under "Today" (kept for "Yesterday").
- Visible status pills: "Almost at your goal" (amber), "Over your goal" (red).

**Verification 2** checked an empty day, the goal editor, and the near/over states (the goal was
temporarily set to 1800 / 1600, then restored to 2000). It found: on mobile, the "Add to snacks
165 kcal" button wrapped onto two lines, and the 30-food list pushed the day's log about
1,000 px down.

## Round 3: fixes

- The expanded row's kcal now updates live with servings, so the button just says "Add to snacks".
- The log comes before the add panel on every screen size (on desktop the panel stays as a sticky
  right column). Each meal's Add button scrolls to the panel and focuses search.
- Long food names wrap to two lines instead of being truncated behind the AI badge (log and review list).

**Verification 3** passed. The toast and Undo were legible; remove → Undo kept the entry, and
remove without Undo deleted it after 5 s (both checked against the DB). The AI review list showed
clear ticked/unticked states and a live total.

## Final checks

- `npm run typecheck` and `npm run build`: clean.
- API validation: missing/invalid `meal` → 400 on both log routes; goal 50 and 1999.5 → 400.
- The user's 9 existing entries were preserved and migrated to `snack` (logged around 15:00 local).
- Not verified: a real phone (camera capture, touch hover behaviour) and screen-reader passes.

## Decisions

- **Deferred delete instead of a restore endpoint.** Undo needs no new API, and the entry keeps
  its id and timestamp. The trade-off: closing the tab in under 5 s relies on `keepalive`.
- **Goal stored in SQLite, not `localStorage`**: same persistence model as the log, and it's
  ready for more preferences later.
- **Macro targets derived from the goal** (30/40/30) rather than separately editable. One
  number to set keeps first use simple; a custom split is on the roadmap.
