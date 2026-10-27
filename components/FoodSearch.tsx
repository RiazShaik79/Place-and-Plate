"use client";

import { useState } from "react";
import { MEAL_LABELS, type Food, type Meal } from "@/lib/types";
import { searchFoods } from "@/lib/foods";
import { fmt } from "@/lib/nutrition";
import MacroInline from "./MacroInline";
import { Search } from "./Icons";
import ServingsStepper, { validServings } from "./ServingsStepper";
import Spinner from "./Spinner";

interface Props {
  meal: Meal;
  onAdd: (food: Food, servings: number) => Promise<void>;
  onDescribe: () => void;
}

/** Quick add: search the catalogue; picking a food opens a servings stepper for it. */
export default function FoodSearch({ meal, onAdd, onDescribe }: Props) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const results = searchFoods(query);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-faint" />
        <input
          id="food-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 30 common foods"
          className="h-11 w-full rounded-full border border-line bg-sunken pr-4 pl-10 outline-none transition-colors placeholder:text-faint focus:border-basil focus:bg-surface focus:ring-2 focus:ring-basil/20"
          aria-label="Search foods"
          autoComplete="off"
        />
      </div>

      <ul className="-mx-2 mt-3 max-h-[22rem] overflow-y-auto overscroll-contain px-2 lg:max-h-[26rem]">
        {results.map((food) => (
          <FoodRow
            key={food.id}
            food={food}
            meal={meal}
            open={openId === food.id}
            onToggle={() => setOpenId(openId === food.id ? null : food.id)}
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

function FoodRow({
  food,
  meal,
  open,
  onToggle,
  onAdd,
}: {
  food: Food;
  meal: Meal;
  open: boolean;
  onToggle: () => void;
  onAdd: Props["onAdd"];
}) {
  const [servings, setServings] = useState(1);
  const [busy, setBusy] = useState(false);
  const valid = validServings(servings);

  async function handleAdd() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onAdd(food, servings);
      setServings(1);
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
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{food.name}</span>
          <span className="block text-[13px] text-muted">{food.servingSize}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {/* While open, show the total for the chosen servings so the button text can stay short. */}
          {open && valid ? fmt(food.calories * servings) : food.calories} <span className="font-normal text-muted">kcal</span>
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          <div className="mb-3 text-[13px] text-muted">
            <MacroInline protein={food.protein} carbs={food.carbs} fat={food.fat} />
          </div>
          <div className="flex items-center gap-2">
            <ServingsStepper value={servings} onChange={setServings} onEnter={handleAdd} label={`Servings of ${food.name}`} />
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
