import { useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronRight, Info, Keyboard, X } from 'lucide-react';
import { useApp } from '../store/store';
import { useSim, parseRoute } from './hooks';
import { MACHINES, BIN_MAP, fmtDateTime, type SimEvent } from '../engine';
import { getTasks } from '../game/tasks';
import { HELP } from '../game/help';
import { ROLES } from '../game/roles';
import { missionById } from '../game/missions';
import { Badge, Kbd, cx } from '../ui/kit';
import { DocLink } from '../ui/links';

export function Drawers() {
  const drawer = useApp((s) => s.drawer);
  const setDrawer = useApp((s) => s.setDrawer);
  if (!drawer) return null;
  const title = drawer === 'notifications' ? 'Notifications' : drawer === 'tasks' ? 'Worklist' : 'Help';
  return (
    <aside
      className="overlay-surface slide-in-right fixed top-14 right-2 bottom-2 z-[var(--z-drawer)] flex w-[min(420px,calc(100vw-16px))] flex-col rounded-xl"
      aria-label={title}
      onKeyDown={(e) => e.key === 'Escape' && setDrawer(null)}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <button type="button" onClick={() => setDrawer(null)} aria-label="Close panel" className="press flex size-7 cursor-pointer items-center justify-center rounded text-ink-3 hover:bg-s3 hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {drawer === 'notifications' && <Notifications />}
        {drawer === 'tasks' && <Worklist />}
        {drawer === 'help' && <Help />}
      </div>
    </aside>
  );
}

const SEV = {
  critical: { Icon: AlertOctagon, color: 'var(--color-bad)' },
  warning: { Icon: AlertTriangle, color: 'var(--color-warn)' },
  success: { Icon: CheckCircle2, color: 'var(--color-ok)' },
  info: { Icon: Info, color: 'var(--color-accent)' },
};

export function RefChip({ r }: { r: string }) {
  const s = useSim();
  const st = useApp.getState();
  if (s.docs[r]) return <DocLink id={r} s={s} className="text-xs" />;
  if (MACHINES.some((m) => m.id === r))
    return (
      <button type="button" onClick={() => { st.navigate('#/factory'); st.focus(`machine:${r}`); }} className="mono cursor-pointer text-xs text-[oklch(0.8_0.1_248)] hover:underline">
        {r}
      </button>
    );
  if (BIN_MAP[r])
    return (
      <button type="button" onClick={() => st.navigate(`#/warehouse/bins/${r}`)} className="mono cursor-pointer text-xs text-[oklch(0.8_0.1_248)] hover:underline">
        {r}
      </button>
    );
  if (s.batches[r])
    return (
      <button type="button" onClick={() => st.navigate(`#/quality/batches/${r}`)} className="mono cursor-pointer text-xs text-[oklch(0.8_0.1_248)] hover:underline">
        {r}
      </button>
    );
  return null;
}

