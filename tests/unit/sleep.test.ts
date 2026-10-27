import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { hours, isClockTime, isQuality, QUALITY_LABELS, sleepMinutes, sleepProblem } from "@/lib/sleep";

describe("sleep", () => {
  test("same-night and across-midnight durations", () => {
    assert.equal(sleepMinutes("23:15", "06:35"), 440);
    assert.equal(sleepMinutes("01:00", "08:30"), 450);
    assert.equal(sleepMinutes("13:00", "14:30"), 90); // a nap
    assert.equal(sleepMinutes("22:00", "22:00"), 24 * 60); // equal times = a full day
  });

  test("malformed times give null", () => {
    for (const [b, w] of [["25:00", "07:00"], ["7:5", "07:00"], ["23:15", "6:35"], ["", "07:00"]]) assert.equal(sleepMinutes(b, w), null, `${b} ${w}`);
    assert.ok(isClockTime("00:00") && isClockTime("23:59") && !isClockTime("24:00"));
  });

  test("problems at the 30-minute and 16-hour edges", () => {
    assert.equal(sleepProblem(29), "That's under 30 minutes. Check the times.");
    assert.equal(sleepProblem(30), null);
    assert.equal(sleepProblem(16 * 60), null);
    assert.match(sleepProblem(18 * 60)!, /18 hours/);
    assert.match(sleepProblem(null)!, /HH:MM/);
  });

  test("quality 1–5 with words; hours for axes", () => {
    assert.ok(isQuality(1) && isQuality(5) && !isQuality(0) && !isQuality(6) && !isQuality(2.5));
    assert.equal(QUALITY_LABELS[5], "Fully rested");
    assert.equal(hours(450), "7.5");
    assert.equal(hours(480), "8");
  });
});
