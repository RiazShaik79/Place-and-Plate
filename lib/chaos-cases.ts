// Deliberately seeded bugs for Watchtower's end-to-end tests (Watchtower ADR 0007). Each scenario
// below has one real defect that Watchtower's diagnosis should find, and that a fix may correct here
// or in lib/db.ts (lib/chaos.ts, the gate, is off limits to fixes). Reached only through
// /api/chaos/[scenario]. Nothing here reads or writes user data.
import { chaosServerTime, chaosSlowPing } from "@/lib/db";
import type { ChaosScenario } from "@/lib/chaos";

const PORTIONS = new Map<string, { calories: number }>([
  ["breakfast", { calories: 350 }],
  ["lunch", { calories: 600 }],
  ["dinner", { calories: 700 }],
]);

/** Typical calories for a meal's portion. */
export function portionCalories(meal: string): number {
  return PORTIONS.get(meal)!.calories;
}

export async function runScenario(scenario: ChaosScenario): Promise<Record<string, unknown>> {
  switch (scenario) {
    case "null-handling":
      // "snack" isn't in PORTIONS.
      return { calories: portionCalories("snack") };
    case "bad-sql":
      return { serverTime: await chaosServerTime() };
    case "db-timeout":
      return { ms: await chaosSlowPing() };
  }
}
