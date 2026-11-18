// DOM labels for machines, drawn above the canvas and positioned by LabelProjector.
import { useCallback } from 'react';
import { MACHINES } from '../engine';
import { useApp } from '../store/store';
import { MACHINE_STATUS, cx } from '../ui/kit';
import { anchorRef } from './labelAnchors';

const chipY = (group: string) => (group === 'PRESS' || group === 'HOTFORM' ? 10.8 : group === 'KTL' ? 6.6 : 4.6);

export function ScreenLabels({ machines, compact }: { machines: boolean; compact: boolean }) {
  useApp((s) => s.rev);
  const sim = useApp.getState().sim;
  const select = useApp((s) => s.select);
  const selected = useApp((s) => (s.selection?.kind === 'machine' ? s.selection.id : null));
  // stable ref callbacks per key so React does not re-register on every render
  const ref = useCallback((key: string, x: number, y: number, z: number) => anchorRef(key, x, y, z), []);
  if (!sim) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-label="Plant labels">
      {machines &&
        MACHINES.map((d) => {
          const m = sim.machines[d.id];
          const st = MACHINE_STATUS[m.status];
          const pp = m.order ? sim.docs[m.order] : undefined;
          const op = pp && pp.type === 'PP' ? pp.ops.find((o) => o.no === m.op) : undefined;
          return (
            <button
              key={d.id}
              ref={ref(`m-${d.id}`, d.pos[0], chipY(d.group), d.pos[1])}
              type="button"
              onClick={() => select({ kind: 'machine', id: d.id })}
              aria-label={`${d.id}: ${st.label}`}
              style={{ visibility: 'hidden' }}
              className={cx(
                'pointer-events-auto absolute top-0 left-0 flex cursor-pointer items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-2xs whitespace-nowrap shadow-[var(--shadow-overlay)] will-change-transform',
                selected === d.id ? 'border-accent bg-[oklch(0.25_0.04_248/0.95)]' : 'border-[oklch(0.4_0.012_250/0.6)] bg-[oklch(0.19_0.011_250/0.88)] hover:border-s4',
              )}
            >
              <span className={cx('size-2 rounded-full', m.status === 'STOPPED' && 'pulse')} style={{ background: st.color }} aria-hidden />
              <span className="mono text-ink">{d.id}</span>
              {!compact && op && <span className="tnum text-ink-3">{Math.round((op.produced / Math.max(1, op.qtyIn)) * 100)}%</span>}
            </button>
          );
        })}
    </div>
  );
}
