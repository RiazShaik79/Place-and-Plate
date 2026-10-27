"use client";

import { useState } from "react";
import { MEAL_LABELS, MEALS, type LogEntry, type Meal } from "@/lib/types";
import { fmt, fmtKcal, sumTotals } from "@/lib/nutrition";
import { MealIcon, Plus, Sparkle, Trash } from "./Icons";
import MacroInline from "./MacroInline";
import ServingsStepper, { validServings } from "./ServingsStepper";
import Spinner from "./Spinner";

export interface EntryChange {
  servings?: number;
  meal?: Meal;
}

interface Props {
  entries: LogEntry[];
  loading: boolean;
  onRemove: (entry: LogEntry) => void;
  onAddToMeal: (meal: Meal) => void;
  onUpdate: (entry: LogEntry, change: EntryChange) => Promise<boolean>;
  previous: { label: string; entries: LogEntry[] } | null; // the day before, for "Same as yesterday"
  onCopyMeal: (meal: Meal, from: LogEntry[]) => Promise<boolean>;
}

/** The day's entries grouped by meal. Every meal is always shown so the day has a fixed shape. */
export default function FoodLog({ entries, loading, onRemove, onAddToMeal, onUpdate, previous, onCopyMeal }: Props) {
  return (
    <section aria-labelledby="food-log-heading" className="rounded-panel bg-surface p-4 ring-1 ring-line sm:p-6">
      <h2 id="food-log-heading" className="sr-only">
        Food log
      </h2>
      <div className="divide-y divide-line">
        {MEALS.map((meal) => (
          <MealGroup
            key={meal}
            meal={meal}
            entries={entries.filter((e) => e.meal === meal)}
            loading={loading}
            onRemove={onRemove}
            onUpdate={onUpdate}
            onAdd={() => onAddToMeal(meal)}
            previous={previous && { label: previous.label, entries: previous.entries.filter((e) => e.meal === meal) }}
            onCopy={(from) => onCopyMeal(meal, from)}
          />
        ))}
      </div>
    </section>
  );
}

function MealGroup({
  meal,
  entries,
  loading,
  onRemove,
  onUpdate,
  onAdd,
  previous,
  onCopy,
}: {
  meal: Meal;
  entries: LogEntry[];
  loading: boolean;
  onRemove: Props["onRemove"];
  onUpdate: Props["onUpdate"];
  onAdd: () => void;
  previous: { label: string; entries: LogEntry[] } | null;
  onCopy: (from: LogEntry[]) => Promise<boolean>;
}) {
  const total = sumTotals(entries).calories;
  const label = MEAL_LABELS[meal];
  const canCopy = !loading && entries.length === 0 && previous !== null && previous.entries.length > 0;

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-basil">
          <MealIcon meal={meal} className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold">{label}</h3>
          {!loading && (
            <p className="text-sm text-muted">
              {entries.length === 0 ? "Nothing logged yet" : `${entries.length} ${entries.length === 1 ? "item" : "items"}`}
            </p>
          )}
        </div>
        {!loading && total > 0 && (
          <span className="text-sm font-bold tabular-nums">
            {fmtKcal(total)} <span className="font-medium text-muted">kcal</span>
          </span>
        )}
        <button
          onClick={onAdd}
          aria-label={`Add food to ${label.toLowerCase()}`}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-line px-3 text-sm font-semibold text-basil transition-colors hover:border-basil/40 hover:bg-basil-soft"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {loading ? (
        <div className="mt-3 h-16 animate-shimmer rounded-card bg-sunken" aria-hidden="true" />
      ) : entries.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} onRemove={onRemove} onUpdate={onUpdate} />
          ))}
        </ul>
      ) : (
        canCopy && <CopyMeal meal={meal} label={previous!.label} from={previous!.entries} onCopy={onCopy} />
      )}
    </div>
  );
}

