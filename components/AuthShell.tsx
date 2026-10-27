import { MEAL_LABELS, type Meal } from "@/lib/types";
import { Logo, MealIcon, Sparkle } from "./Icons";
import { APP_NAME } from "@/lib/brand";

/**
 * Layout for the sign-in and create-account pages: the form on the left, and on wide screens a
 * preview of a logged day on the right, so a first-time visitor sees what they're signing up for.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-10 sm:py-8">
        <a href="/" className="flex w-fit items-center gap-2.5 rounded-lg">
          <Logo className="h-8 w-8" />
          <span className="text-[17px] font-bold tracking-tight">{APP_NAME}</span>
        </a>
        {/* Top-aligned on phones (closer to the thumb and clear of the keyboard), centred on larger screens. */}
        <main className="flex flex-1 items-start pt-12 pb-10 sm:items-center sm:py-14">
          <div className="mx-auto w-full max-w-[400px]">{children}</div>
        </main>
        <p className="text-center text-[13px] text-faint lg:text-left">
          Your log is private to your account: only you can see it.
        </p>
      </div>
      <DayPreview />
    </div>
  );
}

// A sample day: 1,460 of 2,000 kcal across three meals.
const SAMPLE: { meal: Meal; kcal: number }[] = [
  { meal: "breakfast", kcal: 420 },
  { meal: "lunch", kcal: 610 },
  { meal: "snack", kcal: 430 },
];
const SAMPLE_GOAL = 2000;
const SAMPLE_ENTRIES = [
  { name: "Greek yogurt with berries", amount: "1 bowl", kcal: 240, ai: false },
  { name: "Chicken burrito bowl", amount: "1 large bowl", kcal: 610, ai: true },
  { name: "Banana", amount: "1 medium", kcal: 105, ai: false },
];

function DayPreview() {
  const eaten = SAMPLE.reduce((s, m) => s + m.kcal, 0);
  return (
    <aside
      aria-label={`What your day looks like in ${APP_NAME}`}
      className="relative hidden overflow-hidden bg-basil lg:flex lg:flex-col lg:justify-center lg:px-14 xl:px-20"
    >
      <div className="mx-auto w-full max-w-[460px]">
        <p className="text-[28px] leading-tight font-bold tracking-tight text-white xl:text-[32px]">
          See where your calories come from and where they go.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-white/75">
          Search or describe what you ate and how you moved, or snap a photo of your plate. Every meal fills its own part of the bar.
        </p>

        <div className="mt-10 rounded-panel bg-surface p-6 shadow-[0_24px_60px_rgba(10,30,20,0.35)]" aria-hidden="true">
          <p className="text-sm font-semibold text-muted">Today</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-[44px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
              {(SAMPLE_GOAL - eaten).toLocaleString("en-US")}
            </span>
            <span className="font-semibold text-muted">kcal left</span>
          </p>
          <div className="mt-5 flex h-3 gap-[3px] overflow-hidden rounded-full bg-sunken">
            {SAMPLE.map((m) => (
              <div
                key={m.meal}
                className="h-full bg-ok first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(m.kcal / SAMPLE_GOAL) * 100}%` }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            {SAMPLE.map((m) => (
              <li key={m.meal} className="flex items-center gap-1.5">
                <MealIcon meal={m.meal} className="h-4 w-4 text-faint" />
                {MEAL_LABELS[m.meal]}
                <span className="font-semibold text-ink tabular-nums">{m.kcal}</span>
              </li>
            ))}
          </ul>
          <ul className="mt-5 space-y-2">
            {SAMPLE_ENTRIES.map((e) => (
              <li key={e.name} className="flex items-center gap-3 rounded-card border border-line px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="truncate">{e.name}</span>
                    {e.ai && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ai-soft px-2 py-0.5 text-xs font-semibold text-ai">
                        <Sparkle className="h-3 w-3" />
                        AI
                      </span>
                    )}
                  </span>
                  <span className="block text-[13px] text-muted">{e.amount}</span>
                </span>
                <span className="text-right font-bold tabular-nums">
                  {e.kcal} <span className="text-xs font-medium text-muted">kcal</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
