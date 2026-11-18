import { useState } from 'react';
import { Check, Circle, Compass } from 'lucide-react';
import { useApp } from '../store/store';
import { useSim } from '../app/hooks';
import { missionById } from '../game/missions';
import { ROLES } from '../game/roles';
import { Badge, Button, Callout, PageHeader, Panel, cx } from '../ui/kit';
import { AchievementGrid, CareerSummary, Certifications, MissionList, RolePicker } from './Career';
import type { ScenarioId } from '../engine';

export function MissionsPage() {
  const s = useSim();
  const start = useApp((st) => st.startScenario);
  const navigate = useApp((st) => st.navigate);
  const focus = useApp((st) => st.focus);
  const p = useApp((st) => st.profile)!;
  const [pending, setPending] = useState<{ id: ScenarioId; fresh: boolean } | null>(null);
  const mission = s.mission ? missionById(s.mission.id) : undefined;
  const mp = s.mission;
  const role = ROLES[p.activeRole];
  const begin = (id: ScenarioId, fresh: boolean) => {
    start(id, fresh);
    setPending(null);
    navigate('#/dashboard');
  };
  return (
    <div>
      <PageHeader title="Missions & career" sap="Training" sub="Progress, roles and responsibilities, certifications and achievements" />
      <div className="grid gap-4 p-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {mission && mp && (
            <Panel title={`${mission.code} — ${mission.title}`} sub={mission.brief}>
              <ol className="flex flex-col p-2">
                {mission.steps.map((st, i) => {
                  const done = mp.completedSteps.includes(st.id);
                  const current = !mp.finishedAt && i === mp.step;
                  return (
                    <li key={st.id} className={cx('flex gap-3 rounded-md px-3 py-2.5', current && 'bg-amber-soft')}>
                      <span className={cx('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full', done ? 'bg-ok text-[oklch(0.2_0.03_150)]' : current ? 'bg-amber text-[oklch(0.2_0.03_80)]' : 'bg-s3 text-ink-4')}>
                        {done ? <Check className="size-3" aria-label="Done" /> : <Circle className="size-2 fill-current" aria-hidden />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cx('text-sm font-medium', done || current ? 'text-ink' : 'text-ink-3')}>{st.title}</span>
                          <span className="text-2xs text-ink-4">{ROLES[st.role].title}</span>
                        </div>
                        {current && <p className="mt-1 text-sm text-ink-2">{st.instruction}</p>}
                        {done && <p className="mt-1 text-xs text-ink-3">{st.why}</p>}
                        {current && (
                          <Button
                            size="sm"
                            variant="amber"
                            className="mt-2"
                            icon={<Compass className="size-3.5" />}
                            onClick={() => {
                              useApp.getState().spendHint();
                              navigate(st.route);
                              if (st.focus) setTimeout(() => focus(st.focus!), 60);
                            }}
                          >
                            Show me
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Panel>
          )}
          {!mission && <Callout title="Free simulation">You have full authorization. Watch the worklist and notifications — disruptions happen without warning.</Callout>}
          <Panel title="Training missions">
            <div className="px-4">
              <MissionList onStart={(id, fresh) => setPending({ id, fresh })} />
            </div>
            {pending && (
              <div className="m-4 mt-0 flex flex-wrap items-center gap-3 rounded-md border border-line bg-s2 p-3 text-sm">
                <span className="text-ink-2">Your current plant is saved. Switch to {missionById(pending.id)?.code ?? 'free simulation'}?</span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => begin(pending.id, pending.fresh)}>Switch</Button>
                  <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Stay</Button>
                </div>
              </div>
            )}
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel>
            <div className="p-4">
              <CareerSummary />
            </div>
          </Panel>
          <Panel title="Your role" sub="Roles unlock with your rank. The active role filters your worklist and earns bonus XP.">
            <div className="flex flex-col gap-4 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{role.title}</span>
                  <Badge tone="accent">Active</Badge>
                </div>
                <ul className="mt-2 list-disc pl-4 text-sm text-ink-2 marker:text-ink-4">
                  {role.responsibilities.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-ink-3">Measured by: {role.kpis.join(', ')}</p>
              </div>
              <RolePicker />
            </div>
          </Panel>
          <Panel title="Certifications">
            <div className="p-4">
              <Certifications />
            </div>
          </Panel>
          <Panel title="Achievements">
            <div className="p-4">
              <AchievementGrid />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
