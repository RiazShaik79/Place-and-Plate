"use client";

import { useEffect, useState } from "react";
import { DAILY_STEPS_MAX } from "@/lib/account";
import { apiFetch } from "@/lib/client";
import { fmtKcal } from "@/lib/nutrition";
import { Pencil, Plus } from "./Icons";
import Spinner from "./Spinner";

/** The viewed day's step count against the daily target, entered by hand (no device sync). */
export default function StepsCard({ date, target, onSaved }: { date: string; target: number | null; onSaved?: (msg: string) => void }) {
  const [steps, setSteps] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEditing(false);
    apiFetch(`/api/steps?date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { steps: number | null }) => {
        if (cancelled) return;
        setSteps(d.steps);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const raw = draft.replace(/[,\s]/g, "");
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > DAILY_STEPS_MAX)) {
      setError(`Enter a whole number from 0 to ${fmtKcal(DAILY_STEPS_MAX)}, or leave it empty to clear.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/steps", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, steps: value }),
      });
      if (!res.ok) throw new Error();
      setSteps(value);
      setEditing(false);
      onSaved?.(value === null ? "Steps cleared" : "Steps saved");
    } catch {
      setError("Couldn't save your steps. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const pct = steps !== null && target ? Math.min(100, (steps / target) * 100) : 0;
  const reached = steps !== null && target !== null && steps >= target;

  return (
    <div className="mt-6 rounded-card bg-sunken/70 px-4 py-3.5">
      {editing ? (
        <form onSubmit={save}>
          <label htmlFor="steps-input" className="text-sm font-semibold">
            Steps for this day
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              id="steps-input"
              type="text"
              inputMode="numeric"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              placeholder="e.g. 7500"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "steps-error" : undefined}
              className={`h-10 w-32 rounded-lg border bg-surface px-3 font-semibold tabular-nums outline-none focus:ring-2 ${error ? "border-over focus:ring-over/15" : "border-line focus:border-basil focus:ring-basil/20"}`}
            />
            <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-basil px-4 text-sm font-semibold text-white hover:bg-basil-dark disabled:opacity-60">
              {saving && <Spinner className="h-4 w-4" />}
              Save steps
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-10 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-surface">
              Cancel
            </button>
          </div>
          {error && (
            <p id="steps-error" role="alert" className="mt-2 text-sm text-over">
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className={loading ? "animate-shimmer" : undefined}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm text-muted">
              <span className="font-semibold text-ink">Steps</span>{" "}
              {failed ? (
                "couldn't load"
              ) : steps === null ? (
                loading ? "" : "not logged for this day"
              ) : (
                <>
                  <span className="text-base font-bold text-ink">{fmtKcal(steps)}</span>
                  {target !== null && <> of {fmtKcal(target)}</>}
                  {reached && <span className="ml-2 rounded-full bg-basil-soft px-2 py-0.5 text-[13px] font-semibold text-basil">Target reached</span>}
                </>
              )}
            </p>
            {!loading && !failed && (
              <button
                onClick={() => {
                  setDraft(steps === null ? "" : String(steps));
                  setError(null);
                  setEditing(true);
                }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-semibold text-basil hover:bg-basil-soft"
              >
                {steps === null ? <Plus className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                {steps === null ? "Add steps" : "Edit"}
              </button>
            )}
          </div>
          {target !== null ? (
            <div
              role="progressbar"
              aria-label="Steps against your daily target"
              aria-valuemin={0}
              aria-valuemax={target}
              aria-valuenow={steps ?? 0}
              className="mt-2.5 h-2 overflow-hidden rounded-full bg-line/70"
            >
              <div className="h-full rounded-full bg-basil transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
            </div>
          ) : (
            <p className="mt-1 text-[13px] text-muted">
              <a href="/account" className="font-semibold text-basil underline-offset-2 hover:underline">
                Set a daily step target
              </a>{" "}
              to track progress.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
