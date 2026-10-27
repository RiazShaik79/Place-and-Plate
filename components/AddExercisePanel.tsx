"use client";

import { useState } from "react";
import type { AiSource, Exercise, ExerciseItem } from "@/lib/types";
import ExerciseSearch from "./ExerciseSearch";
import ExerciseTextLookup from "./ExerciseTextLookup";
import { Search, Sparkle } from "./Icons";

type Tab = "search" | "text";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "search", label: "Search", icon: <Search className="h-4 w-4" /> },
  { id: "text", label: "Describe", icon: <Sparkle className="h-4 w-4" /> },
];

interface Props {
  weightKg: number;
  onAdd: (exercise: Exercise, minutes: number) => Promise<void>;
  onLogItems: (items: ExerciseItem[], source: AiSource) => Promise<void>;
  ref?: React.Ref<HTMLElement>;
}

/**
 * The two ways to log exercise: pick from the list, or describe it for an AI estimate.
 * Panels stay mounted so switching tabs keeps in-progress work.
 */
export default function AddExercisePanel({ weightKg, onAdd, onLogItems, ref }: Props) {
  const [tab, setTab] = useState<Tab>("search");

  return (
    <section ref={ref} aria-labelledby="add-exercise-heading" className="scroll-mt-32 rounded-panel bg-surface p-4 ring-1 ring-line sm:p-6 md:scroll-mt-24">
      <h2 id="add-exercise-heading" className="text-lg font-bold">
        Add exercise
      </h2>

      <div role="tablist" aria-label="How to add exercise" className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-sunken p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`ex-tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`ex-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t.id ? "bg-surface text-ink shadow-[0_1px_3px_rgba(26,36,32,0.12)]" : "text-muted hover:text-ink"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <div role="tabpanel" id="ex-panel-search" aria-labelledby="ex-tab-search" hidden={tab !== "search"}>
          <ExerciseSearch weightKg={weightKg} onAdd={onAdd} onDescribe={() => setTab("text")} />
        </div>
        <div role="tabpanel" id="ex-panel-text" aria-labelledby="ex-tab-text" hidden={tab !== "text"}>
          <ExerciseTextLookup onLog={(items) => onLogItems(items, "text")} />
        </div>
      </div>
    </section>
  );
}
