"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MEAL_LABELS, type AiSource, type Food, type LogEntry, type Meal, type NutritionItem } from "@/lib/types";
import { mealForTime, shiftDate, todayISO } from "@/lib/nutrition";
import { sumExercise } from "@/lib/exercises";
import { apiFetch, FriendlyError, onBeforeSignOut, takeFlash } from "@/lib/client";
import DateNav from "./DateNav";
import DailySummary from "./DailySummary";
import WaterCard from "./WaterCard";
import AddFoodPanel from "./AddFoodPanel";
import FoodLog, { type EntryChange } from "./FoodLog";
import type { AgainSource } from "./RecentFoods";
import Notice from "./Notice";
import Toast, { type ToastMessage } from "./Toast";

const TOAST_MS = 5000;

/**
 * Owns app state: the selected day, its entries, the calorie goal, the meal being added to, and toasts.
 * The page renders this only for a signed-in user and passes that user's goal from the server.
 */
export default function CalorieTracker({ initialGoal, waterTarget, hasHistory }: { initialGoal: number; waterTarget: number; hasHistory: boolean }) {
  const [date, setDate] = useState<string | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [goal, setGoal] = useState<number>(initialGoal);
  const [burned, setBurned] = useState<{ minutes: number; calories: number } | null>(null);
  const [meal, setMeal] = useState<Meal>("breakfast");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [recentKey, setRecentKey] = useState(0); // bumps after every add so Recent stays current
  const [previous, setPrevious] = useState<{ label: string; entries: LogEntry[] } | null>(null);
  const addPanelRef = useRef<HTMLElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Removals wait TOAST_MS before hitting the server so "Undo" can cancel them.
  const pendingDeletes = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  // Resolve "today" and the likely meal on the client so they use the user's local time.
  useEffect(() => {
    setDate(todayISO());
    setMeal(mealForTime());
  }, []);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setLoading(true);
    setEntries([]); // never show the previous day's entries under this day's heading
    apiFetch(`/api/log?date=${date}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { entries: LogEntry[] }) => {
        if (cancelled) return;
        setEntries(data.entries.filter((e) => !pendingDeletes.current.has(e.id)));
        setLoadFailed(false);
      })
      .catch(() => !cancelled && setLoadFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, reloadKey]);

  // The day before, for each empty meal's "Same as yesterday". Optional: left out if it fails.
  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    const prev = shiftDate(date, -1);
    const label = date === todayISO() ? "yesterday" : new Date(`${prev}T12:00`).toLocaleDateString(undefined, { weekday: "long" });
    setPrevious(null);
    apiFetch(`/api/log?date=${prev}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { entries: LogEntry[] }) => !cancelled && setPrevious({ label, entries: data.entries }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [date]);

  // Exercise for the same day, shown as a side note in the summary (it doesn't change the budget).
  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setBurned(null);
    apiFetch(`/api/exercise?date=${date}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { entries: { minutes: number; calories: number }[] }) => !cancelled && setBurned(sumExercise(data.entries)))
      .catch(() => {
        // optional detail: leave it out rather than show an error
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  // If the page closes, or the user signs out, while a removal is waiting for its undo window, send it now.
  useEffect(() => {
    const pending = pendingDeletes.current;
    const flush = () => {
      const requests = [...pending].map(([id, timer]) => {
        clearTimeout(timer);
        return fetch(`/api/log/${id}`, { method: "DELETE", keepalive: true });
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

  // A message carried over from the previous page (after sign-up or a password reset).
  useEffect(() => {
    const message = takeFlash();
    if (message) showToast(message);
  }, [showToast]);

  const restore = useCallback((entry: LogEntry) => {
    setEntries((prev) =>
      [...prev, entry].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id),
    );
  }, []);

  const addFood = useCallback(
    async (food: Food, servings: number) => {
      if (!date) return;
      try {
        const res = await apiFetch("/api/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ foodId: food.id, servings, date, meal }),
        });
        if (!res.ok) throw new Error();
        const { entry } = (await res.json()) as { entry: LogEntry };
        setEntries((prev) => [...prev, entry]);
        setError(null);
        setRecentKey((k) => k + 1);
        showToast(`Added ${food.name} to ${MEAL_LABELS[meal].toLowerCase()}`);
      } catch {
        setError(`Couldn't add ${food.name}. Try again.`);
      }
    },
    [date, meal, showToast],
  );

  // Throws FriendlyError so the AI review panel can show the message inline.
  const logItems = useCallback(
    async (items: NutritionItem[], source: AiSource) => {
      if (!date) return;
      let res: Response;
      try {
        res = await apiFetch("/api/log/custom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, meal, source, items }),
        });
      } catch {
        throw new FriendlyError("Couldn't reach the app, so nothing was saved. Try again.");
      }
      if (!res.ok) throw new FriendlyError("Couldn't save these to your log. Try again.");
      const { entries: added } = (await res.json()) as { entries: LogEntry[] };
      setEntries((prev) => [...prev, ...added]);
      setError(null);
      setRecentKey((k) => k + 1);
      showToast(`Added ${added.length} ${added.length === 1 ? "item" : "items"} to ${MEAL_LABELS[meal].toLowerCase()}`);
    },
    [date, meal, showToast],
  );

  /** Add past entries or favourites again (the server copies their nutrition). Null on failure. */
  const repeat = useCallback(
    async (items: (AgainSource & { servings?: number })[], into: Meal): Promise<LogEntry[] | null> => {
      if (!date) return null;
      try {
        const res = await apiFetch("/api/log/repeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, meal: into, items }),
        });
        if (!res.ok) throw new Error();
        const { entries: added } = (await res.json()) as { entries: LogEntry[] };
        setEntries((prev) => [...prev, ...added]);
        setError(null);
        setRecentKey((k) => k + 1);
        return added;
      } catch {
        return null;
      }
    },
    [date],
  );

  const addAgain = useCallback(
    async (source: AgainSource, servings: number, name: string) => {
      const added = await repeat([{ ...source, servings }], meal);
      if (!added) {
        setError(`Couldn't add ${name}. Try again.`);
        return false;
      }
      showToast(`Added ${name} to ${MEAL_LABELS[meal].toLowerCase()}`);
      return true;
    },
    [meal, repeat, showToast],
  );

  // "Same as yesterday": copy a whole meal, with Undo (which removes the copies straight away).
  const copyMeal = useCallback(
    async (into: Meal, from: LogEntry[]) => {
      const added = await repeat(from.map((e) => ({ entryId: e.id })), into);
      if (!added) {
        setError(`Couldn't copy ${MEAL_LABELS[into].toLowerCase()}. Try again.`);
        return false;
      }
      const ids = new Set(added.map((e) => e.id));
      showToast(`Added ${added.length} ${added.length === 1 ? "item" : "items"} to ${MEAL_LABELS[into].toLowerCase()}`, {
        label: "Undo",
        onClick: async () => {
          setEntries((prev) => prev.filter((e) => !ids.has(e.id)));
          const results = await Promise.allSettled(added.map((e) => apiFetch(`/api/log/${e.id}`, { method: "DELETE" })));
          const kept = added.filter((_, i) => results[i].status === "rejected" || !(results[i] as PromiseFulfilledResult<Response>).value.ok);
          if (kept.length) {
            kept.forEach(restore);
            setError("Couldn't undo all of that. Remove the extra items by hand.");
          }
          setRecentKey((k) => k + 1);
        },
      });
      return true;
    },
    [repeat, restore, showToast],
  );

  const updateEntry = useCallback(
    async (entry: LogEntry, change: EntryChange) => {
      try {
        const res = await apiFetch(`/api/log/${entry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change),
        });
        if (!res.ok) throw new Error();
        const { entry: updated } = (await res.json()) as { entry: LogEntry };
        setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
        setError(null);
        setRecentKey((k) => k + 1);
        showToast(change.meal && change.meal !== entry.meal ? `Moved ${entry.name} to ${MEAL_LABELS[change.meal].toLowerCase()}` : `Updated ${entry.name}`);
        return true;
      } catch {
        setError(`Couldn't update ${entry.name}. Try again.`);
        return false;
      }
    },
    [showToast],
  );

  const removeEntry = useCallback(
    (entry: LogEntry) => {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      const timer = setTimeout(async () => {
        pendingDeletes.current.delete(entry.id);
        try {
          const res = await apiFetch(`/api/log/${entry.id}`, { method: "DELETE" });
          if (!res.ok && res.status !== 404) throw new Error();
        } catch {
          restore(entry);
          setError(`Couldn't remove ${entry.name}. Try again.`);
        }
      }, TOAST_MS);
      pendingDeletes.current.set(entry.id, timer);
      showToast(`Removed ${entry.name}`, {
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

  const changeGoal = useCallback(
    async (calorieGoal: number) => {
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calorieGoal }),
      });
      if (!res.ok) throw new Error("save failed");
      const { settings } = (await res.json()) as { settings: { calorieGoal: number } };
      setGoal(settings.calorieGoal);
      showToast("Daily goal updated");
    },
    [showToast],
  );

  // A meal's "+" button: preselect that meal and bring the add panel into view.
  const addToMeal = useCallback((m: Meal) => {
    setMeal(m);
    const panel = addPanelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    if (rect.top < 120 || rect.top > window.innerHeight * 0.6) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("food-search")?.focus({ preventScroll: true });
  }, []);

  if (!date) return null;

  return (
    <div className="space-y-5 sm:space-y-6">
      <DateNav date={date} onChange={setDate} />
      {loadFailed && (
        <Notice tone="error" action={{ label: "Retry", onClick: () => setReloadKey((k) => k + 1) }}>
          Couldn&apos;t load this day&apos;s log. Check that the app is still running, then retry.
        </Notice>
      )}
      {/* A day that didn't load shows no numbers (zeros would be a false claim about it). Hidden,
          not unmounted, so the add panel keeps any half-done search or AI review. */}
      <div hidden={loadFailed} className="space-y-5 sm:space-y-6">
        <DailySummary
          entries={entries}
          goal={goal}
          loading={loading}
          onGoalChange={changeGoal}
          date={date}
          burned={burned}
          water={date && <WaterCard date={date} target={waterTarget} onToast={showToast} />}
        />
        {error && (
          <Notice tone="error" action={{ label: "Dismiss", onClick: () => setError(null) }}>
            {error}
          </Notice>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* The day comes first on every screen size; each meal's "Add" button brings the panel into view. */}
          <FoodLog
            entries={entries}
            loading={loading}
            onRemove={removeEntry}
            onAddToMeal={addToMeal}
            onUpdate={updateEntry}
            previous={previous}
            onCopyMeal={copyMeal}
          />
          <div className="lg:sticky lg:top-24">
            <AddFoodPanel
              ref={addPanelRef}
              meal={meal}
              onMealChange={setMeal}
              onAddFood={addFood}
              onLogItems={logItems}
              onAddAgain={addAgain}
              onToast={showToast}
              recentKey={recentKey}
              hasHistory={hasHistory}
            />
          </div>
        </div>
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
