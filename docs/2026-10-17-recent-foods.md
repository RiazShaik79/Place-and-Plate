# 2026-10-17: Recent foods, favourites, Same as yesterday, edit an entry

## Why

Asked "what's missing", the biggest gap was daily friction:
- **Adding food:** every meal meant searching a 30-food list, describing it to the AI, or taking a
  photo, even though most people eat the same things again and again.
- **Fixing a mistake:** a wrong serving meant deleting the entry and adding it again.

## What was built

- **Recent tab** in the add panel, placed first.
  - **When it opens first:** once the account has logged anything (the server passes
    `hasHistory`, so the panel never flips tabs while loading). A new account still starts on
    Search.
  - **What it lists:** foods from the last 60 days, one row per food, newest first, with one
    serving's calories.
  - **Adding again:** tapping a row opens the same servings stepper as Search, set to the last
    serving. Foods logged 3 or more times at another serving say "usually 1.5".
- **Favourites:**
  - The star on a row saves that food.
  - Starred foods sit above the recent list, and appear only there, not in both lists.
  - The star is a toggle button (`aria-pressed`), basil when on. The amber `near` colour is
    reserved for goal status.
- **Same as yesterday:**
  - **When it appears:** an empty meal shows it when the day before had that meal, for example
    "Same as yesterday, 2 items, 354 kcal". On a past day it names the weekday instead: "Same as
    Thursday".
  - **Confirming:** pressing it lists the foods first. "Add 2 items" copies them.
  - **Undo:** the toast's Undo removes the copies straight away.
- **Edit an entry:**
  - Tapping a meal card opens an inline editor: a servings stepper with live kcal, a meal
    select, and Save changes / Cancel.
  - Calories and macros rescale in proportion.
  - An AI item can be scaled too, for example "2 × 1 wrap".
  - The toast says "Updated…" or "Moved … to dinner".
- **Shared `ServingsStepper`:** used by Search, Recent and the editor.
- **The tab bar:** with four tabs it's text only. The icons didn't fit a quarter of the 400px
  side panel.

## Decisions

- **The client never sends nutrition numbers for these flows.**
  - "Add again" and "Same as yesterday" send ids of the user's own entries or favourites, to
    `POST /api/log/repeat`.
  - The server copies those rows in one transaction, at one serving times the chosen servings.
  - Edits send only `servings` / `meal`, and the server rescales the stored numbers.
  - If any id belongs to another account, nothing is added: every source is looked up before the
    first insert.
- **"The same food":**
  - It's the catalogue id. For AI items it's the lower-cased name plus the portion.
  - The rule is `foodKey()` / `FOOD_KEY_SQL` in `lib/foods.ts`, used by the Recent query
    (`ROW_NUMBER() OVER (PARTITION BY …)`) and the favourites' unique key.
- **Favourites are snapshots** of one serving (`favorite_foods`, migration `003_favorites.sql`).
  Starring twice is a no-op, and deleting the account removes them.
- **Undo after "Same as yesterday" deletes the copies immediately.** Removing a single entry keeps
  the existing 5-second delayed delete.
- **Not done:**
  - moving an entry to another day
  - editing AI items before logging
  - custom foods

## How it was checked (production build, MySQL)

- **Typecheck and build:** clean. `003_favorites.sql` is recorded in `schema_migrations`.
- **New API checks: 44 of 44.**
  - **Recent:** 401s when signed out; empty to start; distinct, newest first, `uses`,
    `lastServings`, per-serving kcal; an AI item is keyed by name + portion; another account's
    list is empty.
  - **Repeat:**
    - an AI copy keeps its name, portion and kcal; oatmeal at 3 servings is 498 kcal with macros
      scaled
    - another user's entry gives 404
    - a mix including one foreign id gives 404 and **nothing added**
    - a bad meal or date, no items, 31 items, servings 0, or both ids gives 400
  - **Favourites:**
    - one serving is stored, and starring twice is a no-op
    - repeating a favourite at 2 servings gives 332 kcal
    - another user can't use or delete it; delete gives 204
  - **Edit:**
    - 1.5 to 3 servings doubles kcal and macros; moving to dinner keeps the numbers
    - an AI entry scales
    - servings 0 or 101, a bad meal, an empty body, or another user's entry are rejected
  - **Cascade:** deleting the account removes its favourites.
- **New browser checks: 43 of 43 (desktop and mobile).**
  - **Tabs:** a new account starts on Search; the four tabs fit at 390px; with history the panel
    opens on Recent.
  - **Recent:** it lists oatmeal ("usually 1.5"), banana and the AI wrap.
  - **Same as yesterday:**
    - it shows on empty Breakfast (2 items, 354 kcal) and not on Dinner
    - confirm lists the foods; adding them works
    - Undo removes both, and they stay gone after a reload
  - **Add again:** it starts at 1.5 servings, adds 249 kcal to Lunch, and the toast says so.
  - **Favourites:** starring Banana moves it under Favourites, and the star survives a reload.
  - **Edit:**
    - it previews 415 kcal at 2.5 servings
    - saving updates the card and the summary (+166)
    - moving to dinner works
  - **Overall:** no overflow and no console errors.
- **Design review of the screenshots:** a "Recent" heading repeated the tab name when there were
  no favourites. Group headings now appear only when both groups do.
- **Regression:**
  - auth 46, reset/exercise 43, "Keep me signed in" 14, verification 34, race 6, water 37
  - dashboard 41: the one failing check is the known "places not configured → 503", because this
    server has a Places key
  - browser: water 35, periods 13, landing 9, verification 15, welcome-back 23, account 16,
    exercise 13, dashboard 15, first-day 7, rename 19
  - The rename check expected exactly three food tabs, and now expects Recent, Search, Describe,
    Photo.
