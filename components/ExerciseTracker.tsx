"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AiSource, Exercise, ExerciseDay, ExerciseEntry, ExerciseItem } from "@/lib/types";
import { DEFAULT_WEIGHT_KG, sumExercise } from "@/lib/exercises";
import { ISO_DATE_RE, todayISO } from "@/lib/nutrition";
import { apiFetch, FriendlyError, onBeforeSignOut } from "@/lib/client";
import DateNav from "./DateNav";
import ExerciseSummary from "./ExerciseSummary";
import ExerciseLog from "./ExerciseLog";
import AddExercisePanel from "./AddExercisePanel";
import Notice from "./Notice";
import StepsCard from "./StepsCard";
import WeightCard from "./WeightCard";
import SleepCard from "./SleepCard";
import Toast, { type ToastMessage } from "./Toast";

const TOAST_MS = 5000;

/**
 * Owns the exercise page: the viewed day, its sessions, the 7-day strip, toasts and undoable
 * removes. `initialDate` comes from `?date=` (e.g. the link on the food page).
 */
export default function ExerciseTracker({
  weightKg,
  stepsTarget,
  initialDate,
}: {
  weightKg: number | null;
  stepsTarget: number | null;
  initialDate?: string;
}) {
  const [date, setDate] = useState<string | null>(null);
  const [entries, setEntries] = useState<ExerciseEntry[]>([]);
  const [week, setWeek] = useState<ExerciseDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingDeletes = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  // "Today" is resolved on the client so it uses the user's local date.
  useEffect(() => {
    const today = todayISO();
    setDate(initialDate && ISO_DATE_RE.test(initialDate) && initialDate <= today ? initialDate : today);
  }, [initialDate]);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setLoading(true);
    setWeek(null);
    setEntries([]); // never show the previous day's sessions under this day's heading
    Promise.all([
      apiFetch(`/api/exercise?date=${date}`).then((r) => (r.ok ? r.json() : Promise.reject())),
      apiFetch(`/api/exercise/week?end=${date}`).then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([day, wk]: [{ entries: ExerciseEntry[] }, { days: ExerciseDay[] }]) => {
        if (cancelled) return;
        setEntries(day.entries.filter((e) => !pendingDeletes.current.has(e.id)));
        setWeek(wk.days);
        setLoadFailed(false);
      })
      .catch(() => !cancelled && setLoadFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, reloadKey]);

  // If the page closes, or the user signs out, during an undo window, send the removal now.
  useEffect(() => {
    const pending = pendingDeletes.current;
    const flush = () => {
      const requests = [...pending].map(([id, timer]) => {
        clearTimeout(timer);
        return fetch(`/api/exercise/${id}`, { method: "DELETE", keepalive: true });
      });
      pending.clear();
      return Promise.allSettled(requests);
    };
    window.addEventListener("pagehide", flush);
    const unregister = onBeforeSignOut(flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      unregister();
    };
  }, []);

  const showToast = useCallback((text: string, action?: ToastMessage["action"]) => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, action });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const addExercise = useCallback(
    async (exercise: Exercise, minutes: number) => {
      if (!date) return;
      try {
        const res = await apiFetch("/api/exercise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exerciseId: exercise.id, minutes, date }),
        });
        if (!res.ok) throw new Error();
        const { entry } = (await res.json()) as { entry: ExerciseEntry };
        setEntries((prev) => [...prev, entry]);
        setError(null);
        showToast(`Logged ${minutes} min of ${exercise.name.toLowerCase()}`);
      } catch {
        setError(`Couldn't log ${exercise.name.toLowerCase()}. Try again.`);
      }
    },
    [date, showToast],
  );

  // Throws FriendlyError so the review panel can show the message inline.
  const logItems = useCallback(
    async (items: ExerciseItem[], source: AiSource) => {
      if (!date) return;
      let res: Response;
      try {
        res = await apiFetch("/api/exercise/custom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, source, items }),
        });
      } catch {
        throw new FriendlyError("Couldn't reach the app, so nothing was saved. Try again.");
      }
      if (!res.ok) throw new FriendlyError("Couldn't save these sessions. Try again.");
      const { entries: added } = (await res.json()) as { entries: ExerciseEntry[] };
      setEntries((prev) => [...prev, ...added]);
      setError(null);
      showToast(added.length === 1 ? `Logged ${added[0].name.toLowerCase()}` : `Logged ${added.length} sessions`);
    },
    [date, showToast],
  );

  const restore = useCallback((entry: ExerciseEntry) => {
    setEntries((prev) => [...prev, entry].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id));
  }, []);

  const removeEntry = useCallback(
    (entry: ExerciseEntry) => {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      const timer = setTimeout(async () => {
        pendingDeletes.current.delete(entry.id);
        try {
          const res = await apiFetch(`/api/exercise/${entry.id}`, { method: "DELETE" });
          if (!res.ok && res.status !== 404) throw new Error();
        } catch {
          restore(entry);
          setError(`Couldn't remove ${entry.name.toLowerCase()}. Try again.`);
        }
      }, TOAST_MS);
      pendingDeletes.current.set(entry.id, timer);
      showToast(`Removed ${entry.name.toLowerCase()}`, {
        label: "Undo",
        onClick: () => {
          clearTimeout(pendingDeletes.current.get(entry.id));
          pendingDeletes.current.delete(entry.id);
          restore(entry);
        },
      });
    },
    [restore, showToast],
  );

  // "Add" buttons: bring the panel into view and put the cursor in search.
  const focusPanel = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    if (rect.top < 120 || rect.top > window.innerHeight * 0.6) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("exercise-search")?.focus({ preventScroll: true });
  }, []);

  if (!date) return null;

  // The viewed day is the last bar; keep it in step with the list without refetching.
  const totals = sumExercise(entries);
  const liveWeek = week && !loading ? week.map((d) => (d.date === date ? { ...d, minutes: totals.minutes, calories: totals.calories } : d)) : week;

  return (
    <div className="space-y-5 sm:space-y-6">
      <DateNav date={date} onChange={setDate} />
      {loadFailed && (
        <Notice tone="error" action={{ label: "Retry", onClick: () => setReloadKey((k) => k + 1) }}>
          Couldn&apos;t load this day&apos;s exercise. Check that the app is still running, then retry.
        </Notice>
      )}
      {/* A day that didn't load shows no numbers (zeros would be a false claim about it). Hidden,
          not unmounted, so the add panel keeps any half-done search or AI review. */}
      <div hidden={loadFailed} className="space-y-5 sm:space-y-6">
        <ExerciseSummary
          date={date}
          entries={entries}
          week={liveWeek}
          loading={loading}
          weightKg={weightKg}
          onPickDay={setDate}
          steps={
            <>
              <StepsCard date={date} target={stepsTarget} onSaved={showToast} />
              <WeightCard date={date} onSaved={showToast} />
              <SleepCard date={date} onSaved={showToast} />
            </>
          }
        />
        {error && (
          <Notice tone="error" action={{ label: "Dismiss", onClick: () => setError(null) }}>
            {error}
          </Notice>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <ExerciseLog entries={entries} loading={loading} onRemove={removeEntry} onAdd={focusPanel} />
          <div className="lg:sticky lg:top-24">
            <AddExercisePanel ref={panelRef} weightKg={weightKg ?? DEFAULT_WEIGHT_KG} onAdd={addExercise} onLogItems={logItems} />
          </div>
        </div>
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
