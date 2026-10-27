"use client";

import { useEffect, useState } from "react";
import { MEAL_LABELS, type FavoriteFood, type Meal, type RecentFood } from "@/lib/types";
import { apiFetch } from "@/lib/client";
import { fmt, fmtKcal, todayISO } from "@/lib/nutrition";
import MacroInline from "./MacroInline";
import ServingsStepper, { validServings } from "./ServingsStepper";
import { Star } from "./Icons";
import Spinner from "./Spinner";

/** What "add again" copies from: one of the user's past entries, or a favourite. */
export type AgainSource = { entryId: number } | { favoriteId: number };

interface Props {
  meal: Meal;
  refreshKey: number; // bumps after every add, so the list stays current
  onAddAgain: (source: AgainSource, servings: number, name: string) => Promise<boolean>;
  onToast: (text: string) => void;
}

interface Row {
  key: string;
  source: AgainSource;
  name: string;
  servingSize: string;
  calories: number; // one serving
  protein: number;
  carbs: number;
  fat: number;
  servings: number; // stepper start
  note?: string; // "usually 1.5"
  favoriteId: number | null;
  entryId: number | null; // needed to star a recent food
}

const fromRecent = (r: RecentFood): Row => ({
  key: r.key,
  source: { entryId: r.entryId },
  name: r.name,
  servingSize: r.servingSize,
  calories: r.calories,
  protein: r.protein,
  carbs: r.carbs,
  fat: r.fat,
  servings: r.lastServings,
  note: r.uses >= 3 && r.lastServings !== 1 ? `usually ${fmt(r.lastServings)}` : undefined,
  favoriteId: r.favoriteId,
  entryId: r.entryId,
});

const fromFavorite = (f: FavoriteFood): Row => ({ ...f, key: f.key, source: { favoriteId: f.id }, servings: 1, favoriteId: f.id, entryId: null });

/** Favourites, then foods logged in the last 60 days: tap one to add it again at a chosen serving. */
export default function RecentFoods({ meal, refreshKey, onAddAgain, onToast }: Props) {
  const [data, setData] = useState<{ recent: RecentFood[]; favorites: FavoriteFood[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [starring, setStarring] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/log/recent?today=${todayISO()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [refreshKey, reload]);

  async function toggleStar(row: Row) {
    if (starring) return;
    setStarring(row.key);
    try {
      const res =
        row.favoriteId !== null
          ? await apiFetch(`/api/favorites/${row.favoriteId}`, { method: "DELETE" })
          : await apiFetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId: row.entryId }) });
      if (!res.ok && res.status !== 404) throw new Error();
      onToast(row.favoriteId !== null ? `Removed ${row.name} from favourites` : `Added ${row.name} to favourites`);
      setReload((k) => k + 1);
    } catch {
      onToast(`Couldn't update favourites. Try again.`);
    } finally {
      setStarring(null);
    }
  }

  if (failed) {
    return (
      <div className="rounded-card bg-sunken px-4 py-6 text-center text-sm text-muted">
        <p>Couldn&apos;t load your recent foods.</p>
        <button onClick={() => setReload((k) => k + 1)} className="mt-2 font-semibold text-basil hover:underline">
          Retry
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-shimmer rounded-card bg-sunken" />
        ))}
      </div>
    );
  }

  const favorites = data.favorites.map(fromFavorite);
  // A starred food appears once, under Favourites.
  const recent = data.recent.filter((r) => r.favoriteId === null).map(fromRecent);
  if (favorites.length === 0 && recent.length === 0) {
    return (
      <p className="rounded-card bg-sunken px-4 py-6 text-center text-sm text-muted">
        Foods you log show up here, so you can add them again in one tap.
      </p>
    );
  }

  const list = (rows: Row[]) =>
    rows.map((row) => (
      <AgainRow
        key={row.key}
        row={row}
        meal={meal}
        open={openKey === row.key}
        onToggle={() => setOpenKey(openKey === row.key ? null : row.key)}
        onAdd={async (servings) => {
          if (await onAddAgain(row.source, servings, row.name)) setOpenKey(null);
        }}
        onStar={() => toggleStar(row)}
        starBusy={starring === row.key}
      />
    ));

  return (
    <div className="-mx-2 max-h-[26rem] space-y-4 overflow-y-auto overscroll-contain px-2 lg:max-h-[30rem]">
      {favorites.length > 0 && (
        <section aria-labelledby="fav-heading">
          <h3 id="fav-heading" className="mb-1 px-3 text-sm font-semibold text-muted">
            Favourites
          </h3>
          <ul>{list(favorites)}</ul>
        </section>
      )}
      {recent.length > 0 &&
        (favorites.length > 0 ? (
          <section aria-labelledby="recent-heading">
            <h3 id="recent-heading" className="mb-1 px-3 text-sm font-semibold text-muted">
              Recent
            </h3>
            <ul>{list(recent)}</ul>
          </section>
        ) : (
          // Alone, a "Recent" heading would only repeat the tab's name.
          <ul aria-label="Recent foods">{list(recent)}</ul>
        ))}
    </div>
  );
}

function AgainRow({
  row,
  meal,
  open,
  onToggle,
  onAdd,
  onStar,
  starBusy,
}: {
  row: Row;
  meal: Meal;
  open: boolean;
  onToggle: () => void;
  onAdd: (servings: number) => Promise<void>;
  onStar: () => void;
  starBusy: boolean;
}) {
  const [servings, setServings] = useState(row.servings);
  const [busy, setBusy] = useState(false);
  const valid = validServings(servings);
  const starred = row.favoriteId !== null;

  // Re-open at the usual serving.
  useEffect(() => {
    if (open) setServings(row.servings);
  }, [open, row.servings]);

  async function handleAdd() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onAdd(servings);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`rounded-card transition-colors ${open ? "bg-sunken" : ""}`}>
      <div className="flex items-center">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-card py-2.5 pr-2 pl-3 text-left ${open ? "" : "hover:bg-sunken/70"}`}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{row.name}</span>
            <span className="block truncate text-[13px] text-muted">
              {row.servingSize}
              {row.note && <>, {row.note}</>}
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {fmtKcal(open && valid ? row.calories * servings : row.calories)} <span className="font-normal text-muted">kcal</span>
          </span>
        </button>
        <button
          onClick={onStar}
          disabled={starBusy || (!starred && row.entryId === null)}
          aria-pressed={starred}
          aria-label={starred ? `Remove ${row.name} from favourites` : `Add ${row.name} to favourites`}
          title={starred ? "Remove from favourites" : "Add to favourites"}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-sunken disabled:opacity-50 ${starred ? "text-basil" : "text-faint hover:text-ink"}`}
        >
          {starBusy ? <Spinner className="h-4 w-4" /> : <Star filled={starred} className="h-[18px] w-[18px]" />}
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3">
          <div className="mb-3 text-[13px] text-muted">
            <MacroInline protein={row.protein} carbs={row.carbs} fat={row.fat} />
          </div>
          <div className="flex items-center gap-2">
            <ServingsStepper value={servings} onChange={setServings} onEnter={handleAdd} label={`Servings of ${row.name}`} />
            <button
              onClick={handleAdd}
              disabled={!valid || busy}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-basil px-4 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-basil-dark disabled:opacity-50"
            >
              {busy && <Spinner className="h-4 w-4" />}
              Add to {MEAL_LABELS[meal].toLowerCase()}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
