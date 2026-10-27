import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { fmt, fmtKcal, fmtLitres, goalStatus, ISO_DATE_RE, macroTargets, mealForTime, shiftDate, sumTotals, toISODate } from "@/lib/nutrition";

describe("nutrition", () => {
  test("sumTotals adds every field and is zero for no entries", () => {
    assert.deepEqual(sumTotals([]), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    const total = sumTotals([
      { calories: 166, protein: 5.9, carbs: 28, fat: 3.6 },
      { calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
    ]);
    assert.equal(total.calories, 271);
    assert.ok(Math.abs(total.protein - 7.2) < 1e-9);
  });

  test("goalStatus: under below 90%, near from 90% to 100%, over above", () => {
    assert.equal(goalStatus(1799, 2000), "under");
    assert.equal(goalStatus(1800, 2000), "near");
    assert.equal(goalStatus(2000, 2000), "near");
    assert.equal(goalStatus(2001, 2000), "over");
  });

  test("macroTargets split the goal 30/40/30 in grams", () => {
    assert.deepEqual(macroTargets(2000), { protein: 150, carbs: 200, fat: 67 });
  });

  test("mealForTime follows the hour boundaries", () => {
    const at = (h: number) => mealForTime(new Date(2026, 9, 17, h, 30));
    assert.deepEqual([4, 5, 10, 11, 14, 15, 16, 17, 21, 22].map(at), [
      "snack", "breakfast", "breakfast", "lunch", "lunch", "snack", "snack", "dinner", "dinner", "snack",
    ]);
  });

  test("shiftDate crosses month, year and leap-day boundaries", () => {
    assert.equal(shiftDate("2026-10-31", 1), "2026-11-01");
    assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
    assert.equal(shiftDate("2028-02-28", 1), "2028-02-29");
    assert.equal(shiftDate("2026-10-17", -60), "2026-08-18");
  });

  test("toISODate pads month and day; ISO_DATE_RE accepts only YYYY-MM-DD", () => {
    assert.equal(toISODate(new Date(2026, 0, 5)), "2026-01-05");
    assert.ok(ISO_DATE_RE.test("2026-10-17"));
    assert.ok(!ISO_DATE_RE.test("2026-1-7"));
  });

  test("number formatting", () => {
    assert.equal(fmtKcal(1736.6), "1,737");
    assert.equal(fmtLitres(0), "0 L");
    assert.equal(fmtLitres(1250), "1.25 L");
    assert.equal(fmtLitres(2000), "2 L");
    assert.equal(fmt(1.5), "1.5");
  });
});
