# 2026-10-17: Dashboard carousel for food, steps and water

## What was asked

Put Calories eaten, Steps and Water at the same size and level (like the Steps and Water cards),
shown as a carousel.

## What changed

- **The three charts:** Calories eaten, Steps and Water are now three **equal cards** in one
  carousel, right under the Calories burned + Active minutes pair.
  - Calories eaten is no longer full width, and its chart height matches the others.
- **How many are in view:**
  - **Desktop:** two cards in view, the same width as the exercise pair above, with matching edges.
  - **Phone:** one card in view, with the edge of the next one showing so it's clearly swipeable.
- **Moving between cards:**
  - swipe or trackpad scroll (CSS scroll-snap, no library)
  - **Previous / Next** round buttons, disabled at the ends
  - one **dot** per card: filled while the card is fully in view, and tapping it scrolls to it
  - **no autoplay** (people are reading numbers), and smooth scrolling only without reduced motion
- **Accessibility:**
  - the carousel is a labelled region (`aria-roledescription="carousel"`, "Food, steps and water")
  - each card is labelled "2 of 3: Steps", and so on
  - a live region announces what's in view ("Steps and Water, 2 to 3 of 3")
  - every card stays in the page, so chart tooltips and the table view work as before
- **The parts:**
  - `components/Carousel.tsx`: small and generic, so it can be reused
  - `components/Dashboard.tsx`: the three existing panels moved into it unchanged

## Found while checking

- **Card alignment:** at first the carousel cards sat 4px left of the cards above. Scroll-snap
  aligns to the scroll edge, not the padding. `scroll-px-1` fixed it, and a test now checks the
  edges match.
- **Weight input placeholder:** "e.g. 71.4" was too long for the box and ran into "kg", so it's now
  "71.4".
- **Test builds:** OneDrive locked a file outside `.next-test/static` and the test build failed. The
  runner now empties the whole `.next-test` folder before building.

## Tests

- **New `tests/e2e/carousel.test.mjs`: 29 checks, desktop and mobile.**
  - the order of the three cards, their labels, and equal heights
  - two cards in view on desktop, one on a phone
  - the cards align with the exercise pair
  - Previous disabled at the start; Next moves one card, with the live text and dots updating
  - Next disabled at the end
  - dots jump to a card, and keyboard Enter works
  - the eaten chart is intact (14 columns, goal legend)
  - no page overflow and no console errors
- **Every other suite passes.** The dashboard, periods, water and first-day suites read the same
  panels by their labels.

## Follow-up: weight joins the carousel; Daily becomes "today at a glance"

You asked for weight to join the carousel too, and noted that Daily was still showing a two-week
graph. Daily doesn't need a carousel, but Weekly and Monthly do.

- **Weekly and Monthly:** the carousel has four cards: Calories eaten, Steps, Water and **Weight**.
  - The Weight card is the full chart: weigh-ins, trend, goal line, log form and weigh-ins table.
  - It's no longer a separate panel below.
- **Daily:** these four are now **today's numbers as cards** in a 2×2 grid (one per row on phones),
  with no charts and no carousel.
  - **Calories eaten:** "1,826 kcal of 2,000 kcal goal". The bar is green, amber or red by goal
    status, plus "Almost at your goal" / "Over your goal" as text.
  - **Steps:** "9,000 steps of 8,000" with "Target reached". With no target set, it links to
    setting one.
  - **Water:** "0.75 L of 2 L".
  - **Weight:** the latest weigh-in ("80.1 kg on Oct 16"), the trend and progress line, and the
    log form.
  - **Empty cards:** each says what's missing and links to where to log it ("Log food", "Add
    steps", "Add water").
- **Unchanged:** the Overview and the exercise pair, in every period.

## Found while checking the follow-up

- **Live-region check:** the carousel test read the Weight card's own live region instead of the
  carousel's. It now reads the carousel's announcement only.
- **Cold-start failures:** two suites failed only on their very first check after the test server
  started, while the first database query was still opening the pool. The runner now warms the
  server up (one sign-in attempt for a throwaway address, then each page) before any suite runs.
- **Other suites updated for the new layout:**
  - **periods:** Daily now checks the cards, and the so-far columns are checked in Weekly and Monthly.
  - **water:** the Daily card, then the Weekly chart.
  - **weight:** the Weekly chart, plus the Daily card.
  - **dashboard:** the tooltip check moved to Weekly.

## Tests

- **`tests/e2e/carousel.test.mjs`: 43 checks.**
  - **Weekly:** 4 slides in order, labelled "n of 4", with equal heights; aligned with the exercise
    pair; Next / dots / live text; the Weight dot reaches the end; the Weight card has its chart
    and log form; keyboard Previous; 12 weekly eaten columns; no overflow.
  - **Daily:** no carousel; today's values and pills ("Almost at your goal", "Target reached");
    progress bars at 91 / 100 / 38; the 2×2 grid on desktop; the latest weigh-in with no chart;
    no overflow.
