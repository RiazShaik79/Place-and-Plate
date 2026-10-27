"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { History, HistoryBucket, Period } from "@/lib/types";
import { bucketLabel, bucketTitle, PERIODS } from "@/lib/history";
import { formatMinutes, WEEKLY_MINUTES_TARGET } from "@/lib/exercises";
import { hours, QUALITY_LABELS } from "@/lib/sleep";
import { fmtKcal, fmtLitres, goalStatus, todayISO } from "@/lib/nutrition";
import { apiFetch, takeFlash } from "@/lib/client";
import CardHeader, { PeriodBadge } from "./CardHeader";
import Carousel from "./Carousel";
import ColumnChart, { type Column } from "./ColumnChart";
import Notice from "./Notice";
import Toast, { type ToastMessage } from "./Toast";
import WeightPanel from "./WeightPanel";

const PERIOD_KEY = "ct:dashboard-period";
const KCAL = { protein: 4, carbs: 4, fat: 9 };
const TARGET_SPLIT = { protein: 30, carbs: 40, fat: 30 };

// Per-day values for a bucket. Food, steps and water average over the days that were logged (a day
// with nothing logged isn't a day of eating nothing); burn and minutes average over every day.
const perDay = {
  eaten: (b: HistoryBucket) => (b.foodDays ? b.eaten / b.foodDays : null),
  burned: (b: HistoryBucket) => b.burned / b.days,
  minutes: (b: HistoryBucket) => b.minutes / b.days,
  steps: (b: HistoryBucket) => (b.stepDays ? b.steps / b.stepDays : null),
  water: (b: HistoryBucket) => (b.waterDays ? b.water / b.waterDays : null),
  sleep: (b: HistoryBucket) => (b.sleepDays ? b.sleep / b.sleepDays : null), // minutes a night
};

// Food, steps and water for the current (unfinished) day, week or month, *including* today: the
// buckets leave today out so it never counts in averages, but the newest column still shows it.
const PARTS = { eaten: ["eaten", "foodDays"], steps: ["steps", "stepDays"], water: ["water", "waterDays"] } as const;
type Part = keyof typeof PARTS;
function soFarValue(h: History, k: Part): number | null {
  const t = h.today[k];
  if (h.period === "day") return t;
  const b = h.buckets[h.buckets.length - 1];
  const [sum, n] = PARTS[k];
  const days = b[n] + (t !== null ? 1 : 0);
  return days ? (b[sum] + (t ?? 0)) / days : null;
}
const PARTIAL_LABEL = { day: "Today so far", week: "This week so far", month: "This month so far" } as const;
/** The period each card shows, in a small label on the card (so it's clear after scrolling). */
const BADGE: Record<Period, string> = { day: "Today", week: "Last 12 weeks", month: "Last 12 months" };
const DAILY_MINUTES_TARGET = Math.round(WEEKLY_MINUTES_TARGET / 7);

