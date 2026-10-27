"use client";

import { useState } from "react";
import { MEAL_LABELS, MEALS, type LogEntry, type Totals } from "@/lib/types";
import { fmt, fmtKcal, goalStatus, macroTargets, MAX_GOAL, MIN_GOAL, sumTotals, type GoalStatus } from "@/lib/nutrition";
import { Flame, MealIcon, Pencil } from "./Icons";
import { formatMinutes } from "@/lib/exercises";
import Spinner from "./Spinner";

interface Props {
  entries: LogEntry[];
  goal: number | null; // null while settings load
  loading: boolean;
  onGoalChange: (goal: number) => Promise<void>;
  date: string;
  burned: { minutes: number; calories: number } | null; // that day's exercise; null while loading
  water?: React.ReactNode; // the water card, under the exercise link
}

// Colour is never the only signal: near / over also get a visible label.
const STATUS_STYLE: Record<GoalStatus, { bar: string; text: string; label: string; pill: string }> = {
  under: { bar: "bg-ok", text: "text-ink", label: "On track", pill: "" },
  near: { bar: "bg-near", text: "text-ink", label: "Almost at your goal", pill: "bg-near-soft text-[#7a5408]" },
  over: { bar: "bg-over", text: "text-over", label: "Over your goal", pill: "bg-over-soft text-[#8f2a2a]" },
};

/** Calorie goal progress (the bar is split by meal) plus protein / carbs / fat against targets. */
export default function DailySummary({ entries, goal, loading, onGoalChange, date, burned, water }: Props) {
  const totals = sumTotals(entries);
  const effectiveGoal = goal ?? 2000;
  const status = goalStatus(totals.calories, effectiveGoal);
  const style = STATUS_STYLE[status];
  const remaining = effectiveGoal - totals.calories;

  return (
    <section
      aria-label="Daily summary"
      className="grid gap-8 rounded-panel bg-surface p-5 ring-1 ring-line sm:p-7 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-10"
    >
      <div className={loading ? "animate-shimmer" : undefined}>
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <span className={`text-[56px] leading-none font-extrabold tracking-[-0.03em] tabular-nums sm:text-[68px] ${style.text}`}>
            {fmtKcal(Math.abs(remaining))}
          </span>
          <span className="text-lg font-semibold text-muted">{remaining >= 0 ? "kcal left" : "kcal over"}</span>
          {status !== "under" && (
            <span className={`ml-1 self-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${style.pill}`}>
              {style.label}
            </span>
          )}
        </div>

        <GoalLine eaten={totals.calories} goal={goal} statusMessage={style.label} onGoalChange={onGoalChange} />

        <MealBar entries={entries} goal={effectiveGoal} total={totals.calories} barClass={style.bar} />

        <a
          href={`/exercise?date=${date}`}
          className="group mt-5 flex items-center gap-2.5 rounded-card bg-sunken/70 px-3.5 py-2.5 text-sm text-muted transition-colors hover:bg-sunken"
        >
          <Flame className="h-[18px] w-[18px] shrink-0 text-basil" />
          <span className="min-w-0 flex-1">
            {burned === null ? (
              "Exercise for this day"
            ) : burned.calories > 0 ? (
              <>
                Burned <span className="font-semibold text-ink tabular-nums">{fmtKcal(burned.calories)} kcal</span> in{" "}
                {formatMinutes(burned.minutes)} of exercise
              </>
            ) : (
              "No exercise logged for this day"
            )}
          </span>
          <span className="shrink-0 font-semibold text-basil group-hover:underline underline-offset-2">
            {burned && burned.calories > 0 ? "View" : "Log exercise"}
          </span>
        </a>
        {water}
      </div>

      <MacroBreakdown totals={totals} goal={effectiveGoal} />
    </section>
  );
}

