import { useState } from 'react';
import { Hammer, Wrench } from 'lucide-react';
import { useApp } from '../store/store';
import { useSim, parseRoute, go } from '../app/hooks';
import {
  FAILURES,
  GROUP_NAMES,
  MACHINES,
  MATERIALS,
  SKILL_NAMES,
  availableQty,
  completeMaintOrder,
  createMaintOrder,
  createPR,
  createPmNotification,
  docsOf,
  failureModeFor,
  fmtDateTime,
  fmtDuration,
  fmtEur,
  getDoc,
  machineDef,
  machineOee,
  shiftOf,
  type SimState,
} from '../engine';
import { Badge, Bar, Button, Callout, DocStatusPill, Empty, Field, Input, KV, MachinePill, PageHeader, Panel, SectionTitle, Select, Tabs, cx } from '../ui/kit';
import { DocLink } from '../ui/links';

type Tab = 'equipment' | 'notifications' | 'orders' | 'spares' | 'techs';

export function MaintenancePage() {
  const s = useSim();
  const route = useApp((st) => st.route);
  const { sub, id } = parseRoute(route);
  const tab: Tab = (['notifications', 'orders', 'spares', 'techs'] as Tab[]).includes(sub as Tab) ? (sub as Tab) : 'equipment';
  const down = Object.values(s.machines).filter((m) => m.failure).length;
  const openNotif = docsOf(s, 'PMN').filter((n) => n.status !== 'COMPLETED' && n.status !== 'CANCELLED').length;
  const openMo = docsOf(s, 'MO').filter((m) => m.status !== 'COMPLETED').length;
  return (
    <div>
      <PageHeader title="Maintenance" sap="PM · IW21 · IW31 · IW41" sub="Equipment, breakdowns, maintenance orders, technicians and spare parts">
        {down > 0 && <Badge tone="bad" dot>{down} machine(s) down</Badge>}
        <span className="text-xs text-ink-3">Maintenance cost {fmtEur(s.stats.maintenanceCost)}</span>
      </PageHeader>
      <Tabs
        value={tab}
        onChange={(t) => go(t === 'equipment' ? '#/maintenance' : `#/maintenance/${t}`)}
        tabs={[
          { id: 'equipment', label: 'Equipment' },
          { id: 'notifications', label: 'Notifications', count: openNotif },
          { id: 'orders', label: 'Maintenance orders', count: openMo },
          { id: 'spares', label: 'Spare parts' },
          { id: 'techs', label: 'Technicians' },
        ]}
      />
      <div className="p-6">
        {tab === 'equipment' && <Equipment s={s} selected={sub === 'equipment' ? id : undefined} />}
        {tab === 'notifications' && <Notifications s={s} />}
        {tab === 'orders' && <Orders s={s} />}
        {tab === 'spares' && <Spares s={s} />}
        {tab === 'techs' && <Techs s={s} />}
      </div>
    </div>
  );
}

