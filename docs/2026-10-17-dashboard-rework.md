# 2026-10-17: Dashboard rework after a full review

## What you reported

- The top cards didn't seem to change when switching Daily / Weekly / Monthly.
- There was a lot of empty space under the charts in the carousel cards.
- Nothing said which period a card showed once you'd scrolled down.
- Weight had a log form when no other card did.
- Overall, the dashboard felt unfinished.

## What the full test found

A new suite (`tests/e2e/dashboard-periods.test.mjs`) switches Daily → Weekly → Monthly → Daily on
an account shaped like yours (a few recent days of data), on desktop and phone. It records what
every card shows.

- **The exercise charts did switch:** 14 columns, then 12, then 12, with different labels.
- **The Overview looked stuck.**
  - With data on only a few recent days, every period holds the same days, so "Average eaten per
    day 1,237 kcal" and "1 of 1 days" were identical in all three.
  - In Daily, those 14-day averages and the exercise charts sat above cards that showed *today*:
    two different meanings on one screen.
- **No card named its period.**
- **Empty space at the card bottoms:** cards in a row stretched to the tallest one (the Weight card
  with its log form), leaving 70–150 px of blank space under the other charts.

## What changed (your three choices)

1. **Daily is today, for every card.**
   - Seven equal cards, two to a row (one on phones): calories eaten, calories burned, active
     minutes, steps, water, weight and sleep.
   - Then today's macro split.
   - No charts and no averages.
   - Nothing logged shows a faint 0, with a link to where you log it.
   - Every card has the same shape (number, then a bar or a note), so rows line up.
   - **Weekly / Monthly** keep the Overview, the exercise pair and the carousel.
2. **The dashboard is view only.** Weight is logged on the **Exercise (now Activity) page** in a
   Weight card next to Steps (`WeightCard`, Add weight / Edit). The dashboard's Weight card shows
   the latest weigh-in (Daily) or the trend chart (Weekly / Monthly).
3. **Every card says its period:** a small badge reads "Today", "Last 12 weeks" or
   "Last 12 months". The Overview carries it too.

**Also:**
- **Calories burned** gained an "Average, N kcal a day" reference line, so it has the same parts as
  its neighbour.
- **The Weight chart card** puts its summary in the subtitle, and its chart is the same height as
  the others.
- **Carousel cards:** on phones they keep their own height (one in view at a time); on desktop the
  pair lines up.
- **Switching periods:** the layout is chosen from the *loaded* history's period, so a switch never
  shows one period's data in another's layout.

## Fixed in the tests themselves

- **Loaded signal:** several suites treated "the Overview is on screen" as "the dashboard loaded".
  Daily has no Overview now, and an empty account in Monthly shows the empty panel instead. They
  now wait for any dashboard card.
- **Remembered period:** a remembered period from an earlier pass (Monthly) made one suite's second
  pass start on an empty view. Each suite now sets the period it needs.

## Checks

- **New full-dashboard suite: 165 checks.**
  - **Daily:** the order and values of the today cards; no charts; weight is view only.
  - **Weekly / Monthly:** 12 columns in the exercise charts.
  - **Every card:** labelled with its period, with no empty band over 56 px at the bottom (the card
    padding is 20–24 px).
  - **Switching:** the x-axis changes between Weekly and Monthly; Daily comes back the same.
  - **Overall:** no overflow and no console errors.
- **Updated:**
  - **carousel:** five slides; the today grid two to a row; bar values 91 / 0 / 100 / 38 / 0
  - **periods:** Daily cards; the so-far columns checked in Weekly / Monthly
  - **first-day:** the Daily card, then the Weekly overview
  - **weight:** logging on the Activity page, including the out-of-range error
  - **landing, device, rename, dashboard:** the new loaded signal
- **The full `npm test` passes:** unit, API and browser.
