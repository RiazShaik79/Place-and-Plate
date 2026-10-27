"use client";

import { useState } from "react";
import type { Exercise } from "@/lib/types";
import { caloriesBurned, EXERCISES, formatMinutes, MAX_MINUTES, searchExercises } from "@/lib/exercises";
import { fmtKcal } from "@/lib/nutrition";
import IntensityMeter from "./IntensityMeter";
import { CategoryIcon, Minus, Plus, Search } from "./Icons";
import Spinner from "./Spinner";

interface Props {
  weightKg: number;
  onAdd: (exercise: Exercise, minutes: number) => Promise<void>;
  onDescribe: () => void;
}

const PRESETS = [15, 30, 45, 60];

/** Search the activity catalogue; picking one opens a duration picker with a live calorie estimate. */
export default function ExerciseSearch({ weightKg, onAdd, onDescribe }: Props) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const results = searchExercises(query);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-faint" />
        <input
          id="exercise-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${EXERCISES.length} activities`}
          className="h-11 w-full rounded-full border border-line bg-sunken pr-4 pl-10 outline-none transition-colors placeholder:text-faint focus:border-basil focus:bg-surface focus:ring-2 focus:ring-basil/20"
          aria-label="Search activities"
          autoComplete="off"
        />
      </div>

      <ul className="-mx-2 mt-3 max-h-[22rem] overflow-y-auto overscroll-contain px-2 lg:max-h-[26rem]">
        {results.map((ex) => (
          <ExerciseRow
            key={ex.id}
            exercise={ex}
            weightKg={weightKg}
            open={openId === ex.id}
            onToggle={() => setOpenId(openId === ex.id ? null : ex.id)}
            onAdd={onAdd}
          />
        ))}
        {results.length === 0 && (
          <li className="rounded-card bg-sunken px-4 py-6 text-center text-sm text-muted">
            <p>
              No match for <span className="font-semibold text-ink">“{query}”</span> in the list.
            </p>
            <button onClick={onDescribe} className="mt-2 font-semibold text-basil hover:underline">
              Describe it and let AI estimate it instead
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

function ExerciseRow({
  exercise,
  weightKg,
  open,
  onToggle,
  onAdd,
}: {
  exercise: Exercise;
  weightKg: number;
  open: boolean;
  onToggle: () => void;
  onAdd: Props["onAdd"];
}) {
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const valid = Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES;
  const kcal = caloriesBurned(exercise.met, weightKg, valid ? minutes : 30);

  const step = (delta: number) => setMinutes((m) => Math.min(MAX_MINUTES, Math.max(5, Math.round((m + delta) / 5) * 5)));

  async function handleAdd() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onAdd(exercise, minutes);
      setMinutes(30);
      onToggle();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`rounded-card transition-colors ${open ? "bg-sunken" : ""}`}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-card px-3 py-2.5 text-left ${open ? "" : "hover:bg-sunken/70"}`}
      >
        <CategoryIcon category={exercise.category} className="h-[18px] w-[18px] shrink-0 text-faint" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block font-semibold">{exercise.name}</span>
          <span className="block truncate text-[13px] text-muted">{exercise.detail}</span>
        </span>
        <span className="shrink-0 text-right text-sm tabular-nums">
          <span className="font-semibold">{fmtKcal(kcal)}</span> <span className="text-muted">kcal</span>
          <span className="block text-xs text-muted">{open && valid ? formatMinutes(minutes) : "per 30 min"}</span>
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted">
            <IntensityMeter intensity={exercise.intensity} />
            <div className="flex gap-1.5" role="group" aria-label="Common durations">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setMinutes(p)}
                  aria-pressed={minutes === p}
                  className={`rounded-full border px-2.5 py-0.5 text-[13px] font-semibold transition-colors ${
                    minutes === p ? "border-basil bg-basil-soft text-basil" : "border-line bg-surface text-muted hover:text-ink"
                  }`}
                >
                  {p} min
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 items-center rounded-full border border-line bg-surface">
              <button
                onClick={() => step(-5)}
                disabled={minutes <= 5}
                aria-label="5 minutes less"
                className="grid h-10 w-10 place-items-center rounded-full text-muted hover:text-ink disabled:opacity-30"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max={MAX_MINUTES}
                value={Number.isFinite(minutes) ? minutes : ""}
                onChange={(e) => setMinutes(Math.round(Number(e.target.value)))}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="w-11 bg-transparent text-center font-semibold tabular-nums outline-none"
                aria-label={`Minutes of ${exercise.name}`}
              />
              <button
                onClick={() => step(5)}
                disabled={minutes >= MAX_MINUTES}
                aria-label="5 minutes more"
                className="grid h-10 w-10 place-items-center rounded-full text-muted hover:text-ink disabled:opacity-30"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <span className="text-sm text-muted">min</span>
            <button
              onClick={handleAdd}
              disabled={!valid || busy}
              className="ml-auto inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-basil px-4 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-basil-dark disabled:opacity-50"
            >
              {busy && <Spinner className="h-4 w-4" />}
              Log session
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
