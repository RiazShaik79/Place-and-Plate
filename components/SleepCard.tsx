"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client";
import { formatMinutes } from "@/lib/exercises";
import { QUALITY_LABELS, sleepMinutes, sleepProblem } from "@/lib/sleep";
import { Pencil, Plus } from "./Icons";
import Spinner from "./Spinner";

interface Night {
  bed: string;
  wake: string;
  minutes: number;
  quality: number | null;
}

/**
 * The night that ended on the viewed day: bedtime, wake time (the duration is worked out, across
 * midnight too) and an optional 1–5 "how rested". Same pattern as the steps and weight cards.
 */
export default function SleepCard({ date, onSaved }: { date: string; onSaved?: (msg: string) => void }) {
  const [night, setNight] = useState<Night | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [bed, setBed] = useState("23:00");
  const [wake, setWake] = useState("07:00");
  const [quality, setQuality] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEditing(false);
    apiFetch(`/api/sleep?date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { sleep: Night | null }) => {
        if (cancelled) return;
        setNight(d.sleep);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  function startEdit() {
    setBed(night?.bed ?? "23:00");
    setWake(night?.wake ?? "07:00");
    setQuality(night?.quality ?? null);
    setError(null);
    setEditing(true);
  }

  const preview = sleepMinutes(bed, wake);

  async function send(body: object, done: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/sleep", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, ...body }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "");
      const { sleep } = (await res.json()) as { sleep: Night | null };
      setNight(sleep);
      setEditing(false);
      onSaved?.(done);
    } catch (e) {
      setError((e as Error).message || "Couldn't save your sleep. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const problem = sleepProblem(preview);
    if (problem) {
      setError(problem);
      return;
    }
    void send({ bed, wake, quality }, "Sleep saved");
  }

  return (
    <div className="mt-3 rounded-card bg-sunken/70 px-4 py-3.5">
      {editing ? (
        <form onSubmit={save}>
          <fieldset>
            <legend className="text-sm font-semibold">Sleep that ended this morning</legend>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-[13px] text-muted">Bedtime</span>
                <input
                  id="sleep-bed"
                  type="time"
                  value={bed}
                  onChange={(e) => setBed(e.target.value)}
                  className="h-10 rounded-lg border border-line bg-surface px-3 font-semibold tabular-nums outline-none focus:border-basil focus:ring-2 focus:ring-basil/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[13px] text-muted">Woke up</span>
                <input
                  id="sleep-wake"
                  type="time"
                  value={wake}
                  onChange={(e) => setWake(e.target.value)}
                  className="h-10 rounded-lg border border-line bg-surface px-3 font-semibold tabular-nums outline-none focus:border-basil focus:ring-2 focus:ring-basil/20"
                />
              </label>
              <p className="pb-2.5 text-sm text-muted" aria-live="polite">
                {preview !== null && !sleepProblem(preview) ? (
                  <>
                    = <span className="font-bold text-ink">{formatMinutes(preview)}</span>
                  </>
                ) : (
                  "Check the times"
                )}
              </p>
            </div>
          </fieldset>
          <div className="mt-3">
            <p id="sleep-quality-label" className="mb-1 text-[13px] text-muted">
              How rested do you feel? <span className="text-faint">(optional)</span>
            </p>
            <div role="radiogroup" aria-labelledby="sleep-quality-label" className="flex flex-wrap items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((q) => (
                <button
                  key={q}
                  type="button"
                  role="radio"
                  aria-checked={quality === q}
                  aria-label={`${q}, ${QUALITY_LABELS[q]}`}
                  onClick={() => setQuality(quality === q ? null : q)}
                  className={`grid h-9 w-9 place-items-center rounded-full border text-sm font-semibold transition-colors ${quality === q ? "border-basil bg-basil text-white" : "border-line bg-surface text-ink hover:bg-sunken"}`}
                >
                  {q}
                </button>
              ))}
              <span className="ml-1 text-sm text-muted">{quality ? QUALITY_LABELS[quality] : "1 is exhausted, 5 is fully rested"}</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-basil px-4 text-sm font-semibold text-white hover:bg-basil-dark disabled:opacity-60">
              {saving && <Spinner className="h-4 w-4" />}
              Save sleep
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-10 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-surface">
              Cancel
            </button>
            {night && (
              <button type="button" onClick={() => void send({ clear: true }, "Sleep cleared")} className="ml-auto h-10 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-surface hover:text-over">
                Clear
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-over">
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 ${loading ? "animate-shimmer" : ""}`}>
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">Sleep</span>{" "}
            {failed ? (
              "couldn't load"
            ) : night ? (
              <>
                <span className="text-base font-bold text-ink tabular-nums">{formatMinutes(night.minutes)}</span>{" "}
                <span className="tabular-nums">
                  {night.bed} to {night.wake}
                </span>
                {night.quality && <>, {QUALITY_LABELS[night.quality].toLowerCase()} ({night.quality} of 5)</>}
              </>
            ) : loading ? (
              ""
            ) : (
              "not logged for this night"
            )}
          </p>
          {!loading && !failed && (
            <button onClick={startEdit} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-semibold text-basil hover:bg-basil-soft">
              {night ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {night ? "Edit" : "Add sleep"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