/** "Same as yesterday": shows what that meal was, then adds it all after one confirm. */
function CopyMeal({ meal, label, from, onCopy }: { meal: Meal; label: string; from: LogEntry[]; onCopy: (from: LogEntry[]) => Promise<boolean> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const kcal = sumTotals(from).calories;
  const count = `${from.length} ${from.length === 1 ? "item" : "items"}`;

  async function copy() {
    setBusy(true);
    try {
      if (await onCopy(from)) setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mt-3 flex w-full items-center justify-between gap-3 rounded-card border border-dashed border-line px-4 py-2.5 text-left text-sm transition-colors hover:border-basil/40 hover:bg-basil-soft/50"
      >
        <span className="font-semibold text-basil">Same as {label}</span>
        <span className="text-muted tabular-nums">
          {count}, {fmtKcal(kcal)} kcal
        </span>
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-card bg-sunken px-4 py-3">
      <p className="text-sm font-semibold">
        {MEAL_LABELS[meal]} from {label}
      </p>
      <ul className="mt-1.5 space-y-0.5 text-sm text-muted">
        {from.map((e) => (
          <li key={e.id} className="flex justify-between gap-3">
            <span className="truncate">{e.name}</span>
            <span className="shrink-0 tabular-nums">{fmtKcal(e.calories)} kcal</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={copy}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-basil px-4 text-sm font-semibold text-white transition-colors hover:bg-basil-dark disabled:opacity-60"
        >
          {busy && <Spinner className="h-4 w-4" />}
          Add {count}
        </button>
        <button onClick={() => setConfirming(false)} className="h-9 rounded-full px-3 text-sm font-semibold text-muted hover:bg-surface">
          Cancel
        </button>
      </div>
    </div>
  );
}

function EntryCard({ entry: e, onRemove, onUpdate }: { entry: LogEntry; onRemove: Props["onRemove"]; onUpdate: Props["onUpdate"] }) {
  const [editing, setEditing] = useState(false);
  // AI entries have food_id "ai:text" / "ai:photo" and store their portion in servingSize.
  const isAi = e.foodId.startsWith("ai:");
  const isPhoto = e.foodId === "ai:photo";
  const amount = e.servings === 1 ? e.servingSize : `${fmt(e.servings)} × ${e.servingSize}`;

  return (
    <li className={`group rounded-card border bg-surface transition-colors ${editing ? "border-basil/40" : "border-line hover:border-[#cbd5cd]"}`}>
      <div className="flex items-center gap-1 py-1 pr-2 pl-1">
        <button
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          aria-label={`${e.name}, ${fmtKcal(e.calories)} kcal. Edit servings or meal`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] py-2 pr-1 pl-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-start gap-2">
              <span className="line-clamp-2 font-semibold break-words">{e.name}</span>
              {isAi && (
                <span
                  className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-ai-soft px-2 py-0.5 text-xs font-semibold text-ai"
                  title={isPhoto ? "Estimated by AI from a photo" : "Estimated by AI from a description"}
                >
                  <Sparkle className="h-3 w-3" />
                  {isPhoto ? "Photo" : "AI"}
                </span>
              )}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted">
              <span className="truncate">{amount}</span>
              <MacroInline protein={e.protein} carbs={e.carbs} fat={e.fat} />
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-bold tabular-nums">{fmtKcal(e.calories)}</span>
            <span className="block text-xs text-muted">kcal</span>
          </span>
        </button>
        <button
          onClick={() => onRemove(e)}
          aria-label={`Remove ${e.name}`}
          title="Remove"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-faint transition hover:bg-over-soft hover:text-over focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
        >
          <Trash className="h-[18px] w-[18px]" />
        </button>
      </div>
      {editing && <EntryEditor entry={e} onDone={() => setEditing(false)} onUpdate={onUpdate} />}
    </li>
  );
}

function EntryEditor({ entry: e, onDone, onUpdate }: { entry: LogEntry; onDone: () => void; onUpdate: Props["onUpdate"] }) {
  const [servings, setServings] = useState(e.servings);
  const [meal, setMeal] = useState<Meal>(e.meal);
  const [busy, setBusy] = useState(false);
  const valid = validServings(servings);
  const perServing = e.servings > 0 ? e.calories / e.servings : e.calories;
  const changed = servings !== e.servings || meal !== e.meal;

  async function save() {
    if (!valid || !changed || busy) return;
    setBusy(true);
    try {
      const change: EntryChange = {};
      if (servings !== e.servings) change.servings = servings;
      if (meal !== e.meal) change.meal = meal;
      if (await onUpdate(e, change)) onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-line px-4 pt-3 pb-3.5">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-muted">Servings of {e.servingSize}</p>
          <ServingsStepper value={servings} onChange={setServings} onEnter={save} label={`Servings of ${e.name}`} />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-muted">Meal</span>
          <select
            value={meal}
            onChange={(ev) => setMeal(ev.target.value as Meal)}
            className="h-10 rounded-full border border-line bg-surface pr-8 pl-4 text-sm font-semibold outline-none focus:border-basil focus:ring-2 focus:ring-basil/20"
          >
            {MEALS.map((m) => (
              <option key={m} value={m}>
                {MEAL_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <p className="pb-2.5 text-sm text-muted tabular-nums" aria-live="polite">
          {valid ? (
            <>
              <span className="font-bold text-ink">{fmtKcal(perServing * servings)}</span> kcal
            </>
          ) : (
            "Enter 0.25 to 100 servings"
          )}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={!valid || !changed || busy}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-basil px-4 text-sm font-semibold text-white transition-colors hover:bg-basil-dark disabled:opacity-50"
        >
          {busy && <Spinner className="h-4 w-4" />}
          Save changes
        </button>
        <button onClick={onDone} className="h-9 rounded-full px-3 text-sm font-semibold text-muted hover:bg-sunken">
          Cancel
        </button>
      </div>
    </div>
  );
}
