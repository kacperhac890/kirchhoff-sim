// Chart theme (dataviz skill: dark-mode categorical steps, recessive grid,
// text in ink tokens, hover tooltips by default).
import type { ReactNode } from 'react';

export const SERIES = {
  blue: '#3987e5',
  orange: '#d95926',
  aqua: '#199e70',
  yellow: '#c98500',
  violet: '#9085e9',
  red: '#e66767',
};
export const STATUS_HEX = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };

export const axisProps = {
  stroke: 'oklch(0.36 0.012 250)',
  tick: { fill: 'oklch(0.68 0.012 250)', fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: 'oklch(0.36 0.012 250)' },
};
export const gridProps = { stroke: 'oklch(0.28 0.012 250)', strokeDasharray: '0', vertical: false };

export function ChartTooltip({ active, payload, label, unit, labelFmt }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; dataKey?: string }[]; label?: string | number; unit?: string; labelFmt?: (l: string | number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="overlay-surface rounded-md px-2.5 py-2 text-xs">
      <div className="mb-1 text-ink-3">{labelFmt ? labelFmt(label ?? '') : label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
          <span className="text-ink-2">{p.name}</span>
          <span className="tnum ml-auto pl-3 font-medium text-ink">
            {typeof p.value === 'number' ? (Math.abs(p.value) < 10 && unit === '%' ? p.value.toFixed(1) : Math.round(p.value).toLocaleString('en-US')) : p.value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function ChartEmpty({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-[160px] items-center justify-center px-6 text-center text-xs text-ink-3">{children}</div>;
}
