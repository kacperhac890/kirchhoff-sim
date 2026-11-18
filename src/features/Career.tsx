import { Award, Check, ChevronRight, Lock, Play, RotateCcw, Trophy } from 'lucide-react';
import { useApp } from '../store/store';
import { MISSIONS } from '../game/missions';
import { ACHIEVEMENTS } from '../game/progress';
import { CAREER, ROLES, TCODES, nextRank, rankFor, unlockedRoles } from '../game/roles';
import { localAdapter } from '../store/persist';
import { Badge, Bar, Button, cx } from '../ui/kit';
import type { ScenarioId } from '../engine';

export function CareerSummary() {
  const p = useApp((s) => s.profile)!;
  const rank = rankFor(p.xp);
  const next = nextRank(p.xp);
  const from = ROLES[rank].xp;
  const to = next ? ROLES[next].xp : p.xp;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-xs text-ink-3">Current rank</div>
          <div className="text-lg font-semibold text-ink">{ROLES[rank].title}</div>
        </div>
        <div className="text-right">
          <div className="tnum text-lg font-semibold text-ink">{p.xp.toLocaleString('en-US')} XP</div>
          <div className="text-xs text-ink-3">{next ? `${(to - p.xp).toLocaleString('en-US')} XP to ${ROLES[next].title}` : 'Top rank reached'}</div>
        </div>
      </div>
      <Bar value={next ? (p.xp - from) / (to - from) : 1} className="mt-3" label="Progress to next rank" />
      <ol className="mt-4 grid grid-cols-7 gap-1" aria-label="Career path">
        {CAREER.map((r) => {
          const done = p.xp >= ROLES[r].xp;
          return (
            <li key={r} className="min-w-0">
              <div className={cx('h-1 rounded-full', done ? 'bg-accent' : 'bg-s3')} />
              <div className={cx('mt-1.5 truncate text-2xs', r === rank ? 'font-medium text-ink' : done ? 'text-ink-2' : 'text-ink-4')} title={ROLES[r].title}>
                {ROLES[r].short}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function MissionList({ onStart }: { onStart: (id: ScenarioId, fresh: boolean) => void }) {
  const p = useApp((s) => s.profile)!;
  const current = useApp((s) => s.sim?.scenario);
  const saves = localAdapter.listSlots();
  return (
    <ol className="flex flex-col divide-y divide-line-soft">
      {MISSIONS.map((m) => {
        const locked = p.xp < ROLES[m.rank].xp;
        const best = p.best[m.id];
        const cert = p.certifications.some((c) => c.mission === m.id);
        const saved = saves.find((x) => x.slot === `mission-${m.id}`);
        return (
          <li key={m.id} className="flex flex-wrap items-center gap-4 py-3.5">
            <div className={cx('mono flex size-10 shrink-0 items-center justify-center rounded-md text-xs', locked ? 'bg-s2 text-ink-4' : cert ? 'bg-ok-soft text-ok' : 'bg-accent-soft text-[oklch(0.82_0.09_248)]')}>
              {locked ? <Lock className="size-4" aria-label="Locked" /> : cert ? <Check className="size-4" aria-label="Certified" /> : m.code.slice(-2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{m.title}</span>
                <span className="text-xs text-ink-3">{m.department}</span>
                {current === m.id && <Badge tone="accent">In progress</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-ink-3">{m.subtitle}</p>
              <p className="mt-1 text-xs text-ink-4">
                {locked ? `Requires rank ${ROLES[m.rank].title}` : `${m.steps.length} steps · ${m.xp} XP · trains ${m.tcodes.slice(0, 5).map((c) => TCODES[c].sap.split(' ')[0]).join(', ')}${m.tcodes.length > 5 ? '…' : ''}`}
                {best !== undefined && ` · best ${best} %`}
              </p>
            </div>
            <div className="flex gap-2">
              {saved && !locked && current !== m.id && (
                <Button size="sm" onClick={() => onStart(m.id, false)} icon={<ChevronRight className="size-3.5" />}>
                  Continue
                </Button>
              )}
              <Button size="sm" variant={locked ? 'secondary' : 'primary'} disabled={locked} onClick={() => onStart(m.id, true)} icon={saved ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}>
                {saved ? 'Restart' : 'Start'}
              </Button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function AchievementGrid() {
  const p = useApp((s) => s.profile)!;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
      {ACHIEVEMENTS.map((a) => {
        const got = p.achievements.includes(a.id);
        return (
          <li key={a.id} className={cx('flex gap-2.5 rounded-md border p-2.5', got ? 'border-[oklch(0.82_0.145_80/0.4)] bg-amber-soft' : 'border-line-soft')}>
            <Trophy className={cx('mt-0.5 size-4 shrink-0', got ? 'text-amber' : 'text-ink-4')} aria-hidden />
            <div className="min-w-0">
              <div className={cx('text-sm font-medium', got ? 'text-ink' : 'text-ink-3')}>{a.title}</div>
              <div className="text-xs text-ink-3">{a.text}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Certifications() {
  const p = useApp((s) => s.profile)!;
  if (!p.certifications.length) return <p className="text-sm text-ink-3">No certifications yet. Score 70 % or more in a training mission to get certified for that department.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {p.certifications.map((c) => (
        <li key={c.mission} className="flex items-center gap-2.5">
          <Award className="size-4 text-ok" aria-hidden />
          <span className="text-sm text-ink">{c.title}</span>
          <span className="tnum ml-auto text-xs text-ink-3">{c.score} % · {new Date(c.t).toLocaleDateString('en-GB')}</span>
        </li>
      ))}
    </ul>
  );
}

export function RolePicker() {
  const p = useApp((s) => s.profile)!;
  const setRole = useApp((s) => s.setRole);
  const roles = unlockedRoles(p.xp);
  return (
    <div className="flex flex-col gap-1.5">
      {(Object.keys(ROLES) as (keyof typeof ROLES)[]).map((r) => {
        const info = ROLES[r];
        const unlocked = roles.includes(r);
        const active = p.activeRole === r;
        return (
          <button
            key={r}
            type="button"
            disabled={!unlocked}
            onClick={() => setRole(r)}
            className={cx('press flex w-full cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-left disabled:cursor-not-allowed', active ? 'border-accent bg-accent-soft' : 'border-line-soft hover:bg-s2', !unlocked && 'opacity-50')}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{info.title}</span>
                {!unlocked && <Lock className="size-3 text-ink-4" aria-label="Locked" />}
                {active && <Badge tone="accent">Active</Badge>}
              </div>
              <div className="mt-0.5 text-xs text-ink-3">{info.responsibilities[0]}</div>
            </div>
            <span className="tnum text-2xs text-ink-4">{info.xp ? `${info.xp} XP` : ''}</span>
          </button>
        );
      })}
    </div>
  );
}
