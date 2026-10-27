import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bucketLabel, buildBuckets, rangeStart, todaySoFar } from "@/lib/history";
import type { DayTotals } from "@/lib/db";

const day = (t: Partial<DayTotals>): DayTotals => ({
  foodDays: 0, eaten: 0, protein: 0, carbs: 0, fat: 0, burned: 0, minutes: 0, steps: 0, stepDays: 0, water: 0, waterDays: 0, sleep: 0, sleepDays: 0, ...t,
});

describe("history", () => {
  test("rangeStart: 14 days, 12 Monday weeks, 12 months", () => {
    assert.equal(rangeStart("day", "2026-10-17"), "2026-10-04");
    assert.equal(rangeStart("week", "2026-10-17"), "2026-07-27"); // a Monday, 11 weeks before Mon 12 Oct
    assert.equal(rangeStart("month", "2026-10-17"), "2025-11-01");
  });

  test("weekly buckets start on Mondays and the last one stops at end", () => {
    const b = buildBuckets("week", "2026-10-17", new Map(), 2000);
    assert.equal(b.length, 12);
    assert.ok(b.every((x) => new Date(`${x.start}T12:00`).getDay() === 1));
    assert.equal(b.at(-1)!.end, "2026-10-17");
    assert.equal(b.at(-1)!.days, 6);
    assert.ok(b.slice(0, -1).every((x) => x.days === 7));
  });

  test("today's food, steps and water stay out of the buckets; exercise stays in", () => {
    const totals = new Map<string, DayTotals>([
      ["2026-10-16", day({ foodDays: 1, eaten: 2100, steps: 9000, stepDays: 1, water: 1500, waterDays: 1 })],
      ["2026-10-17", day({ foodDays: 1, eaten: 700, burned: 150, minutes: 30, steps: 4000, stepDays: 1, water: 500, waterDays: 1 })],
    ]);
    const b = buildBuckets("day", "2026-10-17", totals, 2000);
    const today = b.at(-1)!;
    assert.deepEqual([today.eaten, today.foodDays, today.steps, today.water], [0, 0, 0, 0]);
    assert.deepEqual([today.burned, today.minutes], [150, 30]);
    const yday = b.at(-2)!;
    assert.deepEqual([yday.eaten, yday.daysOnTarget, yday.steps, yday.water], [2100, 0, 9000, 1500]);
    assert.deepEqual(todaySoFar("2026-10-17", totals), { eaten: 700, steps: 4000, water: 500, protein: 0, carbs: 0, fat: 0 });
  });

  test("daysOnTarget counts finished logged days at or under the goal", () => {
    const totals = new Map<string, DayTotals>([
      ["2026-10-14", day({ foodDays: 1, eaten: 2000 })],
      ["2026-10-15", day({ foodDays: 1, eaten: 2001 })],
      ["2026-10-16", day({ foodDays: 1, eaten: 1200 })],
    ]);
    const week = buildBuckets("week", "2026-10-17", totals, 2000).at(-1)!;
    assert.deepEqual([week.foodDays, week.daysOnTarget, week.eaten], [3, 2, 5201]);
  });

  test("todaySoFar is null for anything not logged today", () => {
    assert.deepEqual(todaySoFar("2026-10-17", new Map()), { eaten: null, steps: null, water: null, protein: 0, carbs: 0, fat: 0 });
  });

  test("monthly labels add the year only when it changes", () => {
    const b = buildBuckets("month", "2026-10-17", new Map(), 2000);
    const labels = b.map((x, i) => bucketLabel("month", x, b[i - 1]));
    assert.match(labels[0], /25$/); // Nov 25: first column
    assert.match(labels[2], /26$/); // Jan 26: year changed
    assert.doesNotMatch(labels[3], /\d/); // Feb
  });
});
