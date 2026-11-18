import { Pause, Play } from 'lucide-react';
import { useApp } from '../store/store';
import { useSim } from './hooks';
import { SHIFT_NAMES, clock, pad2, shiftOf } from '../engine';
import { cx } from '../ui/kit';

const SPEEDS = [1, 2, 5, 10];

export function SimClock() {
  const s = useSim();
  const setSpeed = useApp((st) => st.setSpeed);
  const toggle = useApp((st) => st.togglePause);
  const c = clock(s.t);
  const shift = shiftOf(s.t);
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Simulation clock">
      <div className="hidden text-right leading-tight sm:block">
        <div className="tnum mono text-sm font-medium text-ink" aria-live="off">
          {c.weekday} {pad2(c.hh)}:{pad2(c.mm)}
        </div>
        <div className="text-2xs text-ink-3">
          Day {c.day} · Shift {shift} <span className="hidden md:inline">({SHIFT_NAMES[shift].split(' ')[1]})</span>
        </div>
      </div>
      <div className="flex items-center rounded-md border border-line bg-bg p-0.5">
        <button
          type="button"
          onClick={toggle}
          aria-label={s.paused ? 'Resume simulation (Space)' : 'Pause simulation (Space)'}
          title={s.paused ? 'Resume (Space)' : 'Pause (Space)'}
          className={cx('press flex size-7 cursor-pointer items-center justify-center rounded', s.paused ? 'bg-amber text-[oklch(0.2_0.03_80)]' : 'text-ink-2 hover:bg-s2')}
        >
          {s.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        </button>
        {SPEEDS.map((v, i) => (
          <button
            key={v}
            type="button"
            onClick={() => setSpeed(v)}
            aria-pressed={!s.paused && s.speed === v}
            title={`×${v} — key ${i + 1}`}
            className={cx(
              'press tnum h-7 min-w-8 cursor-pointer rounded px-1.5 text-xs font-medium',
              !s.paused && s.speed === v ? 'bg-accent text-accent-ink' : 'text-ink-3 hover:bg-s2 hover:text-ink',
            )}
          >
            ×{v}
          </button>
        ))}
      </div>
    </div>
  );
}
