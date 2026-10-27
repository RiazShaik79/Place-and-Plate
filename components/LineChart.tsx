"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface LinePoint {
  date: string; // YYYY-MM-DD, placed on a time axis
  value: number; // a reading (drawn as a dot)
  trend: number; // the smoothed line through the readings
}

interface Props {
  ariaLabel: string;
  points: LinePoint[];
  from: string; // first day on the axis
  to: string; // last day on the axis
  reference?: number | null; // a goal line, named in the legend below the chart
  format: (v: number) => string; // value with unit, for ticks and tooltips
  height?: number;
}

const AXIS_BAND = 26;
const LEFT = 48;
const RIGHT = 14;
const TOP = 14;
const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const shortDate = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const longDate = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

/** A step (0.5, 1, 2, 5…) giving about three ticks across `span`. */
function niceStep(span: number): number {
  const raw = span / 3;
  const exp = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= raw) return m * exp;
  return 10 * exp;
}

/**
 * Readings as dots and their trend as a line on one y-axis that fits the data (weight never starts
 * at zero), with an optional goal line. Each reading has a hover / focus tooltip.
 */
export default function LineChart({ ariaLabel, points, from, to, reference, format, height = 200 }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (wrap.current) setWidth(wrap.current.clientWidth);
  }, []);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = points.flatMap((p) => [p.value, p.trend]);
  if (reference != null) values.push(reference);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const step = niceStep(Math.max(hi - lo, 1));
  const min = Math.floor((lo - step * 0.25) / step) * step;
  const max = Math.ceil((hi + step * 0.25) / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);

  const plotW = Math.max(0, width - LEFT - RIGHT);
  const d0 = day(from);
  const span = Math.max(1, day(to) - d0);
  const x = (iso: string) => LEFT + ((day(iso) - d0) / span) * plotW;
  const y = (v: number) => TOP + height - ((v - min) / (max - min)) * height;
  const trendPath = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join(" ");
  // Date labels at the start, middle and end of the range.
  const mid = new Date(Date.UTC(1970, 0, 1 + Math.round(d0 + span / 2))).toISOString().slice(0, 10);
  const xLabels = [from, mid, to];

  return (
    <div ref={wrap} className="relative" style={{ height: height + TOP + AXIS_BAND }}>
      {width > 0 && (
        <svg width={width} height={height + TOP + AXIS_BAND} role="img" aria-label={ariaLabel} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={LEFT} x2={width - RIGHT} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={LEFT - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-faint text-[11px] tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}
          {xLabels.map((d, i) => (
            <text key={d + i} x={x(d)} y={TOP + height + 17} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="fill-muted text-[11px]">
              {shortDate(d)}
            </text>
          ))}
          {reference != null && (
            <line x1={LEFT} x2={width - RIGHT} y1={y(reference)} y2={y(reference)} stroke="var(--color-ink)" strokeOpacity={0.55} strokeWidth={1.5} pointerEvents="none" />
          )}
          {points.length > 1 && <path d={trendPath} fill="none" stroke="var(--color-basil)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {points.map((p, i) => (
            <g key={p.date}>
              {/* A 2px surface ring keeps dots readable where they sit on the trend line. */}
              <circle cx={x(p.date)} cy={y(p.value)} r={hover === i ? 5.5 : 4} fill="var(--color-surface)" stroke="var(--color-basil)" strokeWidth={2} />
              <circle
                cx={x(p.date)}
                cy={y(p.value)}
                r={12}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${longDate(p.date)}: ${format(p.value)}, trend ${format(p.trend)}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
                className="cursor-default outline-none focus-visible:fill-[rgba(36,87,63,0.12)]"
              />
            </g>
          ))}
        </svg>
      )}
      {hover !== null && width > 0 && points[hover] && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 w-44 rounded-lg bg-ink px-3 py-2 text-white shadow-[0_8px_24px_rgba(26,36,32,0.25)]"
          style={{ left: Math.min(Math.max(0, x(points[hover].date) - 88), width - 176), top: Math.max(0, y(points[hover].value) - 72) }}
        >
          <p className="text-[15px] font-bold">{format(points[hover].value)}</p>
          <p className="text-xs text-white/75">{longDate(points[hover].date)}</p>
          <p className="text-xs text-white/75">Trend {format(points[hover].trend)}</p>
        </div>
      )}
    </div>
  );
}
