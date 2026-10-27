"use client";

import { useState } from "react";
import { MEAL_LABELS, MEALS, type AiSource, type Food, type Meal, type NutritionItem } from "@/lib/types";
import FoodSearch from "./FoodSearch";
import AiTextLookup from "./AiTextLookup";
import AiPhotoLookup from "./AiPhotoLookup";
import RecentFoods, { type AgainSource } from "./RecentFoods";
import { MealIcon } from "./Icons";

type Tab = "recent" | "quick" | "text" | "photo";

// Text only: four labels with icons don't fit a quarter of the 400px side panel.
const TABS: { id: Tab; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "quick", label: "Search" },
  { id: "text", label: "Describe" },
  { id: "photo", label: "Photo" },
];

interface Props {
  meal: Meal;
  onMealChange: (meal: Meal) => void;
  onAddFood: (food: Food, servings: number) => Promise<void>;
  onLogItems: (items: NutritionItem[], source: AiSource) => Promise<void>;
  onAddAgain: (source: AgainSource, servings: number, name: string) => Promise<boolean>;
  onToast: (text: string) => void;
  recentKey: number;
  hasHistory: boolean; // start on Recent once there's anything to repeat
  ref?: React.Ref<HTMLElement>;
}

/** Meal picker + the four ways to add food. Panels stay mounted so switching tabs keeps in-progress work. */
export default function AddFoodPanel({ meal, onMealChange, onAddFood, onLogItems, onAddAgain, onToast, recentKey, hasHistory, ref }: Props) {
  const [tab, setTab] = useState<Tab>(hasHistory ? "recent" : "quick");

  return (
    <section
      ref={ref}
      aria-labelledby="add-food-heading"
      className="scroll-mt-32 md:scroll-mt-24 rounded-panel bg-surface p-4 ring-1 ring-line sm:p-6"
    >
      <h2 id="add-food-heading" className="text-lg font-bold">
        Add food
      </h2>

      <fieldset className="mt-3">
        <legend className="mb-2 text-sm text-muted">Log it under</legend>
        <div className="grid grid-cols-4 gap-1.5">
          {MEALS.map((m) => {
            const active = m === meal;
            return (
              <label
                key={m}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-card border py-2 text-[13px] font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-basil ${
                  active ? "border-basil bg-basil-soft text-basil" : "border-line text-muted hover:border-[#cbd5cd] hover:text-ink"
                }`}
              >
                <input type="radio" name="meal" value={m} checked={active} onChange={() => onMealChange(m)} className="sr-only" />
                <MealIcon meal={m} className="h-[18px] w-[18px]" />
                {MEAL_LABELS[m]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div role="tablist" aria-label="How to add food" className="mt-5 grid grid-cols-4 gap-1 rounded-full bg-sunken p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-1 py-2 text-sm font-semibold transition-colors ${
              tab === t.id ? "bg-surface text-ink shadow-[0_1px_3px_rgba(26,36,32,0.12)]" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <div role="tabpanel" id="panel-recent" aria-labelledby="tab-recent" hidden={tab !== "recent"}>
          <RecentFoods meal={meal} refreshKey={recentKey} onAddAgain={onAddAgain} onToast={onToast} />
        </div>
        <div role="tabpanel" id="panel-quick" aria-labelledby="tab-quick" hidden={tab !== "quick"}>
          <FoodSearch meal={meal} onAdd={onAddFood} onDescribe={() => setTab("text")} />
        </div>
        <div role="tabpanel" id="panel-text" aria-labelledby="tab-text" hidden={tab !== "text"}>
          <AiTextLookup meal={meal} onLog={(items) => onLogItems(items, "text")} />
        </div>
        <div role="tabpanel" id="panel-photo" aria-labelledby="tab-photo" hidden={tab !== "photo"}>
          <AiPhotoLookup meal={meal} onLog={(items) => onLogItems(items, "photo")} />
        </div>
      </div>
    </section>
  );
}
