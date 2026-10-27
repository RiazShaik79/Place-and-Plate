// Soft assertions for the API and browser suites: every check runs, failures are collected, and the
// test fails once at the end with the full list (so one failure never hides the rest).
import assert from "node:assert/strict";
import { test } from "node:test";

let active = null;

/** check(label, condition, extra?) against the currently running suite. */
export function check(label, cond, extra = "") {
  if (!active) throw new Error(`check("${label}") called outside suite()`);
  active.total++;
  if (!cond) {
    active.failed.push(`${label}${extra ? `  [${String(extra).slice(0, 400)}]` : ""}`);
    active.t.diagnostic(`FAIL  ${label}`);
  }
}

/** One node:test test whose body uses check(); it fails if any check failed or the body threw. */
export function suite(name, body, options = {}) {
  return test(name, options, async (t) => {
    active = { t, total: 0, failed: [] };
    try {
      await body(t);
    } finally {
      const { total, failed } = active;
      active = null;
      t.diagnostic(`${total - failed.length} of ${total} checks passed`);
      assert.equal(failed.length, 0, `${failed.length} of ${total} checks failed:\n  - ${failed.join("\n  - ")}`);
    }
  });
}
