// Chaos mode: lets Watchtower's end-to-end tests trigger three known bugs in production (Watchtower
// ADR 0007). Double-gated: a scenario runs only when CHAOS_MODE is exactly "enabled", the request's
// x-chaos-token matches CHAOS_TOKEN (32+ chars, constant-time compare) AND the scenario is on the
// allowlist. Anything else is a 404, like a missing route. Unset CHAOS_MODE after each test session.
// Pure (env passed in), so it's unit-tested. The bugs themselves live in lib/chaos-cases.ts.
import { timingSafeEqual } from "node:crypto";

export const CHAOS_SCENARIOS = ["null-handling", "bad-sql", "db-timeout"] as const;
export type ChaosScenario = (typeof CHAOS_SCENARIOS)[number];

const MIN_TOKEN_LENGTH = 32;

type Env = Record<string, string | undefined>;

export function chaosEnabled(env: Env = process.env): boolean {
  return env.CHAOS_MODE === "enabled";
}

function tokenMatches(sent: string | null, env: Env): boolean {
  const expected = env.CHAOS_TOKEN ?? "";
  if (expected.length < MIN_TOKEN_LENGTH || !sent) return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True only when all three gates pass. */
export function chaosAllowed(scenario: string, sentToken: string | null, env: Env = process.env): scenario is ChaosScenario {
  return chaosEnabled(env) && tokenMatches(sentToken, env) && (CHAOS_SCENARIOS as readonly string[]).includes(scenario);
}
