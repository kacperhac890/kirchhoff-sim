import { Award, BookOpen, CheckCircle2, ChevronDown, ChevronUp, Compass, Lightbulb, X } from 'lucide-react';
import { useApp } from '../store/store';
import { useSim } from './hooks';
import { missionById } from '../game/missions';
import { ROLES, TCODES } from '../game/roles';
import { fmtDuration } from '../engine';
import { Badge, Bar, Button, cx } from '../ui/kit';

export function MissionHud() {
  const s = useSim();
  const collapsed = useApp((st) => st.missionCollapsed);
  const setCollapsed = useApp((st) => st.setMissionCollapsed);
  const navigate = useApp((st) => st.navigate);
  const focus = useApp((st) => st.focus);
  const spendHint = useApp((st) => st.spendHint);
  const reportOpen = useApp((st) => !!st.report);
  const flash = useApp((st) => st.stepFlash);
  const dismissFlash = useApp((st) => st.dismissFlash);
  const mp = s.mission;
  const mission = mp ? missionById(mp.id) : undefined;
  if (!mp || !mission || reportOpen) return null;
  const done = !!mp.finishedAt;
  const step = mission.steps[Math.min(mp.step, mission.steps.length - 1)];
  const progress = mp.step / mission.steps.length;
  const showMe = () => {
    spendHint();
    navigate(step.route);
    if (step.focus) setTimeout(() => focus(step.focus!), 60);
  };
  return (
    <section aria-label="Mission" className="overlay-surface absolute bottom-3 left-3 z-[var(--z-sticky)] w-[min(400px,calc(100%-24px))] rounded-xl rise-in">
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <span className="mono text-2xs font-medium text-amber">{mission.code}</span>
        <span className="truncate text-xs text-ink-2">{mission.title}</span>
        <span className="tnum ml-auto text-2xs text-ink-3">
          {Math.min(mp.step + (done ? 0 : 1), mission.steps.length)}/{mission.steps.length}
        </span>
        <button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand mission panel' : 'Collapse mission panel'} className="press flex size-6 cursor-pointer items-center justify-center rounded text-ink-3 hover:bg-s3 hover:text-ink">
          {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>
      <div className="px-3.5 pt-2">
        <Bar value={progress} tone="accent" label="Mission progress" />
      </div>
      {flash && !collapsed && (
        <div className="mx-3.5 mt-3 rounded-md bg-ok-soft px-3 py-2.5" aria-live="polite">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
            <p className="min-w-0 flex-1 text-xs font-medium text-ink">Done — {flash.title}</p>
            <button type="button" onClick={dismissFlash} aria-label="Dismiss explanation" className="press -mt-0.5 -mr-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-ink-3 hover:bg-s3 hover:text-ink">
              <X className="size-3.5" />
            </button>
          </div>
          <p className="mt-1 flex gap-1.5 text-xs text-ink-2">
            <BookOpen className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
            <span>
              <span className="font-medium text-ink">What happened in the ERP: </span>
              {flash.why}
            </span>
          </p>
        </div>
      )}
      {done ? (
        <div className="flex items-center gap-2 px-3.5 py-3 text-sm text-ok">
          <CheckCircle2 className="size-4" aria-hidden /> Mission complete
        </div>
      ) : collapsed ? (
        <p className="truncate px-3.5 py-2.5 text-sm font-medium text-ink">{step.title}</p>
      ) : (
        <div className="px-3.5 pt-3 pb-3.5">
          <div className="flex items-center gap-2">
            <Badge tone="amber">{ROLES[step.role].title}</Badge>
            {step.tcode && <span className="mono text-2xs text-ink-3">{TCODES[step.tcode].sap}</span>}
          </div>
          <h2 className="mt-2 text-base font-semibold text-ink">{step.title}</h2>
          <p className="mt-1 text-sm text-ink-2">{step.instruction}</p>
          {step.progress && <p className="tnum mt-1.5 text-xs text-accent">{step.progress(s)}</p>}
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="amber" onClick={showMe} icon={<Compass className="size-3.5" />}>
              Show me
            </Button>
            <span className="text-2xs text-ink-4">Using “Show me” costs 2 score points.</span>
            {mission.recommendedSpeed && s.speed < mission.recommendedSpeed && !s.paused && (step.id === 'produce' || step.id === 'repair' || step.id === 'putaway' || step.id === 'arrive') && (
              <button type="button" onClick={() => useApp.getState().setSpeed(mission.recommendedSpeed!)} className="ml-auto cursor-pointer text-2xs text-accent hover:underline">
                Speed ×{mission.recommendedSpeed}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function MissionReportModal() {
  const report = useApp((s) => s.report);
  const close = useApp((s) => s.closeReport);
  const exit = useApp((s) => s.exitScenario);
  const s = useApp((st) => st.sim);
  if (!report || !s) return null;
  const mission = missionById(report.mission)!;
  const grade = report.score >= 90 ? 'Excellent' : report.score >= 70 ? 'Certified' : 'Needs practice';
  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-[oklch(0.1_0.01_250/0.6)] p-4 fade-in">
      <div role="dialog" aria-modal="true" aria-labelledby="rep-title" className="overlay-surface w-full max-w-[640px] overflow-hidden rounded-xl rise-in">
        <div className="hazard h-1.5" aria-hidden />
        <div className="p-6">
          <div className="mono text-xs text-amber">{mission.code} · performance report</div>
          <h2 id="rep-title" className="mt-1 text-xl font-semibold text-ink">{mission.title}</h2>
          <div className="mt-5 flex flex-wrap items-center gap-6">
            <ScoreRing value={report.score} />
            <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div><dt className="text-xs text-ink-3">Result</dt><dd className={cx('font-medium', report.certified ? 'text-ok' : 'text-warn')}>{grade}</dd></div>
              <div><dt className="text-xs text-ink-3">XP earned</dt><dd className="tnum font-medium text-amber">+{report.xp}</dd></div>
              <div><dt className="text-xs text-ink-3">Rejected transactions</dt><dd className="tnum text-ink">{report.errors}</dd></div>
              <div><dt className="text-xs text-ink-3">“Show me” used</dt><dd className="tnum text-ink">{report.hints}</dd></div>
              <div><dt className="text-xs text-ink-3">Simulated time</dt><dd className="tnum text-ink">{fmtDuration(report.simMinutes)}</dd></div>
              <div><dt className="text-xs text-ink-3">Steps</dt><dd className="tnum text-ink">{mission.steps.length} of {mission.steps.length}</dd></div>
            </dl>
          </div>
          {report.certified && (
            <p className="mt-5 flex items-center gap-2 rounded-md bg-ok-soft px-3 py-2 text-sm text-ok">
              <Award className="size-4" aria-hidden /> Certification earned: {mission.certification}
            </p>
          )}
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-ink">Lessons from your mistakes</h3>
            {report.mistakes.length === 0 ? (
              <p className="mt-1 text-sm text-ink-3">No mistakes recorded — every posting was accepted the first time.</p>
            ) : (
              <ul className="mt-2 flex max-h-48 flex-col gap-2 overflow-y-auto pr-1">
                {report.mistakes.slice(-8).map((m, i) => (
                  <li key={i} className="rounded-md bg-s2 px-3 py-2 text-xs">
                    <p className="text-ink">{m.text}</p>
                    <p className="mt-0.5 text-ink-3">
                      <Lightbulb className="mr-1 inline size-3 text-amber" aria-hidden />
                      {m.fix}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button onClick={close}>Keep exploring this plant</Button>
            <Button variant="primary" onClick={exit}>
              Back to lobby
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 84 84" className="size-24" role="img" aria-label={`Score ${value} percent`}>
      <circle cx="42" cy="42" r={r} fill="none" stroke="oklch(0.29 0.013 250)" strokeWidth="7" />
      <circle cx="42" cy="42" r={r} fill="none" stroke={value >= 70 ? 'var(--color-ok)' : 'var(--color-warn)'} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(c * value) / 100} ${c}`} transform="rotate(-90 42 42)" />
      <text x="42" y="47" textAnchor="middle" className="tnum" fill="var(--color-ink)" fontSize="19" fontWeight="600">
        {value}%
      </text>
    </svg>
  );
}
