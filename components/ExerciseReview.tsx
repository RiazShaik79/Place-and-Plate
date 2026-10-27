"use client";

import { useState } from "react";
import type { ExerciseEstimate, ExerciseItem } from "@/lib/types";
import { formatMinutes } from "@/lib/exercises";
import { fmtKcal } from "@/lib/nutrition";
import { toFriendlyMessage } from "@/lib/client";
import IntensityMeter from "./IntensityMeter";
import Notice from "./Notice";
import Spinner from "./Spinner";
import { CategoryIcon, Check } from "./Icons";

interface Props {
  estimate: ExerciseEstimate;
  onConfirm: (items: ExerciseItem[]) => Promise<void>;
  onCancel: () => void;
}

/** AI-identified activities with checkboxes; nothing is logged until the user confirms. */
export default function ExerciseReview({ estimate, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<boolean[]>(() => estimate.items.map(() => true));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = estimate.items.filter((_, i) => selected[i]);
  const total = chosen.reduce((s, i) => s + i.calories, 0);
  const count = estimate.items.length;

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(chosen);
    } catch (err) {
      setError(toFriendlyMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-card border border-line bg-surface p-1 shadow-[0_2px_12px_rgba(26,36,32,0.06)]">
      <div className="px-3 pt-3 pb-2">
        <p className="font-semibold">{count === 1 ? "Found 1 activity" : `Found ${count} activities`}</p>
        <p className="text-sm text-muted">Untick anything you didn&apos;t do.</p>
      </div>
      <ul>
        {estimate.items.map((item, i) => (
          <li key={i}>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-sunken ${
                selected[i] ? "" : "opacity-55"
              }`}
            >
              <input
                type="checkbox"
                checked={selected[i]}
                onChange={() => setSelected((prev) => prev.map((v, j) => (j === i ? !v : v)))}
                disabled={saving}
                className="peer sr-only"
              />
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-basil ${
                  selected[i] ? "border-basil bg-basil text-white" : "border-[#b9c4bc] bg-surface"
                }`}
                aria-hidden="true"
              >
                {selected[i] && <Check className="h-3.5 w-3.5" />}
              </span>
              <CategoryIcon category={item.category} className="h-[18px] w-[18px] shrink-0 text-faint" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 font-semibold break-words">{item.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-muted">
                  <span>{formatMinutes(item.minutes)}</span>
                  <IntensityMeter intensity={item.intensity} />
                </span>
              </span>
              <span className="shrink-0 font-bold tabular-nums">
                {fmtKcal(item.calories)} <span className="text-xs font-medium text-muted">kcal</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {estimate.notes && <p className="px-3 pt-1 text-[13px] text-muted">{estimate.notes}</p>}
      {estimate.weightIsDefault && (
        <p className="px-3 pt-1 text-[13px] text-muted">
          Calories assume {estimate.weightKg} kg.{" "}
          <a href="/account" className="font-semibold text-basil underline-offset-2 hover:underline">
            Add your weight
          </a>{" "}
          for a closer estimate.
        </p>
      )}
      {error && (
        <div className="px-2 pt-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="mt-2 flex flex-col-reverse gap-2 border-t border-line p-2 pt-3 sm:flex-row sm:items-center sm:justify-end">
        <button
          onClick={onCancel}
          disabled={saving}
          className="h-10 rounded-full px-4 text-sm font-semibold text-muted transition-colors hover:bg-sunken"
        >
          Discard
        </button>
        <button
          onClick={confirm}
          disabled={saving || chosen.length === 0}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-basil px-5 text-sm font-semibold text-white transition-colors hover:bg-basil-dark disabled:opacity-50"
        >
          {saving && <Spinner className="h-4 w-4" />}
          {chosen.length === 0 ? "Select at least one activity" : chosen.length === 1 ? "Log 1 session" : `Log ${chosen.length} sessions`}
          {chosen.length > 0 && <span className="font-normal text-white/75 tabular-nums">{fmtKcal(total)} kcal</span>}
        </button>
      </div>
    </div>
  );
}
