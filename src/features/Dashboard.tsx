import { Bar as RBar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, Box } from 'lucide-react';
import { useSim, go } from '../app/hooks';
import { useApp } from '../store/store';
import { CUSTOMERS, MACHINES, MATERIALS, SHIFT_NAMES, clock, computeScore, deliveryPerformance, docsOf, fmtDuration, fmtEur, fmtTime, inventoryValue, pad2, plantOee, shiftOf, shortages, type SimState } from '../engine';
import { getTasks } from '../game/tasks';
import { ROLES } from '../game/roles';
import { Bar, Badge, Button, DocStatusPill, MachinePill, PageHeader, Panel, cx } from '../ui/kit';
import { DocLink } from '../ui/links';
import { ChartEmpty, ChartTooltip, Legend, SERIES, axisProps, gridProps } from '../ui/charts';
import { PlantMap } from './PlantMap';
import { EventItem } from '../app/Drawers';

const hourLabel = (h: number) => `${pad2(clock(h * 60).hh)}:00`;

export function Dashboard() {
  const s = useSim();
  const navigate = useApp((st) => st.navigate);
  const c = clock(s.t);
  const shift = shiftOf(s.t);
  const oee = plantOee(s);
  const dp = deliveryPerformance(s);
  const score = computeScore(s);
  const tasks = getTasks(s);
  const short = shortages(s);
  const onShift = Object.values(s.employees).filter((e) => e.role === 'OPERATOR' && e.shift === shift && !((e.absentUntil ?? -1) > s.t)).length;
  const running = Object.values(s.machines).filter((m) => m.status === 'RUNNING').length;
  const down = Object.values(s.machines).filter((m) => m.status === 'STOPPED').length;
  return (
    <div>
      <PageHeader
        title="Plant cockpit"
        sap="Plant 1000 · Gliwice (training)"
        sub={
          <>
            {c.weekday}, day {c.day} · {SHIFT_NAMES[shift]} shift · {onShift} operators on shift · {running} of {MACHINES.length} machines running
            {down > 0 && <span className="ml-1 text-[oklch(0.78_0.14_25)]">· {down} stopped</span>}
          </>
        }
      >
        <Button variant="primary" icon={<Box className="size-4" />} onClick={() => navigate('#/factory')}>
          Open 3D factory
        </Button>
      </PageHeader>

      {/* KPI strip — one control-room band, not separate cards */}
      <section aria-label="Key figures" className="mx-6 mt-5 grid grid-cols-2 overflow-hidden rounded-lg border border-line-soft bg-s1 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label="OEE" value={oee.hasData ? `${(oee.oee * 100).toFixed(1)} %` : '—'} note={oee.hasData ? `A ${(oee.A * 100).toFixed(0)} · P ${(oee.P * 100).toFixed(0)} · Q ${(oee.Q * 100).toFixed(1)}` : 'No production yet'} tone={oee.hasData ? (oee.oee >= 0.75 ? 'ok' : oee.oee >= 0.6 ? 'warn' : 'bad') : undefined} />
        <Kpi label="Parts processed" value={(oee.good + oee.scrap).toLocaleString('en-US')} note={`${oee.scrap} scrap · ${oee.good + oee.scrap ? ((oee.scrap / (oee.good + oee.scrap)) * 100).toFixed(2) : '0.00'} %`} />
        <Kpi label="On-time delivery" value={dp === null ? '—' : `${(dp * 100).toFixed(0)} %`} note={`${s.stats.deliveriesOnTime} on time · ${s.stats.deliveriesLate} late`} tone={dp === null ? undefined : dp >= 0.95 ? 'ok' : 'warn'} />
        <Kpi label="Inventory value" value={fmtEur(inventoryValue(s))} note={short.length ? `${short.length} below safety stock` : 'All above safety stock'} tone={short.length ? 'warn' : undefined} />
        <Kpi label="Penalties & claims" value={fmtEur(s.stats.penalties)} note={`${s.stats.complaints} customer complaint(s)`} tone={s.stats.penalties > 0 ? 'bad' : undefined} />
        <Kpi label="Plant score" value={`${score.total}`} note="of 1,000 — see Analytics" />
      </section>

      <div className="mx-6 mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)]">
        <Panel title="Live plant layout" sub="Click a machine to inspect it in 3D" actions={<Legendlet />}>
          <div className="p-3">
            <PlantMap s={s} />
          </div>
        </Panel>
        <Panel
          title="Needs attention"
          sub={`${tasks.length} open task${tasks.length === 1 ? '' : 's'} in the worklist`}
          actions={
            <Button size="sm" variant="ghost" onClick={() => useApp.getState().setDrawer('tasks')}>
              All tasks
            </Button>
          }
          bodyClass="overflow-y-auto max-h-[420px]"
        >
          {tasks.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-3">Nothing waiting. Create orders, check stock or speed up time.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {tasks.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => go(t.route)} className="group flex w-full cursor-pointer items-start gap-3 px-4 py-2.5 text-left hover:bg-s2">
                    <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', t.severity === 'critical' ? 'bg-bad' : t.severity === 'high' ? 'bg-warn' : 'bg-ink-4')} aria-label={t.severity} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink">{t.title}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {t.detail} · {ROLES[t.role].short}
                      </span>
                    </span>
                    <ArrowRight className="mt-1 size-4 text-ink-4 group-hover:text-ink-2" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {s.events.length > 0 && (
            <div className="border-t border-line-soft">
              <div className="px-4 pt-3 text-xs font-medium text-ink-3">Latest event</div>
              <ul>
                <EventItem e={s.events[0]} />
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="mx-6 mt-4 grid gap-4 xl:grid-cols-2">
        <OrdersPanel s={s} />
        <MachinesPanel s={s} />
      </div>

      <div className="mx-6 mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Output per hour" sub="Parts processed on all work centres">
          <div className="h-56 p-3">
            {s.stats.outputByHour.length < 1 ? (
              <ChartEmpty>The first hourly snapshot appears after one simulated hour.</ChartEmpty>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="85%">
                  <BarChart data={s.stats.outputByHour.slice(-16)} barGap={2}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="h" tickFormatter={hourLabel} {...axisProps} minTickGap={16} />
                    <YAxis {...axisProps} width={40} />
                    <Tooltip cursor={{ fill: 'oklch(0.3 0.012 250 / 0.4)' }} content={<ChartTooltip unit=" pcs" labelFmt={(l) => hourLabel(Number(l))} />} />
                    <RBar dataKey="good" name="Good" stackId="a" fill={SERIES.blue} radius={[0, 0, 0, 0]} />
                    <RBar dataKey="scrap" name="Scrap" stackId="a" fill={SERIES.orange} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <Legend items={[{ label: 'Good', color: SERIES.blue }, { label: 'Scrap', color: SERIES.orange }]} />
              </>
            )}
          </div>
        </Panel>
        <Panel title="OEE trend" sub="Hourly, all machines">
          <div className="h-56 p-3">
            {s.stats.oeeByHour.length < 2 ? (
              <ChartEmpty>OEE trend needs at least two hourly snapshots.</ChartEmpty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={s.stats.oeeByHour.slice(-16).map((d) => ({ ...d, oee: d.oee * 100 }))}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="h" tickFormatter={hourLabel} {...axisProps} minTickGap={16} />
                  <YAxis domain={[0, 100]} {...axisProps} width={36} unit="%" />
                  <Tooltip content={<ChartTooltip unit="%" labelFmt={(l) => hourLabel(Number(l))} />} />
                  <Line type="monotone" dataKey="oee" name="OEE" stroke={SERIES.blue} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--color-s1)', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
        <CustomerPanel s={s} />
      </div>
    </div>
  );
}

function Legendlet() {
  return (
    <div className="hidden items-center gap-3 text-2xs text-ink-3 md:flex">
      {(['RUNNING', 'WARNING', 'STOPPED', 'MAINT', 'IDLE'] as const).map((k) => (
        <span key={k} className="flex items-center gap-1">
          <span className="size-2 rounded-full" style={{ background: `var(--color-${k === 'RUNNING' ? 'ok' : k === 'WARNING' ? 'warn' : k === 'STOPPED' ? 'bad' : k === 'MAINT' ? 'maint' : 'idle'})` }} aria-hidden />
          {k === 'MAINT' ? 'Setup / maint.' : k[0] + k.slice(1).toLowerCase()}
        </span>
      ))}
    </div>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="border-line-soft px-4 py-3 not-last:border-r [&:nth-child(2n)]:max-sm:border-r-0">
      <div className="flex items-center gap-1.5 text-xs text-ink-3">
        {tone && <span className="size-1.5 rounded-full" style={{ background: `var(--color-${tone})` }} aria-hidden />}
        {label}
      </div>
      <div className="tnum mt-0.5 text-xl font-semibold tracking-[-0.01em] text-ink">{value}</div>
      <div className="tnum truncate text-2xs text-ink-3">{note}</div>
    </div>
  );
}

function OrdersPanel({ s }: { s: SimState }) {
  const orders = docsOf(s, 'PP')
    .filter((p) => p.status !== 'COMPLETED' && p.status !== 'CANCELLED')
    .sort((a, b) => a.plannedStart - b.plannedStart);
  return (
    <Panel title="Production orders" sub="Open and running" actions={<Button size="sm" variant="ghost" onClick={() => go('#/production')}>Open PP</Button>}>
      {orders.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-3">No open production orders. Create one in Production (CO01).</p>
      ) : (
        <table className="dtable">
          <thead>
            <tr>
              <th>Order</th>
              <th>Product</th>
              <th className="num">Qty</th>
              <th>Routing progress</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(0, 7).map((p) => {
              const cur = p.ops.find((o) => o.status !== 'CONFIRMED');
              return (
                <tr key={p.id} data-clickable="true" onClick={() => go(`#/production/order/${p.id}`)}>
                  <td><DocLink id={p.id} s={s} /></td>
                  <td className="max-w-[160px] truncate">{MATERIALS[p.product].name.split(' ').slice(0, 2).join(' ')}</td>
                  <td className="num tnum">{p.qty}</td>
                  <td>
                    <div className="flex items-center gap-0.5" aria-label={`${p.ops.filter((o) => o.status === 'CONFIRMED').length} of ${p.ops.length} operations confirmed`}>
                      {p.ops.map((o) => (
                        <span
                          key={o.no}
                          title={`${o.no} ${o.name}: ${o.status.toLowerCase()}`}
                          className="h-2 w-5 rounded-sm"
                          style={{ background: o.status === 'CONFIRMED' ? 'var(--color-ok)' : o.status === 'DONE' ? 'var(--color-warn)' : o.status === 'RUNNING' || o.status === 'SETUP' ? 'var(--color-accent)' : o.status === 'PAUSED' ? 'var(--color-bad)' : 'var(--color-s4)' }}
                        />
                      ))}
                    </div>
                    <div className="mt-0.5 max-w-[220px] truncate text-2xs text-ink-3">{p.waitingReason ?? (cur ? `${cur.no} ${cur.name}` : '')}</div>
                  </td>
                  <td>
                    <DocStatusPill status={p.status} />
                    {p.priority === 'URGENT' && <Badge tone="bad" className="ml-1">Urgent</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function MachinesPanel({ s }: { s: SimState }) {
  const focus = useApp((st) => st.focus);
  return (
    <Panel title="Work centres" sub="Status, current job, wear">
      <table className="dtable">
        <thead>
          <tr>
            <th>Machine</th>
            <th>Status</th>
            <th>Job</th>
            <th className="num">Progress</th>
            <th>Health</th>
          </tr>
        </thead>
        <tbody>
          {MACHINES.map((d) => {
            const m = s.machines[d.id];
            const pp = m.order ? s.docs[m.order] : undefined;
            const op = pp && pp.type === 'PP' ? pp.ops.find((o) => o.no === m.op) : undefined;
            return (
              <tr
                key={d.id}
                data-clickable="true"
                onClick={() => {
                  go('#/factory');
                  setTimeout(() => focus(`machine:${d.id}`), 50);
                }}
              >
                <td className="strong">
                  <span className="mono">{d.id}</span>
                </td>
                <td><MachinePill status={m.status} /></td>
                <td className="max-w-[150px] truncate text-xs">{m.failure ? m.failure.text : op ? `${m.order} / ${op.no}` : m.notice ?? '—'}</td>
                <td className="num tnum text-xs">{op ? `${op.produced}/${op.qtyIn}` : '—'}</td>
                <td className="w-28">
                  <Bar value={m.health / 100} tone={m.health < 35 ? 'bad' : m.health < 60 ? 'warn' : 'ok'} label={`Health ${Math.round(m.health)} %`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function CustomerPanel({ s }: { s: SimState }) {
  const sos = docsOf(s, 'SO')
    .filter((so) => so.status !== 'COMPLETED' && so.status !== 'CANCELLED')
    .sort((a, b) => a.due - b.due);
  return (
    <Panel title="Customer deadlines" sub="Open sales orders" actions={<Button size="sm" variant="ghost" onClick={() => go('#/logistics')}>Open SD</Button>}>
      {sos.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-3">All customer orders are delivered.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {sos.slice(0, 6).map((so) => {
            const left = so.due - s.t;
            return (
              <li key={so.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <DocLink id={so.id} s={s} className="text-xs" />
                    {so.priority === 'URGENT' && <Badge tone="bad">Urgent</Badge>}
                  </div>
                  <div className="truncate text-xs text-ink-3">
                    {so.items[0].qty} × {MATERIALS[so.items[0].material].name.split(' ').slice(0, 2).join(' ')} → {CUSTOMERS[so.customer].city}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cx('tnum text-sm font-medium', left < 0 ? 'text-[oklch(0.78_0.14_25)]' : left < 360 ? 'text-warn' : 'text-ink')}>{left < 0 ? `${fmtDuration(-left)} late` : fmtDuration(left)}</div>
                  <div className="tnum text-2xs text-ink-3">due {fmtTime(so.due)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
