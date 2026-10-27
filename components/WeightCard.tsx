"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WEIGHT_MAX, WEIGHT_MIN } from "@/lib/account";
import { apiFetch } from "@/lib/client";
import { fmt } from "@/lib/nutrition";
import { Pencil, Plus } from "./Icons";
import Spinner from "./Spinner";

/**
 * The viewed day's weigh-in, entered by hand (same pattern as the steps card). The newest weigh-in
 * becomes the current weight, which exercise calories use, so the page refreshes after a save.
 */
export default function WeightCard({ date, onSaved }: { date: string; onSaved?: (msg: string) => void }) {
  const router = useRouter();
  const [kg, setKg] = useState<number | null>(null);
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
    apiFetch(`/api/weight?from=${date}&to=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { entries: { kg: number }[]; before: { kg: number } | null }) => {
        if (cancelled) return;
        setKg(d.entries[0]?.kg ?? null);
        setDraft(String(d.entries[0]?.kg ?? d.before?.kg ?? ""));
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
    const raw = draft.trim().replace(",", ".");
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < WEIGHT_MIN || value > WEIGHT_MAX)) {
      setError(`Enter a weight from ${WEIGHT_MIN} to ${WEIGHT_MAX} kg, or leave it empty to clear.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res =
        value === null
          ? await apiFetch(`/api/weight/${date}`, { method: "DELETE" })
          : await apiFetch("/api/weight", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, kg: value }) });
      if (!res.ok && !(value === null && res.status === 404)) throw new Error();
      setKg(value === null ? null : Math.round(value * 10) / 10);
      setEditing(false);
      onSaved?.(value === null ? "Weight cleared" : "Weight saved");
      router.refresh(); // the current weight feeds exercise calories
    } catch {
      setError("Couldn't save your weight. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-card bg-sunken/70 px-4 py-3.5">
      {editing ? (
        <form onSubmit={save}>
          <label htmlFor="weight-input" className="text-sm font-semibold">
            Weight for this day, in kg
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              id="weight-input"
              type="text"
              inputMode="decimal"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              placeholder="e.g. 71.4"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "weight-input-error" : undefined}
              className={`h-10 w-32 rounded-lg border bg-surface px-3 font-semibold tabular-nums outline-none focus:ring-2 ${error ? "border-over focus:ring-over/15" : "border-line focus:border-basil focus:ring-basil/20"}`}
            />
            <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-basil px-4 text-sm font-semibold text-white hover:bg-basil-dark disabled:opacity-60">
              {saving && <Spinner className="h-4 w-4" />}
              Save weight
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-10 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-surface">
              Cancel
            </button>
          </div>
          {error && (
            <p id="weight-input-error" role="alert" className="mt-2 text-sm text-over">
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 ${loading ? "animate-shimmer" : ""}`}>
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">Weight</span>{" "}
            {failed ? "couldn't load" : kg === null ? (loading ? "" : "not logged for this day") : <span className="text-base font-bold text-ink tabular-nums">{fmt(kg)} kg</span>}
          </p>
          {!loading && !failed && (
            <button
              onClick={() => {
                setError(null);
                setEditing(true);
              }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-semibold text-basil hover:bg-basil-soft"
            >
              {kg === null ? <Plus className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              {kg === null ? "Add weight" : "Edit"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
