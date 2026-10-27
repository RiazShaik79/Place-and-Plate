import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ACTIVITY, bmr, floorFor, goalProgress, missingFor, suggestedGoal, trend, type Profile } from "@/lib/goals";

const sam: Profile = { birthYear: 1991, sex: "male", heightCm: 178, weightKg: 80, activity: "moderate", weeklyChangeKg: -0.5 };

describe("goals: suggested calorie goal", () => {
  test("Mifflin–St Jeor BMR for male, female and not given", () => {
    assert.equal(bmr(80, 178, 35, "male"), 1742.5);
    assert.equal(bmr(80, 178, 35, "female"), 1576.5);
    assert.equal(bmr(80, 178, 35, null), 1659.5); // midpoint constant (−78)
  });

  test("activity factors", () => {
    assert.deepEqual(Object.values(ACTIVITY).map((a) => a.factor), [1.2, 1.375, 1.55, 1.725, 1.9]);
  });

  test("35-year-old man, moderate, losing 0.5 kg a week", () => {
    const s = suggestedGoal(sam, 2026)!;
    assert.equal(s.maintenance, 2700); // 1742.5 × 1.55 = 2700.9
    assert.equal(s.change, -550); // 0.5 × 7700 / 7
    assert.equal(s.kcal, 2150);
    assert.equal(s.floorApplied, false);
    assert.equal(s.estimated, false);
  });

  test("without sex: midpoint formula, flagged as an estimate, about 129 kcal lower", () => {
    const s = suggestedGoal({ ...sam, sex: null }, 2026)!;
    assert.equal(s.estimated, true);
    assert.equal(s.kcal, 2020); // 1659.5 × 1.55 − 550 = 2022.2
  });

  test("maintain and gain", () => {
    assert.equal(suggestedGoal({ ...sam, weeklyChangeKg: 0 }, 2026)!.kcal, 2700);
    assert.equal(suggestedGoal({ ...sam, weeklyChangeKg: null }, 2026)!.kcal, 2700);
    assert.equal(suggestedGoal({ ...sam, weeklyChangeKg: 0.25 }, 2026)!.kcal, 2980);
  });

  test("a pace below the safe floor is raised to it", () => {
    const small: Profile = { birthYear: 1960, sex: "female", heightCm: 152, weightKg: 50, activity: "sedentary", weeklyChangeKg: -1 };
    const s = suggestedGoal(small, 2026)!;
    assert.equal(s.floorApplied, true);
    assert.equal(s.kcal, 1200);
    assert.equal(floorFor("male"), 1500);
    assert.equal(floorFor(null), 1200);
  });

  test("nothing is suggested until the details are there", () => {
    const empty: Profile = { birthYear: null, sex: null, heightCm: null, weightKg: 70, activity: null, weeklyChangeKg: null };
    assert.deepEqual(missingFor(empty), ["birthYear", "heightCm", "activity"]);
    assert.equal(suggestedGoal(empty, 2026), null);
  });
});

describe("goals: weight trend and progress", () => {
  test("the first weigh-in is the trend; each next one moves it 10% of the way", () => {
    const t = trend([
      { date: "2026-10-01", kg: 80 },
      { date: "2026-10-02", kg: 79 },
    ]);
    assert.equal(t[0].trend, 80);
    assert.ok(Math.abs(t[1].trend - 79.9) < 1e-9);
  });

  test("a gap of days moves the trend further (1 − 0.9^gap)", () => {
    const t = trend([
      { date: "2026-10-01", kg: 80 },
      { date: "2026-10-08", kg: 78 },
    ]);
    const k = 1 - Math.pow(0.9, 7);
    assert.ok(Math.abs(t[1].trend - (80 - 2 * k)) < 1e-9);
  });

  test("input order doesn't matter", () => {
    const a = trend([{ date: "2026-10-02", kg: 79 }, { date: "2026-10-01", kg: 80 }]);
    assert.deepEqual(a.map((x) => x.date), ["2026-10-01", "2026-10-02"]);
  });

  test("goal progress: kg to go and weeks at the chosen pace", () => {
    assert.deepEqual(goalProgress(71.6, 70, -0.25), { toGo: 70 - 71.6, weeks: 7 });
    assert.equal(goalProgress(71.6, 70, 0).weeks, null); // maintaining never gets there
    assert.equal(goalProgress(71.6, 70, 0.25).weeks, null); // gaining goes the wrong way
    assert.equal(goalProgress(70.02, 70, -0.5).weeks, 0); // already there
  });
});
