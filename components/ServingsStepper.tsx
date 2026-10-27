import { MAX_SERVINGS } from "@/lib/foods";
import { Minus, Plus } from "./Icons";

export const MIN_SERVINGS = 0.25;
export const validServings = (s: number) => Number.isFinite(s) && s > 0 && s <= MAX_SERVINGS;

/** − [n] + in half steps (snapped to quarters), used wherever a serving count is chosen. */
export default function ServingsStepper({
  value,
  onChange,
  onEnter,
  label,
}: {
  value: number;
  onChange: (servings: number) => void;
  onEnter?: () => void;
  label: string; // accessible name for the number field, e.g. "Servings of Oatmeal"
}) {
  const step = (delta: number) => onChange(Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round((value + delta) * 4) / 4)));
  return (
    <div className="flex h-10 shrink-0 items-center rounded-full border border-line bg-surface">
      <button
        type="button"
        onClick={() => step(-0.5)}
        disabled={value <= MIN_SERVINGS}
        aria-label="Fewer servings"
        className="grid h-10 w-10 place-items-center rounded-full text-muted hover:text-ink disabled:opacity-30"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        inputMode="decimal"
        min={MIN_SERVINGS}
        max={MAX_SERVINGS}
        step="0.25"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className="w-10 bg-transparent text-center font-semibold tabular-nums outline-none"
        aria-label={label}
      />
      <button
        type="button"
        onClick={() => step(0.5)}
        disabled={value >= MAX_SERVINGS}
        aria-label="More servings"
        className="grid h-10 w-10 place-items-center rounded-full text-muted hover:text-ink disabled:opacity-30"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
