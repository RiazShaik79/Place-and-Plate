"use client";

import type { ExerciseDay, ExerciseEntry } from "@/lib/types";
import { DEFAULT_WEIGHT_KG, formatMinutes, sumExercise, WEEKLY_MINUTES_TARGET } from "@/lib/exercises";
import { fmtKcal } from "@/lib/nutrition";

interface Props {
  date: string;
  entries: ExerciseEntry[];
  week: ExerciseDay[] | null; // null while loading
  loading: boolean;
  weightKg: number | null;
  onPickDay: (date: string) => void;
  /** The day's steps, weight and sleep cards, shown under the burn figures. */
  steps?: React.ReactNode;
}

/**
 * Today's burn and active time, plus the signature element: the last 7 days as a bar strip,
 * measured against the WHO's 150 active minutes a week.
 */
export default function ExerciseSummary({ date, entries, week, loading, weightKg, onPickDay, steps }: Props) {
  const totals = sumExercise(entries);
  const sessions = entries.length;

  return (
    <section
      aria-label="Exercise summary"
      className="grid gap-8 rounded-panel bg-surface p-5 ring-1 ring-line sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-10"
    >
      <div>
        <div className={`flex flex-wrap items-baseline gap-x-2.5 ${loading ? "animate-shimmer" : ""}`}>
          <span className="text-[56px] leading-none font-extrabold tracking-[-0.03em] tabular-nums sm:text-[68px]">
            {fmtKcal(totals.calories)}
          </span>
          <span className="text-lg font-semibold text-muted">kcal burned</span>
        </div>
        <p className="mt-3 text-[15px] text-muted">
          {sessions === 0 ? (
            "No sessions logged for this day yet."
          ) : (
            <>
              <span className="font-semibold text-ink tabular-nums">{formatMinutes(totals.minutes)}</span> active across{" "}
              <span className="font-semibold text-ink tabular-nums">{sessions}</span> {sessions === 1 ? "session" : "sessions"}
            </>
          )}
        </p>
        {weightKg === null && (
          <p className="mt-4 text-sm text-muted">
            Calories assume {DEFAULT_WEIGHT_KG} kg.{" "}
            <a href="/account" className="font-semibold text-basil underline-offset-2 hover:underline">
              Add your weight
            </a>{" "}
            for estimates that fit you.
          </p>
        )}
        {steps}
      </div>

      <WeekStrip date={date} week={week} onPickDay={onPickDay} />
    </section>
  );
}

function WeekStrip({ date, week, onPickDay }: { date: string; week: ExerciseDay[] | null; onPickDay: (d: string) => void }) {
  const days = week ?? [];
  const total = days.reduce((s, d) => s + d.minutes, 0);
  const tallest = Math.max(60, ...days.map((d) => d.minutes));
  const reached = total >= WEEKLY_MINUTES_TARGET;

  return (
    <div className="flex flex-col border-t border-line pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-bold">Last 7 days</h2>
        <p className="text-sm text-muted tabular-nums">
          <span className="font-semibold text-ink">{week ? Math.round(total) : "–"}</span> of {WEEKLY_MINUTES_TARGET} active minutes
          {reached && <span className="ml-2 rounded-full bg-basil-soft px-2 py-0.5 text-[13px] font-semibold text-basil">Weekly goal met</span>}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Active minutes in the last 7 days against 150"
        aria-valuemin={0}
        aria-valuemax={WEEKLY_MINUTES_TARGET}
        aria-valuenow={Math.round(total)}
        className="mt-3 h-2 overflow-hidden rounded-full bg-sunken"
      >
        <div className="h-full rounded-full bg-basil transition-[width] duration-500 ease-out" style={{ width: `${Math.min(100, (total / WEEKLY_MINUTES_TARGET) * 100)}%` }} />
      </div>

      {week && total === 0 && <p className="mt-3 text-sm text-muted">Each day fills in as you log sessions.</p>}
      <div className="mt-6">
      <ol className={`grid grid-cols-7 items-end gap-2 sm:gap-3 ${week && total === 0 ? "h-14" : "h-36"} ${week ? "" : "animate-shimmer"}`}>
        {(week ? days : Array.from({ length: 7 }, (_, i) => ({ date: String(i), minutes: 0, calories: 0 }))).map((d) => {
          const selected = d.date === date;
          const [y, m, day] = d.date.split("-").map(Number);
          const when = week ? new Date(y, m - 1, day) : null;
          const short = when?.toLocaleDateString(undefined, { weekday: "short" }) ?? "";
          const long = when?.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) ?? "";
          return (
            <li key={d.date} className="flex h-full flex-col items-center justify-end gap-2">
              <button
                onClick={() => week && onPickDay(d.date)}
                disabled={!week}
                aria-label={`${long}: ${formatMinutes(d.minutes)}, ${fmtKcal(d.calories)} kcal`}
                aria-current={selected ? "date" : undefined}
                title={week ? `${formatMinutes(d.minutes)}, ${fmtKcal(d.calories)} kcal` : undefined}
                className="group flex w-full flex-1 flex-col items-center justify-end rounded-lg"
              >
                {d.minutes > 0 && (
                  <span className={`mb-1 text-[11px] font-semibold tabular-nums ${selected ? "text-ink" : "text-muted"}`}>{Math.round(d.minutes)}</span>
                )}
                <span
                  className={`w-full max-w-9 rounded-md transition-[height,background-color] duration-500 ease-out ${
                    d.minutes > 0 ? (selected ? "bg-basil" : "bg-basil/35 group-hover:bg-basil/55") : selected ? "bg-line" : "bg-sunken group-hover:bg-line"
                  }`}
                  style={{ height: d.minutes > 0 ? `${Math.max(8, (d.minutes / tallest) * 100)}%` : "6px" }}
                />
              </button>
              <span className={`text-xs ${selected ? "font-bold text-ink" : "text-muted"}`}>{short}</span>
            </li>
          );
        })}
      </ol>
      </div>
    </div>
  );
}