export function EventItem({ e }: { e: SimEvent }) {
  const sev = SEV[e.severity];
  return (
    <li className={cx('flex gap-3 px-4 py-3', !e.read && 'bg-[oklch(0.7_0.135_248/0.05)]')}>
      <sev.Icon className="mt-0.5 size-4 shrink-0" style={{ color: sev.color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-ink">{e.title}</p>
          <span className="tnum shrink-0 text-2xs text-ink-4">{fmtDateTime(e.t)}</span>
        </div>
        <p className="mt-0.5 text-xs text-ink-2">{e.body}</p>
        {e.advice && (
          <p className="mt-1.5 text-xs text-ink-3">
            <span className="font-medium text-ink-2">What to do: </span>
            {e.advice}
          </p>
        )}
        {e.refs.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {e.refs.slice(0, 5).map((r) => (
              <RefChip key={r} r={r} />
            ))}
          </div>
        )}
        {e.resolved && <Badge tone="ok" className="mt-1.5">Resolved</Badge>}
      </div>
    </li>
  );
}

function Notifications() {
  const s = useSim();
  const [filter, setFilter] = useState<'all' | 'critical'>('all');
  const list = s.events.filter((e) => filter === 'all' || e.severity === 'critical' || e.severity === 'warning');
  return (
    <div>
      <div className="flex gap-1 px-4 pt-3">
        {(['all', 'critical'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={cx('press cursor-pointer rounded px-2 py-1 text-xs', filter === f ? 'bg-s3 text-ink' : 'text-ink-3 hover:text-ink')}>
            {f === 'all' ? 'All' : 'Warnings & alarms'}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-ink-3">No notifications yet. Alarms, arrivals and deadlines will appear here.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {list.slice(0, 80).map((e) => (
            <EventItem key={e.id} e={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Worklist() {
  const s = useSim();
  const profile = useApp((st) => st.profile)!;
  const navigate = useApp((st) => st.navigate);
  const setDrawer = useApp((st) => st.setDrawer);
  const [mine, setMine] = useState(false);
  const all = getTasks(s);
  const tasks = mine ? all.filter((t) => t.role === profile.activeRole || profile.activeRole === 'MANAGER') : all;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <div className="flex gap-1">
          <button type="button" onClick={() => setMine(false)} className={cx('press cursor-pointer rounded px-2 py-1 text-xs', !mine ? 'bg-s3 text-ink' : 'text-ink-3 hover:text-ink')}>
            All ({all.length})
          </button>
          <button type="button" onClick={() => setMine(true)} className={cx('press cursor-pointer rounded px-2 py-1 text-xs', mine ? 'bg-s3 text-ink' : 'text-ink-3 hover:text-ink')}>
            My role
          </button>
        </div>
        <span className="text-2xs text-ink-4">{ROLES[profile.activeRole].title}</span>
      </div>
      {tasks.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-ink-3">{mine ? 'Nothing open for your role right now.' : 'The worklist is empty — the plant is running smoothly.'}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line-soft">
          {tasks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  navigate(t.route);
                  setDrawer(null);
                }}
                className="group flex w-full cursor-pointer items-start gap-3 px-4 py-2.5 text-left hover:bg-s2"
              >
                <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', t.severity === 'critical' ? 'bg-bad' : t.severity === 'high' ? 'bg-warn' : 'bg-ink-4')} aria-label={t.severity} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink">{t.title}</span>
                  <span className="block text-xs text-ink-3">{t.detail}</span>
                  <span className="mt-0.5 block text-2xs text-ink-4">{ROLES[t.role].title}</span>
                </span>
                <ChevronRight className="mt-1 size-4 text-ink-4 group-hover:text-ink-2" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Help() {
  const route = useApp((s) => s.route);
  const s = useSim();
  const { module } = parseRoute(route);
  const topic = HELP[module] ?? HELP.dashboard;
  const mission = s.mission ? missionById(s.mission.id) : undefined;
  const step = mission && s.mission && !s.mission.finishedAt ? mission.steps[s.mission.step] : undefined;
  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      {step && (
        <section className="rounded-md bg-amber-soft p-3">
          <div className="text-xs font-medium text-amber">Current mission step</div>
          <p className="mt-1 text-sm font-medium text-ink">{step.title}</p>
          <p className="mt-1 text-xs text-ink-2">{step.instruction}</p>
        </section>
      )}
      <section>
        <div className="flex items-baseline gap-2">
          <h3 className="text-base font-semibold text-ink">{topic.title}</h3>
          <span className="mono text-xs text-ink-3">{topic.sap}</span>
        </div>
        <p className="mt-2 text-sm text-ink-2">{topic.summary}</p>
        {topic.flow && (
          <ol className="mt-3 flex flex-wrap items-center gap-1 text-xs">
            {topic.flow.map((f, i) => (
              <li key={f} className="flex items-center gap-1">
                <span className="rounded bg-s3 px-1.5 py-0.5 text-ink-2">{f}</span>
                {i < topic.flow!.length - 1 && <ChevronRight className="size-3 text-ink-4" aria-hidden />}
              </li>
            ))}
          </ol>
        )}
        <dl className="mt-4 flex flex-col gap-3">
          {topic.points.map((p) => (
            <div key={p.term}>
              <dt className="text-sm font-medium text-ink">{p.term}</dt>
              <dd className="mt-0.5 text-sm text-ink-2">{p.text}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="border-t border-line-soft pt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Keyboard className="size-4 text-ink-3" aria-hidden /> Shortcuts
        </h3>
        <ul className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs text-ink-2">
          <li className="contents"><span><Kbd>Ctrl</Kbd> <Kbd>K</Kbd></span><span>Search & jump to any T-code or document</span></li>
          <li className="contents"><span><Kbd>Space</Kbd></span><span>Pause / resume the simulation</span></li>
          <li className="contents"><span><Kbd>1</Kbd>–<Kbd>4</Kbd></span><span>Speed ×1, ×2, ×5, ×10</span></li>
          <li className="contents"><span><Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd></span><span>Walk in 3D explore mode (Shift to run)</span></li>
        </ul>
      </section>
    </div>
  );
}
