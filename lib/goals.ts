// Calorie-goal suggestion (Mifflin–St Jeor) and the smoothed weight trend. Pure functions: shared by
// the account page, the dashboard and the API, and unit-tested in tests/unit/goals.test.ts.
import { MAX_GOAL, MIN_GOAL } from "./nutrition";

export type Sex = "female" | "male";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";

export const ACTIVITY: Record<Activity, { factor: number; label: string; hint: string }> = {
  sedentary: { factor: 1.2, label: "Mostly sitting", hint: "Desk job, little exercise" },
  light: { factor: 1.375, label: "Lightly active", hint: "Exercise 1–3 days a week" },
  moderate: { factor: 1.55, label: "Moderately active", hint: "Exercise 3–5 days a week" },
  active: { factor: 1.725, label: "Very active", hint: "Hard exercise 6–7 days a week" },
  very_active: { factor: 1.9, label: "Extremely active", hint: "Physical job or training twice a day" },
};
export const isActivity = (v: unknown): v is Activity => typeof v === "string" && v in ACTIVITY;
export const isSex = (v: unknown): v is Sex => v === "female" || v === "male";

/** Weekly change choices in kg (negative = lose). */
export const PACES = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5] as const;
export const isPace = (v: unknown): v is number => typeof v === "number" && (PACES as readonly number[]).includes(v);

export const KCAL_PER_KG = 7700; // energy in a kilogram of body fat, the usual planning figure
export const BIRTH_YEAR_MIN = 1900;
export const MIN_AGE = 13; // the formula and the floors are for adults and older teens

/** Mifflin–St Jeor sex constant; without a sex, the midpoint of the two. */
const SEX_OFFSET = { male: 5, female: -161, unknown: -78 };

export function bmr(kg: number, cm: number, age: number, sex: Sex | null): number {
  return 10 * kg + 6.25 * cm - 5 * age + SEX_OFFSET[sex ?? "unknown"];
}

export interface Profile {
  birthYear: number | null;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  activity: Activity | null;
  weeklyChangeKg: number | null; // null = maintain
}

export type MissingField = "birthYear" | "heightCm" | "weightKg" | "activity";

export interface Suggestion {
  kcal: number; // the suggested daily goal, rounded to 10
  maintenance: number; // calories that keep weight steady, rounded to 10
  change: number; // kcal a day added (+) or removed (−) for the chosen pace, rounded
  floorApplied: boolean; // the pace would go below the safe minimum, so it was raised
  estimated: boolean; // sex not given: midpoint formula, a rougher estimate
}

/** Safe minimum intake commonly used without medical supervision. */
export const floorFor = (sex: Sex | null) => (sex === "male" ? 1500 : 1200);

export function missingFor(p: Profile): MissingField[] {
  const out: MissingField[] = [];
  if (!p.birthYear) out.push("birthYear");
  if (!p.heightCm) out.push("heightCm");
  if (!p.weightKg) out.push("weightKg");
  if (!p.activity) out.push("activity");
  return out;
}

/** The suggested daily calorie goal, or null while a detail is missing. `year` is the current year. */
export function suggestedGoal(p: Profile, year: number): Suggestion | null {
  if (missingFor(p).length) return null;
  const age = year - p.birthYear!;
  const maintenance = bmr(p.weightKg!, p.heightCm!, age, p.sex) * ACTIVITY[p.activity!].factor;
  const change = ((p.weeklyChangeKg ?? 0) * KCAL_PER_KG) / 7;
  const floor = floorFor(p.sex);
  const raw = maintenance + change;
  const floorApplied = raw < floor;
  const kcal = Math.min(MAX_GOAL, Math.max(MIN_GOAL, floorApplied ? floor : raw));
  return {
    kcal: Math.round(kcal / 10) * 10,
    maintenance: Math.round(maintenance / 10) * 10,
    change: Math.round(change),
    floorApplied,
    estimated: p.sex === null,
  };
}

export interface WeighIn {
  date: string; // YYYY-MM-DD
  kg: number;
}

const ALPHA = 0.1; // smoothing per day ("The Hacker's Diet" trend)
const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

/**
 * Exponentially smoothed trend at each weigh-in (oldest first). Days without a weigh-in count: after
 * a gap of g days the new reading weighs 1 − (1 − α)^g, so a week away moves the trend more.
 */
export function trend(weighIns: WeighIn[]): (WeighIn & { trend: number })[] {
  const sorted = [...weighIns].sort((a, b) => a.date.localeCompare(b.date));
  const out: (WeighIn & { trend: number })[] = [];
  for (const [i, w] of sorted.entries()) {
    if (i === 0) {
      out.push({ ...w, trend: w.kg });
      continue;
    }
    const prev = out[i - 1];
    const gap = Math.max(1, dayNumber(w.date) - dayNumber(prev.date));
    const k = 1 - Math.pow(1 - ALPHA, gap);
    out.push({ ...w, trend: prev.trend + k * (w.kg - prev.trend) });
  }
  return out;
}

/** How far the trend is from the goal, and weeks to get there at the chosen pace (null if never). */
export function goalProgress(trendKg: number, goalKg: number, weeklyChangeKg: number | null): { toGo: number; weeks: number | null } {
  const toGo = goalKg - trendKg; // negative = still to lose
  const pace = weeklyChangeKg ?? 0;
  const weeks = Math.abs(toGo) < 0.05 ? 0 : pace !== 0 && Math.sign(pace) === Math.sign(toGo) ? Math.ceil(toGo / pace) : null;
  return { toGo, weeks };
}