/** High-level view of food and exercise, grouped by day, week or month. */
export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("day");
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [showTable, setShowTable] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // A message carried over from the previous page (e.g. "Password updated" after a reset).
  useEffect(() => {
    const message = takeFlash();
    if (!message) return;
    setToast({ id: Date.now(), text: message });
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, []);

  // Remember the last period on this browser (a convenience; falls back to Daily).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PERIOD_KEY);
      if (saved === "day" || saved === "week" || saved === "month") setPeriod(saved);
    } catch {
      // storage blocked
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/history?period=${period}&end=${todayISO()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((h: History) => {
        if (cancelled) return;
        setHistory(h);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [period, reload]);

  function choose(p: Period) {
    setPeriod(p);
    try {
      localStorage.setItem(PERIOD_KEY, p);
    } catch {
      // storage blocked
    }
  }

  const meta = PERIODS.find((p) => p.id === period)!;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">Dashboard</h1>
          <p className="mt-1 text-[15px] text-muted">{period === "day" ? "Today" : meta.range}, from your food and exercise logs.</p>
        </div>
        {/* One filter row, above everything it scopes. */}
        <div role="radiogroup" aria-label="Group by" className="grid grid-cols-3 gap-1 rounded-full bg-sunken p-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={period === p.id}
              onClick={() => choose(p.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                period === p.id ? "bg-surface text-ink shadow-[0_1px_3px_rgba(26,36,32,0.12)]" : "text-muted hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {failed && (
        <Notice tone="error" action={{ label: "Retry", onClick: () => setReload((k) => k + 1) }}>
          Couldn&apos;t load your history. Check that the app is still running, then retry.
        </Notice>
      )}

      {!history && !failed ? (
        <DashboardSkeleton />
      ) : history ? (
        // Refetch keeps the frame: the previous render dims instead of flashing a skeleton.
        <div className={`space-y-5 transition-opacity sm:space-y-6 ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
          {/* Render from the loaded history's period, so a switch never mixes two periods' layouts. */}
          {history.period === "day" ? (
            <TodayView history={history} />
          ) : isEmpty(history) ? (
            <>
              <EmptyHistory range={PERIODS.find((p) => p.id === history.period)!.range} />
              <WeightPanel period={history.period} badge={BADGE[history.period]} />
            </>
          ) : (
            <>
              <Overview history={history} />
              <Charts history={history} />
              <MacroSplit history={history} />
              <div className="flex justify-end">
                <button
                  onClick={() => setShowTable((s) => !s)}
                  aria-expanded={showTable}
                  className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-basil transition-colors hover:bg-basil-soft"
                >
                  {showTable ? "Hide the numbers" : "Show the numbers as a table"}
                </button>
              </div>
              {showTable && <HistoryTable history={history} />}
            </>
          )}
        </div>
      ) : null}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

const isEmpty = (h: History) =>
  !h.buckets.some((b) => b.foodDays || b.minutes || b.stepDays || b.waterDays || b.sleepDays) &&
  h.today.eaten === null &&
  h.today.steps === null &&
  h.today.water === null;
const PARTIAL_SWATCH = "border-[1.5px] border-dashed border-basil bg-basil-soft";

// Four blank charts teach nothing: a period with no logs gets one panel that says what to do.
function EmptyHistory({ range }: { range: string }) {
  return (
    <section aria-label="Overview" className="rounded-panel bg-surface px-5 py-10 text-center ring-1 ring-line sm:px-10 sm:py-14">
      <h2 className="text-xl font-bold tracking-tight">No meals, workouts or steps in the {range.toLowerCase()}</h2>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-muted">
        Your charts fill in as you log meals, workouts and steps. Start with today: it takes about a minute.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className="rounded-full bg-basil px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-basil-dark">
          Log food
        </Link>
        <Link href="/exercise" className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-basil transition-colors hover:bg-basil-soft">
          Log exercise
        </Link>
      </div>
    </section>
  );
}

function Panel({ title, subtitle, badge, children, className = "" }: { title: string; subtitle?: string; badge?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-panel bg-surface p-5 ring-1 ring-line sm:p-6 ${className}`} aria-label={title}>
      <CardHeader title={title} subtitle={subtitle} badge={badge} />
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The one hero figure (average intake vs goal) and four stat tiles. */
function Overview({ history }: { history: History }) {
  // Average from the first period with anything logged, so months before you started don't
  // dilute "per day" and "a week" figures.
  const first = history.buckets.findIndex((x) => x.foodDays || x.minutes || x.stepDays);
  const b = first === -1 ? history.buckets : history.buckets.slice(first);
  const sum = (k: keyof HistoryBucket) => b.reduce((s, x) => s + (x[k] as number), 0);
  const foodDays = sum("foodDays");
  const days = sum("days");
  const avgEaten = foodDays ? sum("eaten") / foodDays : null;
  const onTarget = sum("daysOnTarget");
  const stepDays = sum("stepDays");
  const avgSteps = stepDays ? sum("steps") / stepDays : null;
  const weeks = days / 7;
  const goal = history.calorieGoal;
  const diff = avgEaten === null ? 0 : avgEaten - goal;
  const { today } = history;
  const notToday = "Today counts once it’s over";

  return (
    <section aria-label="Overview" className="grid gap-5 rounded-panel bg-surface p-5 ring-1 ring-line sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-10">
      <div>
        <div className="mb-2">
          <PeriodBadge>{BADGE[history.period]}</PeriodBadge>
        </div>
        {avgEaten === null && today.eaten !== null ? (
          <>
            <p className="text-sm font-semibold text-muted">Eaten today so far</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-[52px] leading-none font-extrabold tracking-[-0.03em] sm:text-[60px]">{fmtKcal(today.eaten)}</span>
              <span className="text-lg font-semibold text-muted">kcal</span>
            </p>
            <p className="mt-3 text-[15px] text-muted">Your daily average starts tomorrow, once today is a full day of logging.</p>
          </>
        ) : avgEaten === null ? (
          <>
            <p className="text-[22px] leading-snug font-bold">No meals logged in this period yet</p>
            <p className="mt-2 text-[15px] text-muted">
              Log what you eat on the{" "}
              <a href="/" className="font-semibold text-basil underline-offset-2 hover:underline">
                food page
              </a>{" "}
              and your trends appear here.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-muted">Average eaten per day</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-[52px] leading-none font-extrabold tracking-[-0.03em] sm:text-[60px]">{fmtKcal(avgEaten)}</span>
              <span className="text-lg font-semibold text-muted">kcal</span>
            </p>
            <p className="mt-3 text-[15px] text-muted">
              {Math.abs(diff) < 1 ? (
                <>Right on your {fmtKcal(goal)} kcal goal</>
              ) : (
                <>
                  <span className="font-semibold text-ink">{fmtKcal(Math.abs(diff))} kcal</span> {diff < 0 ? "under" : "over"} your{" "}
                  {fmtKcal(goal)} kcal goal
                </>
              )}
              , across {foodDays} logged {foodDays === 1 ? "day" : "days"}
              {today.eaten !== null && " (today counts once it’s over)"}.
            </p>
          </>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 border-t border-line pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
        <Stat label="Days within goal" value={foodDays ? `${onTarget} of ${foodDays}` : "–"} note={foodDays ? `${Math.round((onTarget / foodDays) * 100)}% of logged days` : today.eaten !== null ? notToday : "Nothing logged"} />
        <Stat
          label="Burned per day"
          value={sum("minutes") ? `${fmtKcal(sum("burned") / days)} kcal` : "–"}
          note={sum("minutes") ? "Average from exercise" : "No exercise logged"}
        />
        <Stat
          label="Active minutes"
          value={sum("minutes") ? `${fmtKcal(sum("minutes") / weeks)} min` : "–"}
          note={sum("minutes") ? `A week, against ${WEEKLY_MINUTES_TARGET}` : "No exercise logged"}
        />
        <Stat
          label="Steps per day"
          value={avgSteps === null ? "–" : fmtKcal(avgSteps)}
          note={avgSteps === null ? (today.steps !== null ? notToday : "No steps logged") : history.stepsTarget ? `Target ${fmtKcal(history.stepsTarget)}` : "No target set"}
        />
      </dl>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-card bg-sunken/70 px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 text-[22px] font-bold tracking-tight">{value}</dd>
      <dd className="text-[13px] text-muted">{note}</dd>
    </div>
  );
}

/** Weekly / monthly charts: the exercise pair, then food, steps, water and weight in a carousel. */
function Charts({ history }: { history: History }) {
  const { period, buckets: b, calorieGoal, stepsTarget, waterTarget, sleepTarget } = history;
  const last = b.length - 1;
  const per = " a day";
  const sub = (what: string) => `${what}, averaged per day`;
  const badge = BADGE[period];
  // Average burn per day from the first period with exercise, drawn as the chart's reference line.
  const firstEx = b.findIndex((x) => x.minutes > 0);
  const exDays = firstEx === -1 ? 0 : b.slice(firstEx).reduce((n, x) => n + x.days, 0);
  const avgBurn = exDays ? Math.round(b.slice(firstEx).reduce((n, x) => n + x.burned, 0) / exDays) : 0;
  const col = (i: number, value: number | null, detail?: string, over = false): Column => ({
    key: b[i].start,
    label: bucketLabel(period, b[i], b[i - 1]),
    title: bucketTitle(period, b[i]),
    value,
    tone: over ? "over" : "default",
    detail,
  });
  const logged = (x: HistoryBucket, n: number, what: string) => `${n} of ${x.days} days ${what}`;
  // The newest column is unfinished (today, this week, this month): it shows the running value,
  // today included, drawn as "so far".
  const partialLabel = PARTIAL_LABEL[period];
  const soFar = (i: number, k: Part): Column | null => {
    if (i !== last) return null;
    const v = soFarValue(history, k);
    if (v === null) return null;
    const detail = `${partialLabel}, including today. Averages count finished days.`;
    return { ...col(i, Math.round(v), detail), tone: "partial" };
  };
  const partialKey = (k: Part) => (soFarValue(history, k) !== null ? [{ color: PARTIAL_SWATCH, label: partialLabel }] : []);

  return (
    <>
      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
        {/* Exercise first: two half-width charts give a quick read; food, steps, water and weight follow in a carousel. */}
        <Panel title="Calories burned" subtitle={sub("From logged exercise")} badge={badge}>
          <ColumnChart
            ariaLabel={`Calories burned${per}`}
            columns={b.map((x, i) => col(i, Math.round(perDay.burned(x))))}
            format={(v) => `${fmtKcal(v)} kcal`}
            reference={avgBurn || undefined}
            emptyText="No exercise logged in this period"
          />
          {avgBurn > 0 && <Legend line={`Average, ${fmtKcal(avgBurn)} kcal a day`} />}
        </Panel>
        <Panel title="Active minutes" subtitle={sub("Minutes of exercise")} badge={badge}>
          <ColumnChart
            ariaLabel={`Active minutes${per}`}
            columns={b.map((x, i) => col(i, Math.round(perDay.minutes(x))))}
            format={(v) => formatMinutes(v)}
            reference={Math.round(WEEKLY_MINUTES_TARGET / 7)}
            emptyText="No exercise logged in this period"
          />
          <Legend line={`${Math.round(WEEKLY_MINUTES_TARGET / 7)} min a day, the ${WEEKLY_MINUTES_TARGET}-a-week guideline`} />
        </Panel>
      </div>
      {
        // Food, steps, water and weight: equal cards in one carousel (two in view on wide screens).
        <Carousel
          label="Food, steps, water, weight and sleep"
          slides={[
            {
              title: "Calories eaten",
              content: (
                <Panel className="w-full" title="Calories eaten" subtitle={sub("Against your daily goal")} badge={badge}>
                  <ColumnChart
                    ariaLabel={`Calories eaten${per}, ${PERIODS.find((p) => p.id === period)!.range.toLowerCase()}`}
                    columns={b.map((x, i) => {
                      const v = perDay.eaten(x);
                      return soFar(i, "eaten") ?? col(i, v === null ? null : Math.round(v), logged(x, x.foodDays, "logged"), v !== null && v > calorieGoal);
                    })}
                    format={(v) => `${fmtKcal(v)} kcal`}
                    reference={calorieGoal}
                    emptyText="No meals logged in this period"
                  />
                  <Legend
                    items={[
                      { color: "bg-basil", label: "Within goal" },
                      { color: "bg-over", label: "Over goal" },
                      ...partialKey("eaten"),
                    ]}
                    line={`Goal, ${fmtKcal(calorieGoal)} kcal`}
                  />
                </Panel>
              ),
            },
            {
              title: "Steps",
              content: (
                <Panel className="w-full" title="Steps" subtitle={sub(stepsTarget ? "Against your daily target" : "Logged on the exercise page")} badge={badge}>
                  <ColumnChart
                    ariaLabel={`Steps${per}`}
                    columns={b.map((x, i) => {
                      const v = perDay.steps(x);
                      return soFar(i, "steps") ?? col(i, v === null ? null : Math.round(v), logged(x, x.stepDays, "with steps"));
                    })}
                    format={(v) => `${fmtKcal(v)} steps`}
                    reference={stepsTarget ?? undefined}
                    emptyText="No step counts in this period. Enter the day's steps on the exercise page: logged walks add minutes, not steps."
                  />
                  {stepsTarget ? (
                    <Legend
                      items={partialKey("steps")}
                      line={`Target, ${fmtKcal(stepsTarget)} steps`}
                    />
                  ) : (
                    <p className="mt-3 text-sm text-muted">
                      <a href="/account" className="font-semibold text-basil underline-offset-2 hover:underline">
                        Set a daily step target
                      </a>{" "}
                      to see it on this chart.
                    </p>
                  )}
                </Panel>
              ),
            },
            {
              title: "Water",
              content: (
                <Panel className="w-full" title="Water" subtitle={sub("Against your daily target")} badge={badge}>
                  <ColumnChart
                    ariaLabel={`Water${per}`}
                    columns={b.map((x, i) => {
                      const v = perDay.water(x);
                      return soFar(i, "water") ?? col(i, v === null ? null : Math.round(v), logged(x, x.waterDays, "with water"));
                    })}
                    format={fmtLitres}
                    tickFormat={fmtLitres}
                    reference={waterTarget}
                    emptyText="No water logged in this period. Add it on the food page."
                  />
                  <Legend
                    items={partialKey("water")}
                    line={`Target, ${fmtLitres(waterTarget)}`}
                  />
                </Panel>
              ),
            },
            {
              title: "Weight",
              content: <WeightPanel className="w-full" period={period} badge={badge} />,
            },
            {
              title: "Sleep",
              content: (
                <Panel className="w-full" title="Sleep" subtitle="Against your nightly target, averaged per night logged" badge={badge}>
                  <ColumnChart
                    ariaLabel={`Sleep a night${per}`}
                    columns={b.map((x, i) => {
                      const v = perDay.sleep(x);
                      return col(i, v === null ? null : Math.round(v), `${x.sleepDays} of ${x.days} nights logged`);
                    })}
                    format={formatMinutes}
                    tickFormat={(v) => `${hours(v)} h`}
                    reference={sleepTarget}
                    emptyText="No sleep logged in this period. Add it on the activity page."
                  />
                  <Legend line={`Target, ${formatMinutes(sleepTarget)} a night`} />
                </Panel>
              ),
            },
          ]}
        />
      }
    </>
  );
}

const STATUS = {
  under: { bar: "bg-ok", pill: "" },
  near: { bar: "bg-near", pill: "Almost at your goal" },
  over: { bar: "bg-over", pill: "Over your goal" },
} as const;

/** The daily view: everything about today, at a glance. No charts and no averages. */
function TodayView({ history }: { history: History }) {
  const { today, calorieGoal, stepsTarget, waterTarget, buckets } = history;
  // Today's exercise is in the newest daily bucket (exercise isn't held back like food).
  const now = buckets[buckets.length - 1];
  const eatenStatus = today.eaten !== null ? goalStatus(today.eaten, calorieGoal) : "under";
  const exercised = now.minutes > 0;
  return (
    <>
      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
        <TodayCard
          title="Calories eaten"
          value={fmtKcal(today.eaten ?? 0)}
          unit="kcal"
          target={`of ${fmtKcal(calorieGoal)} kcal goal`}
          pct={((today.eaten ?? 0) / calorieGoal) * 100}
          bar={STATUS[eatenStatus].bar}
          pill={STATUS[eatenStatus].pill}
          empty={today.eaten === null ? { text: "Nothing logged yet.", href: "/", action: "Log food" } : undefined}
        />
        <TodayCard
          title="Calories burned"
          value={fmtKcal(now.burned)}
          unit="kcal"
          target={exercised ? `in ${formatMinutes(now.minutes)} of exercise` : null}
          pct={null}
          empty={exercised ? undefined : { text: "No exercise logged yet.", href: "/exercise", action: "Log exercise" }}
        />
        <TodayCard
          title="Active minutes"
          value={String(Math.round(now.minutes))}
          unit="min"
          target={`of ${DAILY_MINUTES_TARGET} min a day`}
          pct={(now.minutes / DAILY_MINUTES_TARGET) * 100}
          reached={now.minutes >= DAILY_MINUTES_TARGET}
          empty={exercised ? undefined : { text: "No exercise logged yet.", href: "/exercise", action: "Log exercise" }}
        />
        <TodayCard
          title="Steps"
          value={fmtKcal(today.steps ?? 0)}
          unit="steps"
          target={stepsTarget ? `of ${fmtKcal(stepsTarget)}` : null}
          pct={stepsTarget ? ((today.steps ?? 0) / stepsTarget) * 100 : null}
          reached={today.steps !== null && stepsTarget !== null && today.steps >= stepsTarget}
          empty={today.steps === null ? { text: "No steps logged yet.", href: "/exercise", action: "Add steps" } : undefined}
          noTarget={stepsTarget ? undefined : { href: "/account", action: "Set a daily step target" }}
        />
        <TodayCard
          title="Water"
          value={fmtLitres(today.water ?? 0).replace(" L", "")}
          unit="L"
          target={`of ${fmtLitres(waterTarget)}`}
          pct={((today.water ?? 0) / waterTarget) * 100}
          reached={today.water !== null && today.water >= waterTarget}
          empty={today.water === null ? { text: "No water logged yet.", href: "/", action: "Add water" } : undefined}
        />
        <WeightPanel className="w-full" period="day" badge={BADGE.day} variant="today" />
        <SleepToday target={history.sleepTarget} minutes={now.sleep} logged={now.sleepDays > 0} />
      </div>
      <MacroSplit history={history} />
    </>
  );
}

/** Last night (the sleep that ended today), with when and how rested. */
function SleepToday({ target, minutes, logged }: { target: number; minutes: number; logged: boolean }) {
  const [night, setNight] = useState<{ bed: string; wake: string; quality: number | null } | null>(null);
  useEffect(() => {
    if (!logged) return;
    let cancelled = false;
    apiFetch(`/api/sleep?date=${todayISO()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d?.sleep && setNight(d.sleep))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [logged]);
  return (
    <TodayCard
      title="Sleep"
      value={logged ? `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, "0")}m` : "0"}
      unit={logged ? "" : "h"}
      target={`of ${formatMinutes(target)}`}
      pct={(minutes / target) * 100}
      reached={logged && minutes >= target}
      pill={night?.quality ? QUALITY_LABELS[night.quality] : undefined}
      note={night ? `${night.bed} to ${night.wake}` : undefined}
      empty={logged ? undefined : { text: "Last night isn't logged yet.", href: "/exercise", action: "Log sleep" }}
    />
  );
}

/**
 * One of today's numbers: value, unit and target, then a progress bar (or a short note). Every card
 * has the same shape, so a row of cards lines up without empty space; nothing logged shows 0 and
 * says where to log it.
 */
function TodayCard({
  title,
  value,
  unit,
  target,
  pct,
  bar = "bg-basil",
  pill,
  reached = false,
  empty,
  noTarget,
  note,
}: {
  title: string;
  value: string;
  unit: string;
  target: string | null; // "of 8,000"; null = no target
  pct: number | null; // null = no bar (no target)
  bar?: string;
  pill?: string;
  reached?: boolean;
  empty?: { text: string; href: string; action: string }; // set when nothing is logged today
  noTarget?: { href: string; action: string };
  note?: string; // a short detail under the bar, e.g. "23:15 to 06:35"
}) {
  return (
    <section aria-label={title} className="rounded-panel bg-surface p-5 ring-1 ring-line sm:p-6">
      <CardHeader title={title} badge={BADGE.day} />
      <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <span className={`text-[40px] leading-none font-extrabold tracking-[-0.03em] tabular-nums ${empty ? "text-faint" : ""}`}>{value}</span>
        {unit && <span className="text-base font-semibold text-muted">{unit}</span>}
        {target && <span className="text-sm text-muted">{target}</span>}
        {!empty && (pill || reached) && (
          <span className="ml-1 self-center rounded-full bg-sunken px-2.5 py-0.5 text-[13px] font-semibold text-ink">{pill || "Target reached"}</span>
        )}
      </p>
      {pct !== null && (
        <div
          role="progressbar"
          aria-label={`${title} against the ${title === "Calories eaten" ? "goal" : "target"}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(100, pct))}
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-sunken"
        >
          <div className={`h-full rounded-full ${bar} transition-[width] duration-500 ease-out`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      )}
      {note && !empty && <p className="mt-3 text-sm text-muted tabular-nums">{note}</p>}
      {empty ? (
        <p className="mt-3 text-sm text-muted">
          {empty.text}{" "}
          <Link href={empty.href} className="font-semibold text-basil underline-offset-2 hover:underline">
            {empty.action}
          </Link>
        </p>
      ) : (
        pct === null &&
        noTarget && (
          <p className="mt-3 text-sm text-muted">
            <Link href={noTarget.href} className="font-semibold text-basil underline-offset-2 hover:underline">
              {noTarget.action}
            </Link>{" "}
            to track progress.
          </p>
        )
      )}
    </section>
  );
}

/** Swatches for bar colours and a short line key for the reference line (goal / target). */
function Legend({ items, line }: { items?: { color: string; label: string }[]; line?: string }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
      {items?.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${i.color}`} aria-hidden="true" />
          {i.label}
        </li>
      ))}
      {line && (
        <li className="flex items-center gap-1.5">
          <span className="h-[1.5px] w-4 bg-ink/55" aria-hidden="true" />
          {line}
        </li>
      )}
    </ul>
  );
}

const MACROS = [
  { key: "protein", label: "Protein", color: "bg-protein" },
  { key: "carbs", label: "Carbs", color: "bg-carbs" },
  { key: "fat", label: "Fat", color: "bg-fat" },
] as const;

/** Where the calories came from (share of kcal from each macro) against the 30/40/30 target. */
function MacroSplit({ history }: { history: History }) {
  const daily = history.period === "day";
  const t = { protein: 0, carbs: 0, fat: 0 };
  for (const b of daily ? [history.today] : history.buckets) {
    t.protein += b.protein * KCAL.protein;
    t.carbs += b.carbs * KCAL.carbs;
    t.fat += b.fat * KCAL.fat;
  }
  const total = t.protein + t.carbs + t.fat;
  const yours = total ? MACROS.map((m) => Math.round((t[m.key] / total) * 100)) : null;
  const rows = [
    { label: "You", values: yours },
    { label: "Target", values: MACROS.map((m) => TARGET_SPLIT[m.key]) },
  ];

  return (
    <Panel
      title="Where your calories came from"
      subtitle={`Share of calories from protein, carbs and fat ${daily ? "today" : "across the period"}`}
      badge={BADGE[history.period]}
    >
      {yours === null ? (
        <p className="text-sm text-muted">
          {!daily && history.today.eaten !== null
            ? "Your split for the period starts tomorrow, once today is a full day of logging."
            : "Log meals to see your macro split."}
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.label} className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3">
                <span className="text-sm font-semibold">{r.label}</span>
                <div
                  className="flex h-4 gap-[2px] overflow-hidden rounded-[4px]"
                  role="img"
                  aria-label={`${r.label}: ${MACROS.map((m, i) => `${m.label} ${r.values![i]}%`).join(", ")}`}
                >
                  {MACROS.map((m, i) => (
                    <div key={m.key} className={`h-full ${m.color} ${r.label === "Target" ? "opacity-45" : ""}`} style={{ width: `${r.values![i]}%` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            {MACROS.map((m, i) => (
              <li key={m.key} className="flex items-center gap-2 text-muted">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${m.color}`} aria-hidden="true" />
                <span>
                  {m.label} <span className="font-semibold text-ink">{yours[i]}%</span>, target {TARGET_SPLIT[m.key]}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/** Every value in the charts, readable without hovering. */
function HistoryTable({ history }: { history: History }) {
  const { period, buckets, today } = history;
  const n = (v: number | null) => (v === null ? "–" : fmtKcal(v));
  const current = buckets.at(-1);
  const soFar = (v: number | null) => (v === null ? "–" : `${fmtKcal(v)} so far`);
  const litres = (ml: number | null) => (ml === null ? "–" : (ml / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const soFarLitres = (ml: number | null) => (ml === null ? "–" : `${litres(ml)} so far`);
  const foodDaysNow = (b: HistoryBucket) => b.foodDays + (today.eaten !== null ? 1 : 0);
  return (
    <Panel title="The numbers" subtitle="Food, steps and water are averaged over logged days; exercise over all days" badge={BADGE[period]}>
      <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
        <table className="w-full min-w-[700px] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-2 pr-3 font-semibold">{period === "day" ? "Day" : period === "week" ? "Week" : "Month"}</th>
              <th className="py-2 pr-3 text-right font-semibold">Eaten (kcal)</th>
              <th className="py-2 pr-3 text-right font-semibold">Burned (kcal)</th>
              <th className="py-2 pr-3 text-right font-semibold">Active (min)</th>
              <th className="py-2 pr-3 text-right font-semibold">Steps</th>
              <th className="py-2 pr-3 text-right font-semibold">Water (L)</th>
              <th className="py-2 pr-3 text-right font-semibold">Sleep (h)</th>
              <th className="py-2 text-right font-semibold">Days logged</th>
            </tr>
          </thead>
          <tbody>
            {[...buckets].reverse().map((b) => (
              <tr key={b.start} className="border-b border-line/70 last:border-0">
                <td className="py-2 pr-3">{bucketTitle(period, b)}</td>
                <td className="py-2 pr-3 text-right">{b === current ? soFar(soFarValue(history, "eaten")) : n(perDay.eaten(b))}</td>
                <td className="py-2 pr-3 text-right">{n(perDay.burned(b))}</td>
                <td className="py-2 pr-3 text-right">{n(perDay.minutes(b))}</td>
                <td className="py-2 pr-3 text-right">{b === current ? soFar(soFarValue(history, "steps")) : n(perDay.steps(b))}</td>
                <td className="py-2 pr-3 text-right">{b === current ? soFarLitres(soFarValue(history, "water")) : litres(perDay.water(b))}</td>
                <td className="py-2 pr-3 text-right">{perDay.sleep(b) === null ? "–" : hours(perDay.sleep(b)!)}</td>
                <td className="py-2 text-right">{b !== current ? `${b.foodDays} of ${b.days}` : period === "day" ? "Today" : `${foodDaysNow(b)} of ${b.days} so far`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" aria-hidden="true">
      <div className="h-44 animate-shimmer rounded-panel bg-surface ring-1 ring-line" />
      <div className="h-72 animate-shimmer rounded-panel bg-surface ring-1 ring-line" />
      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
        <div className="h-64 animate-shimmer rounded-panel bg-surface ring-1 ring-line" />
        <div className="h-64 animate-shimmer rounded-panel bg-surface ring-1 ring-line" />
      </div>
    </div>
  );
}
