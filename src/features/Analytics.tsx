import { Bar as RBar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSim } from '../app/hooks';
import { MACHINES, MATERIALS, clock, computeScore, deliveryPerformance, fmtDateTime, fmtEur, fmtQty, inventoryAccuracy, inventoryValue, machineOee, orderFulfillment, pad2, plantOee, shortages, utilization } from '../engine';
import { Bar, KV, PageHeader, Panel } from '../ui/kit';
import { ChartEmpty, ChartTooltip, Legend, SERIES, axisProps, gridProps } from '../ui/charts';

const hourLabel = (h: number) => `${pad2(clock(h * 60).hh)}:00`;

export function AnalyticsPage() {
  const s = useSim();
  const score = computeScore(s);
  const oee = plantOee(s);
  const util = utilization(s).map((u) => ({ ...u, run: u.util * 100, setup: u.setup * 100, down: u.down * 100, idle: Math.max(0, 100 - (u.util + u.setup + u.down) * 100) }));
  const perMachine = MACHINES.map((d) => {
    const o = machineOee(s.machines[d.id]);
    return { id: d.id, A: o ? o.A * 100 : 0, P: o ? o.P * 100 : 0, Q: o ? o.Q * 100 : 0, oee: o ? o.oee * 100 : 0 };
  });
  const ful = orderFulfillment(s);
  const dp = deliveryPerformance(s);
  const st = s.stats;
  const costs = [
    { name: 'Materials consumed', value: st.materialCost },
    { name: 'Conversion (machines + labour)', value: st.conversionCost },
    { name: 'Maintenance', value: st.maintenanceCost },
    { name: 'Freight', value: st.transportCost },
    { name: 'Penalties & claims', value: st.penalties },
  ];
  const totalCost = costs.reduce((a, c) => a + c.value, 0);
  const short = shortages(s);
  return (
    <div>
      <PageHeader title="Analytics" sap="Embedded analytics" sub="KPIs snapshotted hourly from the simulation engine" />
      <div className="grid gap-4 p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Plant performance score" sub={`${score.total} of 1,000 points`}>
          <ul className="flex flex-col gap-3 p-4">
            {score.parts.map((p) => (
              <li key={p.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink">{p.label}</span>
                  <span className="tnum text-ink-2">
                    {p.value} / {p.max}
                  </span>
                </div>
                <Bar value={p.value / p.max} tone={p.value / p.max >= 0.75 ? 'ok' : p.value / p.max >= 0.45 ? 'accent' : 'warn'} className="mt-1" label={p.label} />
                <div className="mt-0.5 text-2xs text-ink-3">{p.note}</div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Business summary">
          <div className="flex flex-col gap-4 p-4">
            <KV
              cols={2}
              items={[
                ['OEE (plant)', oee.hasData ? `${(oee.oee * 100).toFixed(1)} %` : '—'],
                ['Scrap rate', oee.good + oee.scrap ? `${((oee.scrap / (oee.good + oee.scrap)) * 100).toFixed(2)} %` : '—'],
                ['Inventory value', fmtEur(inventoryValue(s))],
                ['Inventory accuracy', `${(inventoryAccuracy(s) * 100).toFixed(2)} %`],
                ['Order fulfilment', `${ful.delivered} / ${ful.total} pcs (${(ful.ratio * 100).toFixed(0)} %)`],
                ['On-time delivery', dp === null ? '—' : `${(dp * 100).toFixed(0)} %`],
                ['Revenue (goods issued)', fmtEur(st.revenue)],
                ['Total cost', fmtEur(totalCost)],
              ]}
            />
            <div>
              <div className="mb-1.5 text-xs font-medium text-ink-2">Manufacturing cost breakdown</div>
              <ul className="flex flex-col gap-1.5">
                {costs.map((c) => (
                  <li key={c.name} className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-3 text-xs">
                    <div>
                      <div className="flex justify-between text-ink-2">
                        <span>{c.name}</span>
                      </div>
                      <Bar value={totalCost ? c.value / totalCost : 0} className="mt-1" label={c.name} tone={c.name.startsWith('Penalties') ? 'bad' : 'accent'} />
                    </div>
                    <span className="tnum text-right text-ink">{fmtEur(c.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>

        <Panel title="OEE by machine" sub="Availability, performance and quality (%)">
          <div className="h-72 p-3">
            {!oee.hasData ? (
              <ChartEmpty>Run production to see OEE per work centre.</ChartEmpty>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="88%">
                  <BarChart data={perMachine} barGap={2} barCategoryGap="22%">
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="id" {...axisProps} interval={0} tick={{ ...axisProps.tick, fontSize: 9 }} />
                    <YAxis domain={[0, 100]} {...axisProps} width={34} />
                    <Tooltip cursor={{ fill: 'oklch(0.3 0.012 250 / 0.4)' }} content={<ChartTooltip unit="%" />} />
                    <RBar dataKey="A" name="Availability" fill={SERIES.blue} radius={[3, 3, 0, 0]} />
                    <RBar dataKey="P" name="Performance" fill={SERIES.orange} radius={[3, 3, 0, 0]} />
                    <RBar dataKey="Q" name="Quality" fill={SERIES.aqua} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <Legend items={[{ label: 'Availability', color: SERIES.blue }, { label: 'Performance', color: SERIES.orange }, { label: 'Quality', color: SERIES.aqua }]} />
              </>
            )}
          </div>
        </Panel>

        <Panel title="Machine utilisation" sub="Share of simulated time (%)">
          <div className="h-72 p-3">
            <ResponsiveContainer width="100%" height="88%">
              <BarChart data={util} layout="vertical" margin={{ left: 6 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" domain={[0, 100]} {...axisProps} />
                <YAxis type="category" dataKey="id" {...axisProps} width={64} tick={{ ...axisProps.tick, fontSize: 10 }} />
                <Tooltip cursor={{ fill: 'oklch(0.3 0.012 250 / 0.4)' }} content={<ChartTooltip unit="%" />} />
                <RBar dataKey="run" name="Running" stackId="u" fill={SERIES.blue} />
                <RBar dataKey="setup" name="Setup" stackId="u" fill={SERIES.violet} />
                <RBar dataKey="down" name="Breakdown / maint." stackId="u" fill={SERIES.orange} />
                <RBar dataKey="idle" name="Idle" stackId="u" fill="oklch(0.34 0.012 250)" />
              </BarChart>
            </ResponsiveContainer>
            <Legend items={[{ label: 'Running', color: SERIES.blue }, { label: 'Setup', color: SERIES.violet }, { label: 'Breakdown / maint.', color: SERIES.orange }, { label: 'Idle', color: 'oklch(0.34 0.012 250)' }]} />
          </div>
        </Panel>

        <Panel title="Inventory value" sub="Hourly snapshot">
          <div className="h-60 p-3">
            {st.inventoryValueByHour.length < 2 ? (
              <ChartEmpty>Needs at least two simulated hours.</ChartEmpty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={st.inventoryValueByHour.slice(-24)}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="h" tickFormatter={hourLabel} {...axisProps} minTickGap={18} />
                  <YAxis {...axisProps} width={56} tickFormatter={(v: number) => `€${Math.round(v / 1000)}k`} />
                  <Tooltip content={<ChartTooltip unit=" €" labelFmt={(l) => hourLabel(Number(l))} />} />
                  <Line type="monotone" dataKey="value" name="Inventory value" stroke={SERIES.blue} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--color-s1)', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel title="Stock below safety stock" sub="Purchased materials">
          {short.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-3">Every material is above its safety stock.</p>
          ) : (
            <table className="dtable">
              <thead>
                <tr>
                  <th>Material</th>
                  <th className="num">Free stock</th>
                  <th className="num">Safety stock</th>
                </tr>
              </thead>
              <tbody>
                {short.map((x) => (
                  <tr key={x.material}>
                    <td>{MATERIALS[x.material].name}</td>
                    <td className="num tnum text-warn">{fmtQty(x.available, MATERIALS[x.material].uom)}</td>
                    <td className="num tnum">{fmtQty(x.safety, MATERIALS[x.material].uom)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Lessons learned" sub="Rejected or wrong transactions and how to correct them" className="xl:col-span-2">
          {st.mistakes.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-3">No mistakes recorded. Validation errors and wrong decisions appear here with the correct procedure.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {[...st.mistakes].reverse().slice(0, 30).map((m, i) => (
                <li key={i} className="grid gap-1 px-4 py-2.5 md:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] md:gap-4">
                  <span className="tnum text-xs text-ink-4">{fmtDateTime(m.t)}</span>
                  <span className="text-sm text-ink">{m.text}</span>
                  <span className="text-sm text-ink-2">
                    <span className="font-medium text-amber">Fix: </span>
                    {m.fix}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
