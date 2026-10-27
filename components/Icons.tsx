// Small inline icon set (24px grid, stroke = currentColor) so we don't need an icon package.
import type { ExerciseCategory, Meal } from "@/lib/types";

type IconProps = { className?: string };

function Svg({ className = "h-5 w-5", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const ChevronLeft = (p: IconProps) => <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>;
export const ChevronRight = (p: IconProps) => <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>;
export const Plus = (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const Minus = (p: IconProps) => <Svg {...p}><path d="M5 12h14" /></Svg>;
export const Close = (p: IconProps) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const Check = (p: IconProps) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const Pencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
);
export const Trash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Svg>
);
export const Search = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);
export const Camera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);
export const Upload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 15v4h16v-4" />
  </Svg>
);
export const Sparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" />
  </Svg>
);
export const Alert = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </Svg>
);

export const ChevronDown = (p: IconProps) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const Eye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const EyeOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.9 0 3.5-.6 4.9-1.5" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
  </Svg>
);
export const Person = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
  </Svg>
);
export const Lock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const SignOut = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
  </Svg>
);

export const Flame = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.6-8.3.3 1.9 1.3 3.2 2.4 3.6.4-2.6 1.6-5 3.6-6.6-.3 2.8.9 4.6 2.2 6.4 1 1.4 1.7 2.9 1.7 4.9 0 3.6-3.1 6.2-7 6.2Z" />
    <path d="M12 21c-1.7 0-2.9-1.2-2.9-2.8 0-1.8 1.4-2.7 2.1-4.2.9 1.1 3.7 2.2 3.7 4.2 0 1.6-1.2 2.8-2.9 2.8Z" />
  </Svg>
);
/** A star; `filled` for a favourite. */
export const Star = ({ filled = false, className = "h-5 w-5" }: IconProps & { filled?: boolean }) => (
  <svg className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6Z" />
  </svg>
);
/** A drop of water, for the water card. */
export const Droplet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5c3.3 3.9 6 7.3 6 10.6A6 6 0 0 1 12 20a6 6 0 0 1-6-5.9c0-3.3 2.7-6.7 6-10.6Z" />
    <path d="M9.2 14.6a2.9 2.9 0 0 0 2.4 2.5" />
  </Svg>
);
/** Knife and fork, for the food page. */
export const Utensils = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M7 3v4M9 3v4M11 3v4" />
    <path d="M17 21V3c-2 1.5-3 4-3 7v3h3" />
  </Svg>
);
/** A runner, for the exercise page. */
export const Runner = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="14.5" cy="4.5" r="1.8" />
    <path d="m7 21 3.5-5.5 3 2.5V22M10.5 15.5l1.5-6.5 3 3 3.5 1M12 9 8.5 10 6.5 13" />
  </Svg>
);
/** Three columns, for the dashboard. */
export const BarChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h16M7 16v-5M12 16V6M17 16v-8" />
  </Svg>
);
export const Clock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

const CATEGORY_PATHS: Record<ExerciseCategory, React.ReactNode> = {
  // heartbeat line
  cardio: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  // dumbbell
  strength: <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  // person stretching, arms up
  flexibility: (
    <>
      <circle cx="12" cy="5" r="1.8" />
      <path d="M5 4.5 12 10l7-5.5M12 10v4.5l-4 6M12 14.5l4 6" />
    </>
  ),
  // ball
  sports: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.8 9.5c3.3 1.3 6.6 4.6 7.9 11M20.2 9.5c-3.3 1.3-6.6 4.6-7.9 11M8 4.5c2.7 1.8 5.3 1.8 8 0" />
    </>
  ),
};

export function CategoryIcon({ category, className }: IconProps & { category: ExerciseCategory }) {
  return <Svg className={className}>{CATEGORY_PATHS[category]}</Svg>;
}

/** The app mark: a plate seen from above with a quarter filled in. */
export function Logo({ className = "h-8 w-8" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="var(--color-basil)" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#fff" strokeWidth="2" opacity="0.9" />
      <path d="M16 6.5A9.5 9.5 0 0 1 25.5 16H16Z" fill="#fff" />
    </svg>
  );
}

const MEAL_PATHS: Record<Meal, React.ReactNode> = {
  // sunrise
  breakfast: <path d="M3 17h18M7 17a5 5 0 0 1 10 0M12 4v3M4.9 9.9l1.4 1.4M19.1 9.9l-1.4 1.4M3 20.5h18" />,
  // sun
  lunch: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  // moon
  dinner: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
  // apple
  snack: (
    <>
      <path d="M12 7.5c-1.5-1-5.5-1.5-6.5 2.5-.9 3.6 1.5 9.5 4 10 1 .2 1.6-.4 2.5-.4s1.5.6 2.5.4c2.5-.5 4.9-6.4 4-10-1-4-5-3.5-6.5-2.5Z" />
      <path d="M12 7.5c0-2 1-3.5 2.5-4" />
    </>
  ),
};

export function MealIcon({ meal, className }: IconProps & { meal: Meal }) {
  return <Svg className={className}>{MEAL_PATHS[meal]}</Svg>;
}
