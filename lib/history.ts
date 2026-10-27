// Dashboard aggregation: group per-day totals into days, Monday-start weeks or calendar months.
import { shiftDate, toISODate } from "./nutrition";
import type { History, HistoryBucket, Period } from "./types";

export const PERIODS: { id: Period; label: string; count: number; range: string }[] = [
  { id: "day", label: "Daily", count: 14, range: "Last 14 days" },
  { id: "week", label: "Weekly", count: 12, range: "Last 12 weeks" },
  { id: "month", label: "Monthly", count: 12, range: "Last 12 months" },
];

export function isPeriod(v: unknown): v is Period {
  return v === "day" || v === "week" || v === "month";
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function startOf(period: Period, iso: string): string {
  if (period === "day") return iso;
  const d = parse(iso);
  if (period === "week") return shiftDate(iso, -((d.getDay() + 6) % 7)); // back to Monday
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function nextStart(period: Period, start: string): string {
  if (period === "day") return shiftDate(start, 1);
  if (period === "week") return shiftDate(start, 7);
  const d = parse(start);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}

function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000) + 1;
}

function prevStart(period: Period, start: string): string {
  if (period === "day") return shiftDate(start, -1);
  if (period === "week") return shiftDate(start, -7);
  const d = parse(start);
  return toISODate(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}

/** The first day covered by `count` buckets ending with the bucket that contains `end`. */
export function rangeStart(period: Period, end: string): string {
  const count = PERIODS.find((p) => p.id === period)!.count;
  let start = startOf(period, end);
  for (let i = 1; i < count; i++) start = prevStart(period, start);
  return start;
}

type Totals = Omit<HistoryBucket, "start" | "end" | "days" | "daysOnTarget">;

/**
 * Build the buckets oldest-first; the last one is cut off at `end` (today), never in the future.
 * Today's food, steps and water are left out (see `todaySoFar`): the day isn't over yet.
 */
export function buildBuckets(period: Period, end: string, totals: Map<string, Totals>, calorieGoal: number): HistoryBucket[] {
  const buckets: HistoryBucket[] = [];
  for (let start = rangeStart(period, end); start <= end; start = nextStart(period, start)) {
    const last = shiftDate(nextStart(period, start), -1);
    const bucketEnd = last < end ? last : end;
    const b: HistoryBucket = {
      start,
      end: bucketEnd,
      days: daysBetween(start, bucketEnd),
      foodDays: 0, daysOnTarget: 0, eaten: 0, protein: 0, carbs: 0, fat: 0, burned: 0, minutes: 0, steps: 0, stepDays: 0,
      water: 0, waterDays: 0, sleep: 0, sleepDays: 0,
    };
    for (let d = start; d <= bucketEnd; d = shiftDate(d, 1)) {
      const t = totals.get(d);
      if (!t) continue;
      b.burned += t.burned;
      b.minutes += t.minutes;
      // A night is finished once it's logged, so today's sleep counts too (like exercise).
      b.sleep += t.sleep;
      b.sleepDays += t.sleepDays;
      if (d === end) continue; // today: food, steps and water go in `todaySoFar` instead
      b.foodDays += t.foodDays;
      if (t.foodDays && t.eaten <= calorieGoal) b.daysOnTarget += 1;
      b.eaten += t.eaten;
      b.protein += t.protein;
      b.carbs += t.carbs;
      b.fat += t.fat;
      b.steps += t.steps;
      b.stepDays += t.stepDays;
      b.water += t.water;
      b.waterDays += t.waterDays;
    }
    buckets.push(b);
  }
  return buckets;
}

/** Today's food, steps and water so far (null when nothing is logged yet), and today's macros in grams. */
export function todaySoFar(end: string, totals: Map<string, Totals>): History["today"] {
  const t = totals.get(end);
  return {
    eaten: t?.foodDays ? t.eaten : null,
    steps: t?.stepDays ? t.steps : null,
    water: t?.waterDays ? t.water : null,
    protein: t?.protein ?? 0,
    carbs: t?.carbs ?? 0,
    fat: t?.fat ?? 0,
  };
}

/** Short axis label: "Mon 12" / "Oct 6" (week of) / "Oct" (with the year when it changes). */
export function bucketLabel(period: Period, b: HistoryBucket, prev?: HistoryBucket): string {
  const d = parse(b.start);
  if (period === "day") return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
  if (period === "week") return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const label = d.toLocaleDateString(undefined, { month: "short" });
  return !prev || parse(prev.start).getFullYear() !== d.getFullYear() ? `${label} ${String(d.getFullYear()).slice(2)}` : label;
}

/** Full label for tooltips and the table: "Wednesday, Oct 14" / "Week of Oct 12" / "October 2026". */
export function bucketTitle(period: Period, b: HistoryBucket): string {
  const d = parse(b.start);
  if (period === "day") return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  if (period === "week") return `Week of ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
