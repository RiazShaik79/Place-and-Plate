"use client";

import { useEffect, useRef, useState } from "react";
import { DAILY_WATER_MAX, WATER_BOTTLE, WATER_GLASS } from "@/lib/account";
import { apiFetch } from "@/lib/client";
import { fmtKcal, fmtLitres } from "@/lib/nutrition";
import type { ToastMessage } from "./Toast";
import { Droplet, Pencil, Plus } from "./Icons";
import Spinner from "./Spinner";

interface Props {
  date: string;
  target: number; // ml
  onToast: (text: string, action?: ToastMessage["action"]) => void;
}

const QUICK = [
  { ml: WATER_GLASS, label: "Glass" },
  { ml: WATER_BOTTLE, label: "Bottle" },
];

/**
 * The viewed day's water against the daily target. Quick adds show at once and are sent as
 * increments (the server adds them atomically), so fast taps all count; the toast offers Undo.
 */
export default function WaterCard({ date, target, onToast }: Props) {
  const [ml, setMl] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(0);
  const viewed = useRef(date);
  viewed.current = date;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEditing(false);
    setError(null);
    setMl(null);
    apiFetch(`/api/water?date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { ml: number | null }) => {
        if (cancelled) return;
        setMl(d.ml);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, reload]);

  /** Add (or with a negative amount, take back) water on `day`; returns whether it saved. */
  async function change(day: string, delta: number): Promise<boolean> {
    const here = day === viewed.current;
    if (here) setMl((m) => Math.min(DAILY_WATER_MAX, Math.max(0, (m ?? 0) + delta)));
    inFlight.current++;
    try {
      const res = await apiFetch("/api/water", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: day, add: delta }),
      });
      if (!res.ok) throw new Error();
      const { ml: total } = (await res.json()) as { ml: number };
      // Only trust the server's total once every tap has landed (earlier replies are out of date).
      if (--inFlight.current === 0 && day === viewed.current) setMl(total);
      return true;
    } catch {
      inFlight.current--;
      if (day === viewed.current) {
        setMl((m) => Math.max(0, (m ?? 0) - delta));
        setError("Couldn't save that. Check that the app is still running, then try again.");
      }
      return false;
    }
  }

  async function quickAdd(amount: number) {
    setError(null);
    const day = date;
    if (await change(day, amount)) {
      onToast(`Added ${fmtKcal(amount)} ml of water`, { label: "Undo", onClick: () => void change(day, -amount) });
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const raw = draft.replace(/[,\s]/g, "").replace(/ml$/i, "");
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > DAILY_WATER_MAX)) {
      setError(`Enter a whole number of ml from 0 to ${fmtKcal(DAILY_WATER_MAX)}, or leave it empty to clear.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/water", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, ml: value }),
      });
      if (!res.ok) throw new Error();
      setMl(value);
      setEditing(false);
      onToast(value === null ? "Water cleared" : "Water saved");
    } catch {
      setError("Couldn't save your water. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const total = ml ?? 0;
  const pct = Math.min(100, (total / target) * 100);
  const reached = total >= target;

  return (
    <div className="mt-3 rounded-card bg-sunken/70 px-3.5 py-3">
      {editing ? (
        <form onSubmit={save}>
          <label htmlFor="water-input" className="text-sm font-semibold">
            Water for this day, in ml
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              id="water-input"
              type="text"
              inputMode="numeric"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              placeholder="e.g. 1500"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "water-error" : undefined}
              className={`h-10 w-32 rounded-lg border bg-surface px-3 font-semibold tabular-nums outline-none focus:ring-2 ${error ? "border-over focus:ring-over/15" : "border-line focus:border-basil focus:ring-basil/20"}`}
            />
            <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-basil px-4 text-sm font-semibold text-white hover:bg-basil-dark disabled:opacity-60">
              {saving && <Spinner className="h-4 w-4" />}
              Save water
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-10 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-surface">
              Cancel
            </button>
          </div>
          {error && (
            <p id="water-error" role="alert" className="mt-2 text-sm text-over">
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className={loading ? "animate-shimmer" : undefined}>
          {/* Edit stays pinned right; the label (and "Target reached") wraps instead. */}
          <div className="flex items-start justify-between gap-3">
            <p className="flex min-w-0 flex-1 items-start gap-2.5 text-sm leading-6 text-muted" aria-live="polite">
              <Droplet className="mt-[3px] h-[18px] w-[18px] shrink-0 text-basil" />
              <span>
                <span className="font-semibold text-ink">Water</span>{" "}
                {failed ? (
                  "couldn't load"
                ) : loading ? (
                  ""
                ) : (
                  <>
                    <span className="font-bold text-ink tabular-nums">{fmtLitres(total)}</span> of {fmtLitres(target)}
                    {reached && <span className="ml-2 inline-block rounded-full bg-basil-soft px-2 text-[13px] leading-6 font-semibold whitespace-nowrap text-basil">Target reached</span>}
                  </>
                )}
              </span>
            </p>
            {failed ? (
              <button onClick={() => setReload((k) => k + 1)} className="shrink-0 rounded-md px-1.5 py-0.5 text-sm font-semibold text-basil hover:bg-basil-soft">
                Retry
              </button>
            ) : (
              !loading && (
                <button
                  onClick={() => {
                    setDraft(ml === null ? "" : String(ml));
                    setError(null);
                    setEditing(true);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-semibold text-basil hover:bg-basil-soft"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
              )
            )}
          </div>
          <div
            role="progressbar"
            aria-label="Water against your daily target"
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={total}
            aria-valuetext={`${fmtLitres(total)} of ${fmtLitres(target)}`}
            className="mt-2.5 h-2 overflow-hidden rounded-full bg-line/70"
          >
            <div className="h-full rounded-full bg-basil transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
          </div>
          {!failed && (
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <button
                  key={q.ml}
                  onClick={() => quickAdd(q.ml)}
                  disabled={loading}
                  aria-label={`Add a ${q.label.toLowerCase()} of water, ${q.ml} ml`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1.5 pr-3.5 pl-2.5 text-sm font-semibold text-basil transition-colors hover:bg-basil-soft disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {q.label}
                  <span className="font-normal text-muted tabular-nums">{q.ml} ml</span>
                </button>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-over">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