function Equipment({ s, selected }: { s: SimState; selected?: string }) {
  const active = selected && s.machines[selected] ? selected : MACHINES.find((d) => s.machines[d.id].failure)?.id ?? MACHINES[0].id;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
      <Panel title="Equipment list" sub="IE03">
        <div className="overflow-x-auto">
          <table className="dtable">
            <thead>
              <tr>
                <th>Equipment</th>
                <th>Work centre</th>
                <th>Status</th>
                <th>Health</th>
                <th className="num">OEE</th>
                <th className="num">Downtime</th>
              </tr>
            </thead>
            <tbody>
              {MACHINES.map((d) => {
                const m = s.machines[d.id];
                const o = machineOee(m);
                return (
                  <tr key={d.id} data-clickable="true" data-selected={active === d.id} onClick={() => go(`#/maintenance/equipment/${d.id}`)}>
                    <td>
                      <div className="mono text-ink">{d.id}</div>
                      <div className="text-2xs text-ink-3">{d.name}</div>
                    </td>
                    <td className="text-xs">{GROUP_NAMES[d.group]}</td>
                    <td><MachinePill status={m.status} /></td>
                    <td className="w-28">
                      <Bar value={m.health / 100} tone={m.health < 35 ? 'bad' : m.health < 60 ? 'warn' : 'ok'} label={`Health ${Math.round(m.health)} %`} />
                      <div className="tnum mt-0.5 text-2xs text-ink-3">{Math.round(m.health)} %</div>
                    </td>
                    <td className="num tnum">{o ? `${(o.oee * 100).toFixed(0)} %` : '—'}</td>
                    <td className="num tnum">{fmtDuration(m.downMin)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <EquipmentDetail s={s} id={active} key={active} />
    </div>
  );
}

function EquipmentDetail({ s, id }: { s: SimState; id: string }) {
  const run = useApp((st) => st.run);
  const d = machineDef(id);
  const m = s.machines[id];
  const mo = getDoc(s, m.maintOrder, 'MO');
  const mode = m.failure ? failureModeFor(s, id) : undefined;
  const shift = shiftOf(s.t);
  const techs = Object.values(s.employees).filter((e) => e.role === 'TECH');
  const recommended = techs.find((t) => t.shift === shift && !t.busyWith && (!mode || t.skill === mode.skill));
  const [tech, setTech] = useState(recommended?.id ?? '');
  const [desc, setDesc] = useState('');
  const notif = docsOf(s, 'PMN').find((n) => n.machine === id && n.status !== 'COMPLETED' && n.status !== 'CANCELLED');
  const kind = m.failure ? 'PM01' : 'PM02';
  const part = mode?.part ?? ({ PRESS: 'SP-HYD-SEAL', WELD: 'SP-WELD-TIP', TRIM: 'SP-LASER-NOZ', BLANK: 'SP-LASER-NOZ', KTL: 'SP-BELT', HOTFORM: 'SP-THERMO' } as Record<string, string>)[d.group];
  const partQty = mode?.partQty ?? (part ? 1 : 0);
  const history = docsOf(s, 'MO').filter((x) => x.machine === id).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <Panel title={<span className="mono">{id}</span>} sub={d.name} actions={<MachinePill status={m.status} />}>
      <div className="flex flex-col gap-5 p-4">
        <KV
          cols={2}
          items={[
            ['Technology', <span className="whitespace-normal">{d.tech}</span>],
            ['Health', `${Math.round(m.health)} %`],
            ['Running time', fmtDuration(m.runMin)],
            ['Downtime', fmtDuration(m.downMin)],
            ['Last maintenance', m.lastPmAt < 0 ? 'before simulation' : fmtDateTime(m.lastPmAt)],
            ['Open notification', notif ? <DocLink id={notif.id} s={s} /> : '—'],
          ]}
        />
        {m.failure && (
          <Callout tone="bad" title={`Breakdown: ${m.failure.text}`}>
            Since {fmtDateTime(m.failure.since)}. Required skill: <b className="text-ink">{SKILL_NAMES[mode!.skill]}</b>
            {mode?.part ? <> · spare part <b className="text-ink">{MATERIALS[mode.part].name}</b> × {mode.partQty}</> : ' · no spare part needed'} · estimated repair {fmtDuration(mode!.durationMin)}.
          </Callout>
        )}
        {mo ? (
          <section className="rounded-md border border-line-soft p-3">
            <SectionTitle>Maintenance order in progress</SectionTitle>
            <KV
              items={[
                ['Order', <DocLink id={mo.id} s={s} />],
                ['Type', mo.kind],
                ['Technician', mo.technician ? s.employees[mo.technician].name : '—'],
                ['Work', mo.workDoneAt !== undefined ? 'Finished — confirm' : `${Math.max(0, Math.round((mo.startedAt ?? s.t) + mo.durationMin - s.t))} min remaining`],
              ]}
            />
            {mo.workDoneAt === undefined && <Bar className="mt-3" tone="maint" value={(s.t - (mo.startedAt ?? s.t)) / mo.durationMin} label="Repair progress" />}
            <Button className="mt-3" variant="primary" disabled={mo.workDoneAt === undefined} onClick={() => run('IW41', (sim) => completeMaintOrder(sim, mo.id))}>
              Confirm order (IW41)
            </Button>
          </section>
        ) : (
          <section className="flex flex-col gap-3 rounded-md border border-line-soft p-3">
            <SectionTitle>
              {kind === 'PM01' ? 'Create corrective maintenance order' : 'Plan preventive maintenance'} · IW31 · {kind}
            </SectionTitle>
            {kind === 'PM02' && <p className="text-xs text-ink-3">Planned downtime of about 1.5 h restores machine health to 100 % and lowers breakdown and scrap risk. Any running operation pauses meanwhile.</p>}
            <Field label="Technician" required hint={`On shift now: shift ${shift}. ${mode ? `Needs ${SKILL_NAMES[mode.skill]} skill.` : ''}`}>
              {(fid) => (
                <Select id={fid} value={tech} onChange={(e) => setTech(e.target.value)}>
                  <option value="">Select a technician…</option>
                  {techs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {SKILL_NAMES[t.skill!]}, shift {t.shift}
                      {t.shift !== shift ? ' (off shift)' : ''}
                      {t.busyWith ? ` (busy ${t.busyWith})` : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {part && (
              <p className="text-xs text-ink-2">
                Spare part: {MATERIALS[part].name} × {partQty} — <span className={availableQty(s, part) >= partQty ? 'text-ok' : 'text-[oklch(0.78_0.14_25)]'}>{availableQty(s, part)} in stock</span>
              </p>
            )}
            <Field label="Description (optional)">{(fid) => <Input id={fid} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={mode ? `Repair: ${mode.text}` : 'Preventive maintenance'} />}</Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Wrench className="size-3.5" />} onClick={() => run('IW31', (sim) => createMaintOrder(sim, { machine: id, kind, technician: tech, notification: notif?.id, description: desc || undefined }))}>
                Create & release order
              </Button>
              {!notif && !m.failure && (
                <Button variant="ghost" onClick={() => run('IW21', (sim) => createPmNotification(sim, id, 'M1', desc || 'Maintenance request from equipment record'))}>
                  Report problem (IW21)
                </Button>
              )}
            </div>
          </section>
        )}
        <section>
          <SectionTitle>Maintenance history</SectionTitle>
          {history.length === 0 ? (
            <p className="text-xs text-ink-3">No maintenance orders in this simulation yet. Typical failure modes: {FAILURES[d.group].map((f) => f.text).join('; ')}.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-2 text-xs">
                  <DocLink id={h.id} s={s} />
                  <Badge>{h.kind}</Badge>
                  <span className="truncate text-ink-2">{h.description}</span>
                  <span className="tnum ml-auto text-ink-3">{h.status === 'COMPLETED' ? fmtEur(h.cost) : 'open'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Panel>
  );
}

function Notifications({ s }: { s: SimState }) {
  const run = useApp((st) => st.run);
  const [machine, setMachine] = useState(MACHINES[0].id);
  const [text, setText] = useState('');
  const list = docsOf(s, 'PMN').sort((a, b) => Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED') || b.createdAt - a.createdAt);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel title="Maintenance notifications" sub="M1 request · M2 breakdown">
        {list.length === 0 ? (
          <Empty icon={<Hammer className="size-6" />} title="No notifications">Breakdowns create M2 notifications automatically.</Empty>
        ) : (
          <table className="dtable">
            <thead>
              <tr>
                <th>Notification</th>
                <th>Type</th>
                <th>Equipment</th>
                <th>Description</th>
                <th>Created</th>
                <th>Order</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((n) => (
                <tr key={n.id} data-clickable="true" onClick={() => go(`#/maintenance/equipment/${n.machine}`)}>
                  <td className="mono strong">{n.id}</td>
                  <td><Badge tone={n.kind === 'M2' ? 'bad' : 'muted'}>{n.kind}</Badge></td>
                  <td className="mono">{n.machine}</td>
                  <td className="max-w-[260px] truncate text-xs" title={n.description}>{n.description}</td>
                  <td className="tnum text-xs">{fmtDateTime(n.createdAt)}</td>
                  <td>{n.order ? <DocLink id={n.order} s={s} /> : <Button size="sm" onClick={(e) => { e.stopPropagation(); go(`#/maintenance/equipment/${n.machine}`); }}>Create order</Button>}</td>
                  <td><DocStatusPill status={n.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel title={<>Report a problem <span className="mono ml-1 text-xs font-normal text-ink-3">IW21</span></>}>
        <form className="flex flex-col gap-3 p-4" onSubmit={(e) => { e.preventDefault(); const r = run('IW21', (sim) => createPmNotification(sim, machine, 'M1', text)); if (r.ok) setText(''); }}>
          <Field label="Equipment">{(id) => <Select id={id} value={machine} onChange={(e) => setMachine(e.target.value)}>{MACHINES.map((m) => <option key={m.id} value={m.id}>{m.id} — {m.name}</option>)}</Select>}</Field>
          <Field label="Problem description" required>{(id) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} placeholder="Unusual noise at the ram guide" />}</Field>
          <Button type="submit" variant="primary">Create notification</Button>
        </form>
      </Panel>
    </div>
  );
}

function Orders({ s }: { s: SimState }) {
  const run = useApp((st) => st.run);
  const list = docsOf(s, 'MO').sort((a, b) => Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED') || b.createdAt - a.createdAt);
  return (
    <Panel title="Maintenance orders" sub="IW38">
      {list.length === 0 ? (
        <Empty title="No maintenance orders">Create one from the equipment record.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="dtable">
            <thead>
              <tr>
                <th>Order</th>
                <th>Type</th>
                <th>Equipment</th>
                <th>Description</th>
                <th>Technician</th>
                <th>Progress</th>
                <th className="num">Cost</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td><DocLink id={m.id} s={s} /></td>
                  <td><Badge tone={m.kind === 'PM01' ? 'bad' : 'maint'}>{m.kind}</Badge></td>
                  <td className="mono">{m.machine}</td>
                  <td className="max-w-[220px] truncate text-xs">{m.description}</td>
                  <td className="text-xs">{m.technician ? s.employees[m.technician].name : '—'}</td>
                  <td className="w-32">
                    {m.status === 'COMPLETED' ? <DocStatusPill status="COMPLETED" /> : m.workDoneAt !== undefined ? <Badge tone="warn">Confirm</Badge> : <Bar tone="maint" value={(s.t - (m.startedAt ?? s.t)) / m.durationMin} label="Progress" />}
                  </td>
                  <td className="num tnum">{m.cost ? fmtEur(m.cost) : '—'}</td>
                  <td className="text-right">{m.status !== 'COMPLETED' && <Button size="sm" variant="primary" disabled={m.workDoneAt === undefined} onClick={() => run('IW41', (sim) => completeMaintOrder(sim, m.id))}>Confirm</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Spares({ s }: { s: SimState }) {
  const run = useApp((st) => st.run);
  const spares = Object.values(MATERIALS).filter((m) => m.type === 'SPARE');
  return (
    <Panel title="Spare parts store WH04" sub="Stock, usage and reordering">
      <table className="dtable">
        <thead>
          <tr>
            <th>Spare part</th>
            <th className="num">In stock</th>
            <th className="num">Price</th>
            <th>Used for</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {spares.map((m) => {
            const q = availableQty(s, m.id);
            const used = Object.entries(FAILURES).filter(([, fs]) => fs.some((f) => f.part === m.id)).map(([g]) => GROUP_NAMES[g as keyof typeof GROUP_NAMES]);
            const pending = docsOf(s, 'PR').some((p) => p.material === m.id && p.status === 'CREATED') || docsOf(s, 'PO').some((p) => p.status !== 'COMPLETED' && p.items.some((i) => i.material === m.id));
            return (
              <tr key={m.id}>
                <td>
                  <div className="text-ink">{m.name}</div>
                  <div className="mono text-2xs text-ink-3">{m.id}</div>
                </td>
                <td className={cx('num tnum strong', q === 0 && 'text-[oklch(0.78_0.14_25)]')}>{q}</td>
                <td className="num tnum">{fmtEur(m.price)}</td>
                <td className="text-xs">{used.join(', ') || '—'}</td>
                <td className="text-right">
                  {pending ? <Badge tone="accent">On order</Badge> : <Button size="sm" onClick={() => run('ME51N', (sim) => createPR(sim, m.id, 2, 'MAINT'))}>Request 2 (ME51N)</Button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function Techs({ s }: { s: SimState }) {
  const shift = shiftOf(s.t);
  const techs = Object.values(s.employees).filter((e) => e.role === 'TECH');
  return (
    <Panel title="Maintenance technicians" sub={`Current shift: ${shift}`}>
      <table className="dtable">
        <thead>
          <tr>
            <th>Technician</th>
            <th>Skill</th>
            <th>Shift</th>
            <th>Availability</th>
          </tr>
        </thead>
        <tbody>
          {techs.map((t) => (
            <tr key={t.id}>
              <td>
                <div className="text-ink">{t.name}</div>
                <div className="mono text-2xs text-ink-3">{t.id}</div>
              </td>
              <td>{SKILL_NAMES[t.skill!]}</td>
              <td className="tnum">{t.shift}</td>
              <td>{t.busyWith ? <Badge tone="maint">On {t.busyWith}</Badge> : t.shift === shift ? <Badge tone="ok">Available</Badge> : <Badge>Off shift</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
