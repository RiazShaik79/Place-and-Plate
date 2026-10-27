import { formatDateLabel, formatLongDate, shiftDate, todayISO } from "@/lib/nutrition";
import { ChevronLeft, ChevronRight } from "./Icons";

interface Props {
  date: string;
  onChange: (date: string) => void;
}

/** The viewed day as a page heading, with previous / next / back-to-today controls. */
export default function DateNav({ date, onChange }: Props) {
  const isToday = date === todayISO();
  const label = formatDateLabel(date);
  const arrow =
    "grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">{label}</h1>
        {/* The header already shows today's date; "Yesterday" gets its date underneath. */}
        {label === "Yesterday" && <p className="text-sm text-muted">{formatLongDate(date)}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!isToday && (
          <button
            onClick={() => onChange(todayISO())}
            className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-basil transition-colors hover:bg-basil-soft"
          >
            Jump to today
          </button>
        )}
        <nav aria-label="Change day" className="flex items-center rounded-full border border-line bg-surface p-0.5">
          <button className={arrow} onClick={() => onChange(shiftDate(date, -1))} aria-label="Previous day">
            <ChevronLeft />
          </button>
          <button className={arrow} onClick={() => onChange(shiftDate(date, 1))} disabled={isToday} aria-label="Next day">
            <ChevronRight />
          </button>
        </nav>
      </div>
    </div>
  );
}
