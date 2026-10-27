import { fmt } from "@/lib/nutrition";

const MACROS = [
  { key: "protein", dot: "bg-protein" },
  { key: "carbs", dot: "bg-carbs" },
  { key: "fat", dot: "bg-fat" },
] as const;

/** Compact protein / carbs / fat grams with colour dots matching the summary legend. */
export default function MacroInline(props: { protein: number; carbs: number; fat: number }) {
  return (
    <span className="flex items-center gap-2.5 tabular-nums">
      {MACROS.map((m) => (
        <span key={m.key} className="flex items-center gap-1" title={`${fmt(props[m.key])} g ${m.key}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} aria-hidden="true" />
          {fmt(props[m.key])}g<span className="sr-only"> {m.key}</span>
        </span>
      ))}
    </span>
  );
}