function GoalLine({
  eaten,
  goal,
  statusMessage,
  onGoalChange,
}: {
  eaten: number;
  goal: number | null;
  statusMessage: string;
  onGoalChange: Props["onGoalChange"];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = Number(draft);
  const valid = Number.isInteger(value) && value >= MIN_GOAL && value <= MAX_GOAL;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError(`Enter a whole number from ${fmtKcal(MIN_GOAL)} to ${fmtKcal(MAX_GOAL)}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onGoalChange(value);
      setEditing(false);
    } catch {
      setError("Couldn't save your goal. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="mt-3">
        <label htmlFor="goal-input" className="text-sm text-muted">
          Daily calorie goal
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              id="goal-input"
              type="number"
              inputMode="numeric"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              className="h-10 w-32 rounded-lg border border-line bg-surface pr-12 pl-3 font-semibold tabular-nums outline-none focus:border-basil focus:ring-2 focus:ring-basil/20"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-faint">kcal</span>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-basil px-4 text-sm font-semibold text-white hover:bg-basil-dark disabled:opacity-60"
          >
            {saving && <Spinner className="h-4 w-4" />}
            Save goal
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-10 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-sunken"
          >
            Cancel
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-over">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted">
      <span>
        <span className="font-semibold text-ink tabular-nums">{fmtKcal(eaten)}</span> eaten of{" "}
        {goal === null ? "your goal" : <span className="font-semibold text-ink tabular-nums">{fmtKcal(goal)}</span>}
        {goal !== null && " kcal goal"}
      </span>
      <button
        onClick={() => {
          setDraft(String(goal ?? 2000));
          setError(null);
          setEditing(true);
        }}
        disabled={goal === null}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-semibold text-basil hover:bg-basil-soft"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit goal
      </button>
      <span className="sr-only">{statusMessage}</span>
    </p>
  );
}

/** Progress toward the goal, split into one segment per meal so you can see where the calories went. */
function MealBar({ entries, goal, total, barClass }: { entries: LogEntry[]; goal: number; total: number; barClass: string }) {
  const scale = Math.max(goal, total); // when over, the bar fills and a tick marks the goal
  const meals = MEALS.map((meal) => ({
    meal,
    calories: sumTotals(entries.filter((e) => e.meal === meal)).calories,
  })).filter((m) => m.calories > 0);

  return (
    <div className="mt-6">
      <div
        role="progressbar"
        aria-label="Calories eaten against your goal"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={Math.round(total)}
        className="relative flex h-3.5 gap-[3px] overflow-hidden rounded-full bg-sunken"
      >
        {meals.map((m) => (
          <div
            key={m.meal}
            title={`${MEAL_LABELS[m.meal]}: ${fmtKcal(m.calories)} kcal`}
            className={`h-full transition-[width] duration-500 ease-out first:rounded-l-full last:rounded-r-full ${barClass}`}
            style={{ width: `${(m.calories / scale) * 100}%` }}
          />
        ))}
        {total > goal && (
          <div className="absolute inset-y-0 w-[3px] bg-surface" style={{ left: `${(goal / scale) * 100}%` }} aria-hidden="true" />
        )}
      </div>

      {meals.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
          {meals.map((m) => (
            <li key={m.meal} className="flex items-center gap-1.5">
              <MealIcon meal={m.meal} className="h-4 w-4 text-faint" />
              {MEAL_LABELS[m.meal]}
              <span className="font-semibold text-ink tabular-nums">{fmtKcal(m.calories)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">Each meal you log fills in a part of this bar.</p>
      )}
    </div>
  );
}

const MACROS = [
  { key: "protein", label: "Protein", bar: "bg-protein", dot: "bg-protein" },
  { key: "carbs", label: "Carbs", bar: "bg-carbs", dot: "bg-carbs" },
  { key: "fat", label: "Fat", bar: "bg-fat", dot: "bg-fat" },
] as const;

function MacroBreakdown({ totals, goal }: { totals: Totals; goal: number }) {
  const targets = macroTargets(goal);
  return (
    <div className="flex flex-col justify-center gap-5 border-t border-line pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
      {MACROS.map((m) => {
        const value = totals[m.key];
        const target = targets[m.key];
        return (
          <div key={m.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 font-semibold">
                <span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} aria-hidden="true" />
                {m.label}
              </span>
              <span className="text-muted tabular-nums">
                <span className="font-semibold text-ink">{fmt(value)}</span> / {target} g
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${m.label}: ${fmt(value)} of ${target} grams`}
              aria-valuemin={0}
              aria-valuemax={target}
              aria-valuenow={Math.round(value)}
              className="h-2 overflow-hidden rounded-full bg-sunken"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out ${m.bar}`}
                style={{ width: `${Math.min(100, (value / target) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-faint">Targets split your goal 30% protein, 40% carbs, 30% fat.</p>
    </div>
  );
}
