# 2026-10-17: Sleep tracking

## Why

You asked whether sleep fits. It does.
- **It's the third pillar next to food and activity:** short sleep raises appetite (especially for
  energy-dense food) and makes training harder.
- **The logging pattern already exists:** it's logged by hand after waking, the same way as steps,
  water and weight. Phone or watch import can come later, with step sync.

## Decisions (your choices)

- **What a night records:** **bedtime, wake time, and an optional 1–5 "how rested"**.
  - The duration is worked out by the server.
  - A wake time at or before the bedtime means the night crossed midnight: 23:15 → 06:35 is 7 h
    20 min.
  - Nights under 30 minutes or over 16 hours are refused with a plain message ("That's 18 hours.
    Check the times.").
- **Which day a night belongs to:** the **day you woke up**, so "last night" is today's.
- **Where it's logged:** on the **Activity** page, which is the Exercise page renamed, because it now
  holds steps, weight and sleep as well as workouts. The URL stays `/exercise`.
  - The Sleep card sits with Steps and Weight.
  - **Add sleep / Edit:** time pickers, a live "= 7 h 20 min", the 1–5 picker (1 exhausted,
    5 fully rested), and Save / Cancel / Clear.
- **On the dashboard** (view only, like everything else):
  - **Daily:** a Sleep card ("7h 20m of 8 h", a bar, the rested label, "23:15 to 06:35"), or a
    link to log last night.
  - **Weekly / Monthly:** a fifth carousel card, average hours per night logged, with an hours axis
    and the target line. The table gains "Sleep (h)".
- **Target:** **Sleep target** in Account → Daily targets, in hours (4–12, half hours). The default
  is 8.
- **Averages:** a night is finished once it's logged, so **today's sleep counts in averages**, unlike
  today's food and steps.

## Data and API

- **Migration `005_sleep.sql`:**
  - `daily_sleep`: one row per user and wake day, with bed and wake times, minutes and quality
  - `users.sleep_target_min`
- **`lib/sleep.ts`:** `sleepMinutes`, `sleepProblem`, the limits, `QUALITY_LABELS` and `hours()`.
- **API:**
  - `GET /api/sleep?date`
  - `PUT /api/sleep {date, bed, wake, quality}` or `{date, clear: true}`
  - `PUT /api/account/body` takes `sleepTargetMin`
  - history buckets carry `sleep` / `sleepDays`, and `History.sleepTarget`

## Found while testing

- **Sleep-only accounts:** an account whose only data was sleep showed the "nothing logged" panel in
  Weekly and Monthly, because the empty check didn't count sleep. Fixed.

## Checks

- **Unit: 4 tests.**
  - durations: same night, across midnight, a nap, equal times
  - malformed times
  - the 30-minute and 16-hour edges
  - quality and hours helpers
- **API: `tests/api/sleep.test.mjs`.**
  - signed-out 401s
  - 23:15 → 06:35 is 440 minutes with quality 4; saving again replaces it (01:00 → 08:30 is 450),
    one row only
  - rejected with 400: bad times, too short or too long, quality 0 or 6, future days, bad dates
  - nights are separate per day, and another account can't see them
  - the target: 450 saves; 120, 800 and 450.5 are rejected; leaving it out keeps it
  - history counts today's night
  - clearing works
  - the migration is recorded, and nights cascade on account deletion
- **Browser: `tests/e2e/sleep.test.mjs`, 35 checks (desktop and mobile).**
  - **Activity page:** the tab reads Activity; add a night with a live preview and quality; the
    toast; the card shows the times and "rested (4 of 5)"; an 18-hour night is refused inline; a
    reload keeps it
  - **Dashboard Daily:** the card shows 7h 20m of 8 h, Rested and the times, with the bar at 92%
  - **Dashboard Weekly:** the Sleep chart with an hours axis and the target line; the table column
  - **Account:** 13 h is rejected; 7.5 h saves as 450
  - **Clearing:** Clear removes the night
  - **Overall:** no overflow and no console errors
- **Other suites updated:** the Activity tab name, five carousel cards, and seven Daily cards.
- **The full `npm test` passes.**

## Next ideas

- **Bedtime consistency:** how much your bedtime varies, which the stored clock times already
  support.
- **Sleep against the next day's intake:** for example, "after nights under 6 h you ate 300 kcal
  more".
- **Import from Apple Health or Google Fit:** together with step sync.
