"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface Column {
  key: string;
  label: string; // short axis label
  title: string; // full label for the tooltip
  value: number | null; // null = nothing logged (no bar)
  tone?: "default" | "over" | "partial"; // partial = today so far (dashed outline, light fill)
  detail?: string; // extra tooltip line, e.g. "5 of 7 days logged"
}

interface Props {
  ariaLabel: string;
  columns: Column[];
  format: (v: number) => string; // value with unit, for tooltips and the reference label
  tickFormat?: (v: number) => string; // y-axis labels (default: compact 1.5K)
  reference?: number; // a goal / target line, named in the chart's legend
  emptyText: string;
  height?: number; // plot height in px (axis band added on top of this)
}

const AXIS_BAND = 26;
const LEFT = 40;
const RIGHT = 12;
const TOP = 14;
const TONE = { default: "var(--color-basil)", over: "var(--color-over)", partial: "var(--color-basil-soft)" };

/** Compact tick labels: 0 / 750 / 1.5K / 12K. */
function compact(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

/** A snug axis maximum above `v` whose half is also a round number (so the middle tick reads cleanly). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 3, 4, 5, 6, 8, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

/**
 * One series of columns on one axis, an optional reference line (goal / target), a hover or
 * focus tooltip per column, and a sized container so axis labels never clip.
 */
export default function ColumnChart({ ariaLabel, columns, format, tickFormat = compact, reference, emptyText, height = 180 }: Props) {
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

  const values = columns.map((c) => c.value ?? 0);
  const hasData = columns.some((c) => c.value !== null && c.value > 0);
  const max = niceMax(Math.max(...values, reference ?? 0) * 1.08);
  const plotW = Math.max(0, width - LEFT - RIGHT);
  const band = columns.length ? plotW / columns.length : 0;
  const barW = Math.max(4, Math.min(24, band * 0.62));
  const y = (v: number) => TOP + height - (v / max) * height;
  const every = band >= 44 ? 1 : band >= 24 ? 2 : 3; // thin out x labels on narrow screens
  // With no data the scale means nothing: show only the baseline.
  const ticks = hasData ? [0, max / 2, max] : [0];

  return (
    <div ref={wrap} className="relative" style={{ height: height + TOP + AXIS_BAND }}>
      {width > 0 && (
        <svg width={width} height={height + TOP + AXIS_BAND} role="img" aria-label={ariaLabel} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={LEFT} x2={width - RIGHT} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={LEFT - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-faint text-[11px] tabular-nums">
                {tickFormat(t)}
              </text>
            </g>
          ))}

          {columns.map((c, i) => {
            const cx = LEFT + band * i + band / 2;
            const v = c.value ?? 0;
            const h = Math.max(0, y(0) - y(v));
            const r = Math.min(4, h, barW / 2);
            const x0 = cx - barW / 2;
            const top = y(0) - h;
            // Count from the newest column so the latest period is always labelled, without collisions.
            const showLabel = (columns.length - 1 - i) % every === 0;
            return (
              <g key={c.key}>
                {c.value !== null && h > 0 && (
                  <path
                    d={`M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${y(0)} Z`}
                    fill={TONE[c.tone ?? "default"]}
                    stroke={c.tone === "partial" ? "var(--color-basil)" : undefined}
                    strokeWidth={c.tone === "partial" ? 1.5 : undefined}
                    strokeDasharray={c.tone === "partial" ? "3 2" : undefined}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                    className="transition-opacity"
                  />
                )}
                {showLabel && (
                  <text x={cx} y={TOP + height + 17} textAnchor="middle" className="fill-muted text-[11px]">
                    {c.label}
                  </text>
                )}
                {/* The whole column is the hit target (hover and keyboard). */}
                <rect
                  x={LEFT + band * i}
                  y={TOP}
                  width={band}
                  height={height}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${c.title}: ${c.value === null ? "nothing logged" : format(c.value)}${c.detail ? `, ${c.detail}` : ""}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((h) => (h === i ? null : h))}
                  className="cursor-default outline-none focus-visible:fill-[rgba(36,87,63,0.06)]"
                />
              </g>
            );
          })}

          {/* The reference line is named in the legend below (a line key), never on top of the bars. */}
          {reference !== undefined && reference > 0 && (
            <line
              x1={LEFT}
              x2={width - RIGHT}
              y1={y(reference)}
              y2={y(reference)}
              stroke="var(--color-ink)"
              strokeOpacity={0.55}
              strokeWidth={1.5}
              pointerEvents="none"
            />
          )}
        </svg>
      )}

      {!hasData && width > 0 && (
        <p className="pointer-events-none absolute inset-x-0 text-center text-sm text-muted" style={{ top: TOP + height / 2 - 10, paddingLeft: LEFT }}>
          {emptyText}
        </p>
      )}

      {hover !== null && width > 0 && (
        <Tooltip
          x={LEFT + band * hover + band / 2}
          y={y(columns[hover].value ?? 0)}
          width={width}
          column={columns[hover]}
          format={format}
        />
      )}
    </div>
  );
}

function Tooltip({ x, y, width, column, format }: { x: number; y: number; width: number; column: Column; format: (v: number) => string }) {
  const W = 168;
  const left = Math.min(Math.max(0, x - W / 2), width - W);
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 rounded-lg bg-ink px-3 py-2 text-white shadow-[0_8px_24px_rgba(26,36,32,0.25)]"
      style={{ left, top: Math.max(0, y - 64), width: W }}
    >
      <p className="text-[15px] font-bold">{column.value === null ? "Nothing logged" : format(column.value)}</p>
      <p className="text-xs text-white/75">{column.title}</p>
      {column.detail && <p className="text-xs text-white/75">{column.detail}</p>}
    </div>
  );
}
