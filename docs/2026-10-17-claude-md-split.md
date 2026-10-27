# 2026-10-17: CLAUDE.md split by folder

## Why

- **The old limit:** `CLAUDE.md` was kept under 200 lines, a limit from the project's first brief.
  By the weight feature, each addition meant squeezing older lines.
- **The cost of one big file:** about half of it was reference detail (the feature catalogue, data
  model, API shapes) that only matters when working in one area. Yet Claude Code loads the root file
  in full in every session, and important rules got diluted by reference text.

## What changed

Claude Code also loads a `CLAUDE.md` from any subfolder, but only when work touches files there. The
content was moved, not rewritten, into five files:

| File | Lines | Holds |
| --- | --- | --- |
| `CLAUDE.md` | 123 | what the app is, features at a glance, running, stack, env vars, folder map, design system, conventions, gotchas, next steps |
| `components/CLAUDE.md` | 128 | every page and feature in detail, state owners, data flow (undo, failed loads), charts, shared pieces |
| `app/api/CLAUDE.md` | 97 | route conventions, every route's request and response, AI and Places |
| `lib/CLAUDE.md` | 119 | files, data model and migrations (005 next), `db.ts` patterns, auth and sessions, history buckets, goals maths |
| `tests/CLAUDE.md` | 67 | commands, what the runner does, how to write unit, API and browser tests, requirements |

**The new rule, in the root file under "Writing these files":**
- rules that apply everywhere go in the root
- reference detail goes in the folder's file
- the why goes in `docs/`
- keep each file focused rather than to a line count

**Additions while moving:**
- `TEST_DATABASE_URL` in the env table
- "status colours are for goal status only"
- the "DB access only through `lib/db.ts`" and "schema changes are a new migration" conventions,
  restated as rules
- the two browser-test pitfalls found while writing the weight tests (synthetic `pointerenter`,
  setting controlled selects)

## How it was checked

- **Nothing was lost.** Key terms from the old file were each searched for across the five new files,
  and every one was found:
  - `HOME_PATH`, `FOR UPDATE`, `ct_session`, `ct_device_user`, `2,000`, `foodKey`, `todaySoFar`,
    `soFarValue`
  - `TEST_DATABASE_URL`, `gemini-2.5-flash-lite`, `EPERM`
  - the four Next Steps
  - "Same as yesterday", "WHO 150", `pendingEmail`, "12-hour", `decimalNumbers`,
    `schema_migrations`, "005 next", Mifflin, "1,200", `hasHistory`, `keepalive`, referer,
    "password manager", SQLite
- **No code changed.** The typecheck and the full `npm test` run just before the split passed, and
  `npm run test:quick` passed again afterwards.
