import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CHAOS_SCENARIOS, chaosAllowed, chaosEnabled } from "@/lib/chaos";
import { portionCalories } from "@/lib/chaos-cases";

const TOKEN = "t".repeat(40);
const ON = { CHAOS_MODE: "enabled", CHAOS_TOKEN: TOKEN };

describe("chaos gate (Watchtower ADR 0007)", () => {
  test("all three gates pass: enabled, matching token, allowed scenario", () => {
    for (const s of CHAOS_SCENARIOS) assert.equal(chaosAllowed(s, TOKEN, ON), true, s);
  });

  test("off unless CHAOS_MODE is exactly 'enabled'", () => {
    for (const mode of [undefined, "", "true", "ENABLED", "enabled "]) {
      const env = { CHAOS_MODE: mode, CHAOS_TOKEN: TOKEN };
      assert.equal(chaosEnabled(env), false, String(mode));
      assert.equal(chaosAllowed("bad-sql", TOKEN, env), false, String(mode));
    }
  });

  test("the token must match and be at least 32 characters", () => {
    assert.equal(chaosAllowed("bad-sql", null, ON), false);
    assert.equal(chaosAllowed("bad-sql", "x".repeat(40), ON), false);
    assert.equal(chaosAllowed("bad-sql", TOKEN.slice(1), ON), false);
    const short = { CHAOS_MODE: "enabled", CHAOS_TOKEN: "short-token" };
    assert.equal(chaosAllowed("bad-sql", "short-token", short), false);
    assert.equal(chaosAllowed("bad-sql", "", { CHAOS_MODE: "enabled" }), false);
  });

  test("only allowlisted scenarios run", () => {
    for (const s of ["drop-tables", "", "../health", "BAD-SQL"]) assert.equal(chaosAllowed(s, TOKEN, ON), false, s);
  });

  test("the seeded null-handling bug is real: an unknown meal throws", () => {
    assert.equal(portionCalories("lunch"), 600);
    assert.throws(() => portionCalories("snack"), TypeError);
  });
});
