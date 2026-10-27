/** The small label on a dashboard card saying which period it shows ("Today", "Last 12 weeks"…). */
export function PeriodBadge({ children }: { children: React.ReactNode }) {
  return <span className="shrink-0 rounded-full bg-sunken px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap text-muted">{children}</span>;
}

/** A card's title row: title (and subtitle) on the left, the period badge on the right. */
export default function CardHeader({ title, subtitle, badge }: { title: string; subtitle?: React.ReactNode; badge?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-bold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {badge && <PeriodBadge>{badge}</PeriodBadge>}
    </div>
  );
}
