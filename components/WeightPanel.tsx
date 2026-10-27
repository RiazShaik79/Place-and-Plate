"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Period } from "@/lib/types";
import { goalProgress, trend, type WeighIn } from "@/lib/goals";
import { rangeStart } from "@/lib/history";
import { apiFetch } from "@/lib/client";
import { fmt, todayISO } from "@/lib/nutrition";
import CardHeader from "./CardHeader";
import LineChart from "./LineChart";
import Notice from "./Notice";

interface WeightData {
  entries: WeighIn[];
  before: WeighIn | null;
  goalKg: number | null;
  weeklyChangeKg: number | null;
}

const kg = (v: number) => `${fmt(Math.round(v * 10) / 10)} kg`;
const shortDate = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const LOG_HREF = "/exercise"; // weigh-ins are logged on the exercise page, next to steps

/**
 * Weight on the dashboard (view only, like the other cards). `today`: the latest weigh-in and progress
 * to the goal. `chart`: the period's weigh-ins with a smoothed trend and the goal line.
 */
export default function WeightPanel({
  period,
  badge,
  variant = "chart",
  className = "",
}: {
  period: Period;
  badge: string;
  variant?: "chart" | "today";
  className?: string;
}) {
  const [data, setData] = useState<WeightData | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [showTable, setShowTable] = useState(false);
  const today = todayISO();
  const from = rangeStart(period, today);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/weight?from=${from}&to=${today}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: WeightData) => {
        if (cancelled) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [from, today, reload]);

  // The trend starts from the weigh-in before the period, so the first point isn't a cold start.
  const all = data ? trend(data.before ? [data.before, ...data.entries] : data.entries) : [];
  // Today's card shows the newest weigh-in even if it's from before the period.
  const series = variant === "today" ? all : all.filter((p) => p.date >= from);
  const latest = series.at(-1);
  const first = series[0];
  const progress = latest && data?.goalKg != null ? goalProgress(latest.trend, data.goalKg, data.weeklyChangeKg) : null;

  const summary =
    latest && data ? (
      <>
        Trend <span className="font-semibold text-ink tabular-nums">{kg(latest.trend)}</span>
        {variant === "chart" && first && first.date !== latest.date && (
          <>
            , {latest.trend - first.trend <= 0 ? "down" : "up"} {kg(Math.abs(latest.trend - first.trend))} since {shortDate(first.date)}
          </>
        )}
        .{" "}
        {progress ? (
          Math.abs(progress.toGo) < 0.05 ? (
            <>You&apos;re at your goal of {kg(data.goalKg!)}.</>
          ) : (
            <>
              {kg(Math.abs(progress.toGo))} to go to {kg(data.goalKg!)}
              {progress.weeks !== null ? (
                <>
                  , about {progress.weeks} {progress.weeks === 1 ? "week" : "weeks"} at {fmt(Math.abs(data.weeklyChangeKg!))} kg a week.
                </>
              ) : (
                <>
                  .{" "}
                  <Link href="/account" className="font-semibold text-basil underline-offset-2 hover:underline">
                    Set a pace
                  </Link>
                </>
              )}
            </>
          )
        ) : (
          <Link href="/account" className="font-semibold text-basil underline-offset-2 hover:underline">
            Set a goal weight
          </Link>
        )}
      </>
    ) : null;

  const logLink = (
    <Link href={LOG_HREF} className="font-semibold text-basil underline-offset-2 hover:underline">
      Log weight
    </Link>
  );

  if (variant === "today") {
    return (
      <section aria-label="Weight" className={`rounded-panel bg-surface p-5 ring-1 ring-line sm:p-6 ${className}`}>
        <CardHeader title="Weight" badge={badge} />
        {failed ? (
          <div className="mt-3">
            <Notice tone="error" action={{ label: "Retry", onClick: () => setReload((k) => k + 1) }}>
              Couldn&apos;t load your weigh-ins.
            </Notice>
          </div>
        ) : (
          <>
            <p className={`mt-3 flex flex-wrap items-baseline gap-x-2 ${data ? "" : "animate-shimmer"}`}>
              <span className={`text-[40px] leading-none font-extrabold tracking-[-0.03em] tabular-nums ${latest ? "" : "text-faint"}`}>
                {latest ? fmt(Math.round(latest.kg * 10) / 10) : "–"}
              </span>
              <span className="text-base font-semibold text-muted">kg</span>
              {latest && <span className="text-sm text-muted">{latest.date === today ? "today" : `on ${shortDate(latest.date)}`}</span>}
            </p>
            <p className="mt-3 text-sm text-muted" aria-live="polite">
              {data && !latest ? <>No weigh-ins yet. {logLink}</> : summary}
            </p>
          </>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Weight" className={`rounded-panel bg-surface p-5 ring-1 ring-line sm:p-6 ${className}`}>
      <CardHeader
        title="Weight"
        badge={badge}
        subtitle={<span aria-live="polite">{summary ?? "Each weigh-in, and the smoothed trend that evens out day-to-day swings"}</span>}
      />
      <div className="mt-4">
        {failed ? (
          <Notice tone="error" action={{ label: "Retry", onClick: () => setReload((k) => k + 1) }}>
            Couldn&apos;t load your weigh-ins.
          </Notice>
        ) : !data ? (
          <div className="h-[206px] animate-shimmer rounded-card bg-sunken" aria-hidden="true" />
        ) : series.length === 0 ? (
          <p className="grid h-[206px] place-items-center rounded-card bg-sunken px-4 text-center text-sm text-muted">
            <span>No weigh-ins in this period. {logLink}</span>
          </p>
        ) : (
          <>
            <LineChart
              ariaLabel={`Weight from ${shortDate(from)} to today`}
              points={series.map((p) => ({ date: p.date, value: p.kg, trend: p.trend }))}
              from={from}
              to={today}
              reference={data.goalKg}
              format={kg}
              height={180}
            />
            <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
              <li className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-basil bg-surface" aria-hidden="true" />
                Weigh-in
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-[2px] w-4 rounded bg-basil" aria-hidden="true" />
                Trend
              </li>
              {data.goalKg != null && (
                <li className="flex items-center gap-1.5">
                  <span className="h-[1.5px] w-4 bg-ink/55" aria-hidden="true" />
                  Goal, {kg(data.goalKg)}
                </li>
              )}
              <li className="ml-auto">
                <button onClick={() => setShowTable((s) => !s)} aria-expanded={showTable} className="font-semibold text-basil underline-offset-2 hover:underline">
                  {showTable ? "Hide the weigh-ins" : "Show the weigh-ins"}
                </button>
              </li>
            </ul>
            {showTable && (
              <div className="-mx-5 mt-3 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
                <table className="w-full min-w-[320px] text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      <th className="py-2 pr-3 font-semibold">Day</th>
                      <th className="py-2 pr-3 text-right font-semibold">Weight</th>
                      <th className="py-2 text-right font-semibold">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...series].reverse().map((p) => (
                      <tr key={p.date} className="border-b border-line/70 last:border-0">
                        <td className="py-2 pr-3">{new Date(`${p.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</td>
                        <td className="py-2 pr-3 text-right">{kg(p.kg)}</td>
                        <td className="py-2 text-right">{kg(p.trend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
