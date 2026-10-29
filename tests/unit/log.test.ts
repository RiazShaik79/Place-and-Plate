import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatLog, serializeError } from "@/lib/log";

describe("log", () => {
  const now = new Date("2026-10-29T08:00:00.000Z");

  test("one JSON line with ts, level, msg and fields", () => {
    const line = formatLog("warn", "slow_query", { ms: 1234, sql: "SELECT 1" }, now);
    assert.ok(!line.includes("\n"));
    assert.deepEqual(JSON.parse(line), { ts: "2026-10-29T08:00:00.000Z", level: "warn", msg: "slow_query", ms: 1234, sql: "SELECT 1" });
  });

  test("undefined fields are left out and reserved keys can't be overwritten", () => {
    const out = JSON.parse(formatLog("info", "x", { a: undefined, b: null, level: "error", msg: "spoof" }, now));
    assert.equal("a" in out, false);
    assert.equal(out.b, null);
    assert.equal(out.level, "info");
    assert.equal(out.msg, "x");
  });

  test("errors become name, message, code and a trimmed stack", () => {
    const err = Object.assign(new Error("boom"), { code: "ER_BAD" });
    const out = JSON.parse(formatLog("error", "request_failed", { err }, now));
    assert.equal(out.err.name, "Error");
    assert.equal(out.err.message, "boom");
    assert.equal(out.err.code, "ER_BAD");
    assert.match(out.err.stack, /^Error: boom/);
    assert.ok(out.err.stack.split("\n").length <= 21);
  });

  test("non-Error throws are kept as a message", () => {
    assert.deepEqual(serializeError("plain"), { message: "plain" });
    assert.deepEqual(JSON.parse(formatLog("error", "x", { err: 42 }, now)).err, { message: "42" });
  });
});
