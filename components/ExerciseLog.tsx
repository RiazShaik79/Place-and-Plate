import { CATEGORY_LABELS, type ExerciseEntry } from "@/lib/types";
import { formatMinutes } from "@/lib/exercises";
import { fmtKcal } from "@/lib/nutrition";
import IntensityMeter from "./IntensityMeter";
import { CategoryIcon, Plus, Runner, Sparkle, Trash } from "./Icons";

interface Props {
  entries: ExerciseEntry[];
  loading: boolean;
  onRemove: (entry: ExerciseEntry) => void;
  onAdd: () => void;
}

/** The day's sessions as cards, in the order they were logged. */
export default function ExerciseLog({ entries, loading, onRemove, onAdd }: Props) {
  return (
    <section aria-labelledby="exercise-log-heading" className="rounded-panel bg-surface p-4 ring-1 ring-line sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="exercise-log-heading" className="text-lg font-bold">
          Sessions
        </h2>
        {!loading && entries.length > 0 && (
          <button
            onClick={onAdd}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-line px-3 text-sm font-semibold text-basil transition-colors hover:border-basil/40 hover:bg-basil-soft"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-4 space-y-2" aria-hidden="true">
          <div className="h-16 animate-shimmer rounded-card bg-sunken" />
          <div className="h-16 animate-shimmer rounded-card bg-sunken" />
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-4 flex flex-col items-center rounded-card bg-sunken/70 px-6 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-surface text-basil ring-1 ring-line">
            <Runner className="h-6 w-6" />
          </span>
          <p className="mt-3 font-semibold">Nothing logged for this day</p>
          <p className="mt-1 max-w-xs text-sm text-muted">Walks, workouts and games all count. Pick an activity or describe it in your own words.</p>
          <button
            onClick={onAdd}
            className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-full bg-basil px-4 text-sm font-semibold text-white transition-colors hover:bg-basil-dark"
          >
            <Plus className="h-4 w-4" />
            Add exercise
          </button>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {entries.map((e) => (
            <SessionCard key={e.id} entry={e} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionCard({ entry: e, onRemove }: { entry: ExerciseEntry; onRemove: Props["onRemove"] }) {
  const isAi = e.source.startsWith("ai:");
  const isPhoto = e.source === "ai:photo";
  return (
    <li className="group flex items-center gap-3 rounded-card border border-line bg-surface py-3 pr-2 pl-3 transition-colors hover:border-[#cbd5cd] sm:pl-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunken text-basil" title={CATEGORY_LABELS[e.category]}>
        <CategoryIcon category={e.category} className="h-5 w-5" />
        <span className="sr-only">{CATEGORY_LABELS[e.category]}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-start gap-2">
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
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted">
          <span>{formatMinutes(e.minutes)}</span>
          <IntensityMeter intensity={e.intensity} />
        </div>
      </div>
      <span className="shrink-0 text-right">
        <span className="block font-bold tabular-nums">{fmtKcal(e.calories)}</span>
        <span className="block text-xs text-muted">kcal</span>
      </span>
      <button
        onClick={() => onRemove(e)}
        aria-label={`Remove ${e.name}`}
        title="Remove"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-faint transition hover:bg-over-soft hover:text-over focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
      >
        <Trash className="h-[18px] w-[18px]" />
      </button>
    </li>
  );
}
