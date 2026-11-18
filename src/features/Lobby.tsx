import { Factory, LogOut, Play, RotateCcw } from 'lucide-react';
import { useApp } from '../store/store';
import { localAdapter } from '../store/persist';
import { Brand } from '../ui/Brand';
import { Button } from '../ui/kit';
import { AchievementGrid, CareerSummary, Certifications, MissionList } from './Career';
import { fmtDateTime } from '../engine';

export function Lobby() {
  const p = useApp((s) => s.profile)!;
  const start = useApp((s) => s.startScenario);
  const logout = useApp((s) => s.logout);
  const navigate = useApp((s) => s.navigate);
  const free = localAdapter.listSlots().find((x) => x.slot === 'free');
  const go = (id: Parameters<typeof start>[0], fresh: boolean) => {
    start(id, fresh);
    navigate(id === 'FREE' ? '#/dashboard' : '#/dashboard');
  };
  return (
    <div className="mx-auto flex min-h-full max-w-[1180px] flex-col px-6 py-8 md:px-10">
      <div className="flex items-center justify-between">
        <Brand />
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-2">
            {p.name} <span className="mono text-ink-3">{p.employeeId}</span>
          </span>
          <Button size="sm" variant="ghost" onClick={logout} icon={<LogOut className="size-3.5" />}>
            Clock out
          </Button>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rise-in">
          <h1 className="text-2xl font-semibold tracking-[-0.015em] text-ink">Good to see you, {p.name.split(' ')[0]}.</h1>
          <p className="mt-2 max-w-[60ch] text-base text-ink-2">Pick a training mission to learn one process step by step, or take over the whole plant in free simulation.</p>

          <section className="panel mt-8 p-5" aria-labelledby="train-h">
            <h2 id="train-h" className="text-sm font-semibold text-ink">Training missions</h2>
            <p className="mt-0.5 text-xs text-ink-3">Guided, with explanations after every step. Only the transactions of the mission are authorized.</p>
            <div className="mt-2">
              <MissionList onStart={go} />
            </div>
          </section>

          <section className="panel mt-4 flex flex-wrap items-center gap-5 p-5" aria-labelledby="free-h">
            <div className="flex size-11 items-center justify-center rounded-md bg-amber-soft text-amber">
              <Factory className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="free-h" className="font-medium text-ink">Free simulation</h2>
              <p className="text-sm text-ink-3">Full authorization. Customer call-offs, breakdowns, supplier delays and quality drift happen without warning.</p>
              {free && <p className="mt-1 text-xs text-ink-4">Saved plant at {fmtDateTime(free.t)} (day {Math.floor((free.t + 360) / 1440) + 1})</p>}
            </div>
            <div className="flex gap-2">
              {free && (
                <Button onClick={() => go('FREE', false)} variant="primary" icon={<Play className="size-3.5" />}>
                  Continue
                </Button>
              )}
              <Button onClick={() => go('FREE', true)} variant={free ? 'secondary' : 'primary'} icon={free ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}>
                {free ? 'New plant' : 'Start'}
              </Button>
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4 rise-in">
          <section className="panel p-5">
            <CareerSummary />
          </section>
          <section className="panel p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink">Certifications</h2>
            <Certifications />
          </section>
        </aside>
      </div>

      <section className="mt-8 pb-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">Achievements</h2>
        <AchievementGrid />
      </section>
    </div>
  );
}
