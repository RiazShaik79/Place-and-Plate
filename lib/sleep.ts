// Sleep: bedtime and wake time ("HH:MM", the user's local clock) → minutes asleep, plus limits and
// labels. Pure functions, shared by the API, the activity page and the dashboard.

export const SLEEP_MIN_MINUTES = 30;
export const SLEEP_MAX_MINUTES = 16 * 60;
export const SLEEP_TARGET_MIN = 4 * 60; // the account's sleep target, in minutes
export const SLEEP_TARGET_MAX = 12 * 60;
export const SLEEP_DEFAULT_MINUTES = 8 * 60;

export const QUALITY_LABELS: Record<number, string> = {
  1: "Exhausted",
  2: "Tired",
  3: "Okay",
  4: "Rested",
  5: "Fully rested",
};
export const isQuality = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isClockTime = (v: unknown): v is string => typeof v === "string" && TIME_RE.test(v);
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Minutes from bedtime to wake time. A wake time at or before the bedtime means the night crossed
 * midnight (23:15 → 06:35 is 7 h 20 min). Null for malformed times.
 */
export function sleepMinutes(bed: string, wake: string): number | null {
  if (!isClockTime(bed) || !isClockTime(wake)) return null;
  const diff = toMinutes(wake) - toMinutes(bed);
  return diff > 0 ? diff : diff + 24 * 60;
}

/** Why a night can't be saved, or null if it's fine. */
export function sleepProblem(minutes: number | null): string | null {
  if (minutes === null) return "Enter both times as HH:MM.";
  if (minutes < SLEEP_MIN_MINUTES) return "That's under 30 minutes. Check the times.";
  if (minutes > SLEEP_MAX_MINUTES) return `That's ${Math.round(minutes / 60)} hours. Check the times.`;
  return null;
}

/** Hours for axes and tables: 450 → "7.5". */
export const hours = (minutes: number) => (Math.round((minutes / 60) * 10) / 10).toLocaleString("en-US");
