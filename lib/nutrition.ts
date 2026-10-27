import type { Meal, Totals } from "./types";

export const MIN_GOAL = 800;
export const MAX_GOAL = 6000;

/** Share of daily calories per macro used to derive gram targets, and kcal per gram. */
const MACRO_SPLIT = { protein: 0.3, carbs: 0.4, fat: 0.3 };
const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 };

/** Daily gram targets for each macro, derived from the calorie goal (30/40/30 split). */
export function macroTargets(calorieGoal: number): Omit<Totals, "calories"> {
  return {
    protein: Math.round((calorieGoal * MACRO_SPLIT.protein) / KCAL_PER_GRAM.protein),
    carbs: Math.round((calorieGoal * MACRO_SPLIT.carbs) / KCAL_PER_GRAM.carbs),
    fat: Math.round((calorieGoal * MACRO_SPLIT.fat) / KCAL_PER_GRAM.fat),
  };
}

export type GoalStatus = "under" | "near" | "over";

/** Green until 90% of the goal, amber from 90% to 100%, red once it's exceeded. */
export function goalStatus(calories: number, goal: number): GoalStatus {
  if (calories > goal) return "over";
  if (calories >= goal * 0.9) return "near";
  return "under";
}

/** The meal most people would be eating at this hour; preselected when adding food. */
export function mealForTime(d = new Date()): Meal {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 15) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

/** Whole number with thousands separators, e.g. 1,737. */
export function fmtKcal(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Millilitres as litres: 1250 → "1.25 L", 2000 → "2 L". */
export function fmtLitres(ml: number): string {
  return `${(ml / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 })} L`;
}

/** Sum nutrition over anything with calorie/macro fields (log entries, AI items). */
export function sumTotals(entries: Totals[]): Totals {
  return entries.reduce<Totals>(
    (t, e) => ({
      calories: t.calories + e.calories,
      protein: t.protein + e.protein,
      carbs: t.carbs + e.carbs,
      fat: t.fat + e.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** Round to one decimal place for display, dropping a trailing ".0". */
export function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Today's date in the user's local timezone, as YYYY-MM-DD. */
export function todayISO(): string {
  return toISODate(new Date());
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + days));
}

export function formatDateLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return "Today";
  if (iso === shiftDate(today, -1)) return "Yesterday";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** e.g. "Wednesday, October 14". */
export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/** e.g. "Wed, Oct 14". */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
