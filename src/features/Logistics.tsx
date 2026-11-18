import { useState } from 'react';
import { PackageCheck, Send, Truck } from 'lucide-react';
import { useApp } from '../store/store';
import { useSim, parseRoute, go } from '../app/hooks';
import {
  CARRIERS,
  CUSTOMERS,
  MATERIALS,
  OUTBOUND_DOORS,
  availableQty,
  createDelivery,
  createSalesOrder,
  createShipment,
  docsOf,
  fmtDateTime,
  fmtDuration,
  fmtEur,
  getDoc,
  inDeliveryQty,
  openSoQty,
  packDelivery,
  pickDelivery,
  postGoodsIssue,
  shipmentCost,
  vehicleBusy,
  type OutboundDelivery,
  type SimState,
} from '../engine';
import { Badge, Bar, Button, Callout, DocStatusPill, Empty, Field, Input, KV, PageHeader, Panel, SectionTitle, Select, Tabs, cx } from '../ui/kit';
import { DocLink, MatName } from '../ui/links';

type Tab = 'orders' | 'create' | 'deliveries' | 'shipments';

export function LogisticsPage() {
  const s = useSim();
  const route = useApp((st) => st.route);
  const { sub, id } = parseRoute(route);
  const tab: Tab = sub === 'create' ? 'create' : sub === 'deliveries' || sub === 'dlv' ? 'deliveries' : sub === 'shipments' ? 'shipments' : 'orders';
  const openSo = docsOf(s, 'SO').filter((x) => x.status !== 'COMPLETED' && x.status !== 'CANCELLED').length;
  const openDlv = docsOf(s, 'DLV').filter((x) => !x.pgi).length;
  const transit = docsOf(s, 'SHP').filter((x) => x.departedAt !== undefined && x.deliveredAt === undefined).length;
  return (
    <div>
      <PageHeader title="Sales & transportation" sap="SD · TM · VA01 · VL01N · VT01N" sub="Customer orders, outbound deliveries, picking, shipments and tracking">
        <span className="text-xs text-ink-3">Freight {fmtEur(s.stats.transportCost)} · penalties {fmtEur(s.stats.penalties)}</span>
      </PageHeader>
      <Tabs
        value={tab}
        onChange={(t) => go(t === 'orders' ? '#/logistics' : `#/logistics/${t}`)}
        tabs={[
          { id: 'orders', label: 'Sales orders', count: openSo },
          { id: 'create', label: 'Create sales order' },
          { id: 'deliveries', label: 'Deliveries', count: openDlv },
          { id: 'shipments', label: 'Transport & tracking', count: transit },
        ]}
      />
      <div className="p-6">
        {tab === 'orders' && <SalesOrders s={s} selected={sub === 'so' ? id : undefined} />}
        {tab === 'create' && <CreateSO s={s} />}
        {tab === 'deliveries' && <Deliveries s={s} selected={sub === 'dlv' ? id : undefined} />}
        {tab === 'shipments' && <Shipments s={s} />}
      </div>
    </div>
  );
}

function SalesOrders({ s, selected }: { s: SimState; selected?: string }) {
  const run = useApp((st) => st.run);
  const sos = docsOf(s, 'SO').sort((a, b) => Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED') || a.due - b.due);
  const active = selected ? getDoc(s, selected, 'SO') : sos.find((x) => x.status !== 'COMPLETED');
  const [qty, setQty] = useState('');
  const [dock, setDock] = useState('0');
  const open = active ? openSoQty(active) - inDeliveryQty(s, active.id) : 0;
  const atp = active ? availableQty(s, active.items[0].material) : 0;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
      <Panel title="Sales orders" sub="VA05">
        {sos.length === 0 ? (
          <Empty title="No sales orders">Create one or wait for customer call-offs in free simulation.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Material</th>
                  <th className="num">Qty</th>
                  <th className="num">Delivered</th>
                  <th>Requested</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sos.map((so) => {
                  const it = so.items[0];
                  const left = so.due - s.t;
                  return (
                    <tr key={so.id} data-clickable="true" data-selected={active?.id === so.id} onClick={() => go(`#/logistics/so/${so.id}`)}>
                      <td className="mono strong">{so.id}</td>
                      <td>
                        <div className="text-ink">{CUSTOMERS[so.customer].name}</div>
                        <div className="text-2xs text-ink-3">{CUSTOMERS[so.customer].city}, {CUSTOMERS[so.customer].country}</div>
                      </td>
                      <td className="max-w-[180px] truncate">{MATERIALS[it.material].name}</td>
                      <td className="num tnum">{it.qty}</td>
                      <td className="num tnum">{it.delivered}</td>
                      <td className={cx('tnum text-xs', so.status !== 'COMPLETED' && left < 0 ? 'text-[oklch(0.78_0.14_25)]' : so.status !== 'COMPLETED' && left < 360 ? 'text-warn' : '')}>
                        {fmtDateTime(so.due)}
                        {so.status !== 'COMPLETED' && <div className="text-2xs">{left < 0 ? `${fmtDuration(-left)} late` : `in ${fmtDuration(left)}`}</div>}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <DocStatusPill status={so.status} />
                          {so.priority === 'URGENT' && <Badge tone="bad">Urgent</Badge>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {active ? (
        <Panel title={<span className="mono">{active.id}</span>} sub={CUSTOMERS[active.customer].name} actions={<DocStatusPill status={active.status} />}>
          <div className="flex flex-col gap-4 p-4">
            <KV
              items={[
                ['Material', <MatName id={active.items[0].material} short />],
                ['Ordered', `${active.items[0].qty} pcs`],
                ['Requested delivery', fmtDateTime(active.due)],
                ['Transit time', `${CUSTOMERS[active.customer].transitHours} h · ${CUSTOMERS[active.customer].km} km`],
                ['Penalty if late', `€${active.penaltyPerHour}/h`],
                ['Available to promise', `${atp} pcs`],
              ]}
            />
            {active.status !== 'COMPLETED' && open > 0 && (
              <section className="flex flex-col gap-3 rounded-md border border-line-soft p-3">
                <SectionTitle>Create outbound delivery · VL01N</SectionTitle>
                {atp < open && <Callout tone="warn">Only {atp} pcs are unrestricted and released. Produce more or deliver partially — blocked or inspection stock never counts.</Callout>}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Delivery quantity" hint={`Open: ${open} pcs`}>{(id) => <Input id={id} type="number" value={qty} placeholder={String(Math.min(open, atp))} onChange={(e) => setQty(e.target.value)} />}</Field>
                  <Field label="Shipping dock">
                    {(id) => (
                      <Select id={id} value={dock} onChange={(e) => setDock(e.target.value)}>
                        {OUTBOUND_DOORS.map((_, i) => (
                          <option key={i} value={i}>
                            Outbound door {i + 1}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
                <Button
                  variant="primary"
                  icon={<PackageCheck className="size-4" />}
                  onClick={() => {
                    const q = qty === '' ? Math.min(open, atp) : Number(qty);
                    const r = run('VL01N', (sim) => createDelivery(sim, active.id, q, Number(dock)));
                    if (r.ok && r.docs?.[0]) go(`#/logistics/dlv/${r.docs[0]}`);
                  }}
                >
                  Create delivery
                </Button>
              </section>
            )}
            <section>
              <SectionTitle>Document flow</SectionTitle>
              <ul className="flex flex-col gap-1">
                {active.refs.map((r) => (
                  <li key={r} className="text-xs"><DocLink id={r} s={s} showType /></li>
                ))}
                {active.refs.length === 0 && <li className="text-xs text-ink-3">No follow-on documents yet.</li>}
              </ul>
            </section>
          </div>
        </Panel>
      ) : (
        <Panel title="Sales order"><Empty title="Select a sales order" /></Panel>
      )}
    </div>
  );
}

function CreateSO({ s }: { s: SimState }) {
  const run = useApp((st) => st.run);
  const fgs = Object.values(MATERIALS).filter((m) => m.type === 'FIN');
  const [cust, setCust] = useState(Object.keys(CUSTOMERS)[0]);
  const [mat, setMat] = useState(fgs[0].id);
  const [qty, setQty] = useState('200');
  const [hours, setHours] = useState('24');
  const [prio, setPrio] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  return (
    <Panel title={<>Create sales order <span className="mono ml-1 text-xs font-normal text-ink-3">VA01</span></>} className="max-w-[560px]">
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const r = run('VA01', (sim) => createSalesOrder(sim, cust, mat, Number(qty), sim.t + Number(hours) * 60, prio));
          if (r.ok && r.docs?.[0]) go(`#/logistics/so/${r.docs[0]}`);
        }}
      >
        <Field label="Sold-to party">{(id) => <Select id={id} value={cust} onChange={(e) => setCust(e.target.value)}>{Object.values(CUSTOMERS).map((c) => <option key={c.id} value={c.id}>{c.name} — {c.city}, {c.country}</option>)}</Select>}</Field>
        <Field label="Material">{(id) => <Select id={id} value={mat} onChange={(e) => setMat(e.target.value)}>{fgs.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}</Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Quantity (pcs)" required>{(id) => <Input id={id} type="number" value={qty} onChange={(e) => setQty(e.target.value)} />}</Field>
          <Field label="Delivery in (h)" required hint={fmtDateTime(s.t + Number(hours || 0) * 60)}>{(id) => <Input id={id} type="number" value={hours} onChange={(e) => setHours(e.target.value)} />}</Field>
          <Field label="Priority">{(id) => <Select id={id} value={prio} onChange={(e) => setPrio(e.target.value as 'NORMAL' | 'URGENT')}><option value="NORMAL">Normal</option><option value="URGENT">Urgent</option></Select>}</Field>
        </div>
        <Button type="submit" variant="primary">Create sales order</Button>
      </form>
    </Panel>
  );
}

function Deliveries({ s, selected }: { s: SimState; selected?: string }) {
  const list = docsOf(s, 'DLV').sort((a, b) => Number(a.pgi) - Number(b.pgi) || b.createdAt - a.createdAt);
  const active = selected ? getDoc(s, selected, 'DLV') : list.find((d) => !d.pgi);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Panel title="Outbound deliveries" sub="VL06O">
        {list.length === 0 ? (
          <Empty icon={<Truck className="size-6" />} title="No deliveries">Create a delivery from a sales order.</Empty>
        ) : (
          <table className="dtable">
            <thead>
              <tr>
                <th>Delivery</th>
                <th>Customer</th>
                <th className="num">Qty</th>
                <th>Dock</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} data-clickable="true" data-selected={active?.id === d.id} onClick={() => go(`#/logistics/dlv/${d.id}`)}>
                  <td className="mono strong">{d.id}</td>
                  <td className="max-w-[160px] truncate">{CUSTOMERS[d.customer].name}</td>
                  <td className="num tnum">{d.items[0].qty}</td>
                  <td className="tnum">{d.dock + 1}</td>
                  <td><DeliverySteps s={s} d={d} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {active ? <DeliveryDetail s={s} d={active} key={active.id} /> : <Panel title="Delivery"><Empty title="Select a delivery" /></Panel>}
    </div>
  );
}

function DeliverySteps({ s, d }: { s: SimState; d: OutboundDelivery }) {
  const shp = getDoc(s, d.shipment, 'SHP');
  const steps = [
    { label: 'Pick', done: d.pickStatus === 'DONE', active: d.pickStatus === 'IN_PROGRESS' },
    { label: 'Pack', done: d.packed },
    { label: 'Truck', done: !!shp?.loadedAt, active: !!shp && !shp.loadedAt },
    { label: 'GI', done: d.pgi },
  ];
  return (
    <ol className="flex items-center gap-1" aria-label="Delivery progress">
      {steps.map((st) => (
        <li key={st.label} className={cx('rounded px-1.5 py-px text-2xs', st.done ? 'bg-ok-soft text-ok' : st.active ? 'bg-accent-soft text-[oklch(0.82_0.09_248)]' : 'bg-s3 text-ink-4')}>
          {st.label}
        </li>
      ))}
    </ol>
  );
}

function DeliveryDetail({ s, d }: { s: SimState; d: OutboundDelivery }) {
  const run = useApp((st) => st.run);
  const shp = getDoc(s, d.shipment, 'SHP');
  const it = d.items[0];
  const m = MATERIALS[it.material];
  const carriers = Object.values(CARRIERS);
  const [carrier, setCarrier] = useState(carriers[0].id);
  const [vehicle, setVehicle] = useState(carriers[0].vehicles[0].id);
  const [loadIn, setLoadIn] = useState('30');
  const hu = d.handlingUnits || Math.ceil(it.qty / m.perPallet);
  const pickWts = docsOf(s, 'WT').filter((w) => w.ref === d.id && w.kind === 'PICK');
  const so = getDoc(s, d.salesOrder, 'SO');
  return (
    <Panel title={<span className="mono">{d.id}</span>} sub={`${it.qty} × ${m.name} → ${CUSTOMERS[d.customer].name}`} actions={<DocStatusPill status={d.status} />}>
      <div className="flex flex-col gap-5 p-4">
        <KV
          cols={3}
          items={[
            ['Sales order', <DocLink id={d.salesOrder} s={s} />],
            ['Requested', so ? fmtDateTime(so.due) : '—'],
            ['Dock', `Outbound ${d.dock + 1}`],
            ['Picked', `${it.picked} / ${it.qty}`],
            ['Handling units', d.packed ? `${d.handlingUnits} pallets` : `≈ ${hu} pallets`],
            ['Shipment', shp ? <DocLink id={shp.id} s={s} /> : '—'],
          ]}
        />

        <section className="rounded-md border border-line-soft p-3">
          <SectionTitle>1 · Picking</SectionTitle>
          {d.pickStatus === 'NONE' ? (
            <Button variant="primary" onClick={() => run('VL_PICK', (sim) => pickDelivery(sim, d.id))}>Create picking tasks (FIFO)</Button>
          ) : (
            <>
              <ul className="flex flex-col gap-1">
                {it.picks.map((p) => {
                  const wt = pickWts.find((w) => w.id === p.wt);
                  return (
                    <li key={p.wt} className="flex items-center gap-2 text-xs">
                      <span className="mono text-ink-2">{p.bin}</span>
                      <span className="mono text-ink-3">{p.batch}</span>
                      <span className="tnum">{p.qty} pcs</span>
                      <span className="ml-auto">{wt?.status === 'COMPLETED' ? <Badge tone="ok">At dock</Badge> : wt?.status === 'IN_PROGRESS' ? <Badge tone="accent">Forklift</Badge> : <Badge>Queued</Badge>}</span>
                    </li>
                  );
                })}
              </ul>
              {d.pickStatus === 'IN_PROGRESS' && it.picks.reduce((a, p) => a + p.qty, 0) < it.qty && (
                <Button size="sm" className="mt-2" onClick={() => run('VL_PICK', (sim) => pickDelivery(sim, d.id))}>Pick remaining</Button>
              )}
            </>
          )}
        </section>

        <section className="rounded-md border border-line-soft p-3">
          <SectionTitle>2 · Packing</SectionTitle>
          {d.packed ? <p className="text-sm text-ok">Packed into {d.handlingUnits} handling units.</p> : <Button disabled={d.pickStatus !== 'DONE'} variant={d.pickStatus === 'DONE' ? 'primary' : 'secondary'} onClick={() => run('VL_PICK', (sim) => packDelivery(sim, d.id))}>Pack into handling units</Button>}
        </section>

        <section className="rounded-md border border-line-soft p-3">
          <SectionTitle>3 · Shipment · VT01N</SectionTitle>
          {shp ? (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-ink-2">
                {CARRIERS[shp.carrier].name}, {CARRIERS[shp.carrier].vehicles.find((v) => v.id === shp.vehicle)?.plate} · freight {fmtEur(shp.cost)}
              </p>
              <p className="text-xs text-ink-3">
                {shp.departedAt !== undefined
                  ? `Departed ${fmtDateTime(shp.departedAt)} · ETA ${fmtDateTime(shp.eta!)}`
                  : shp.loadedAt !== undefined
                    ? 'Truck loaded — post goods issue.'
                    : shp.loadingStart !== undefined
                      ? `Loading since ${fmtDateTime(shp.loadingStart)} (30 min)`
                      : shp.arrivedAt !== undefined
                        ? 'Truck at dock — loading starts when picking and packing are complete.'
                        : `Truck expected ${fmtDateTime(shp.plannedLoad)}`}
              </p>
              {shp.loadingStart !== undefined && shp.loadedAt === undefined && <Bar value={(s.t - shp.loadingStart) / 30} label="Loading progress" />}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                {carriers.map((c) => (
                  <label key={c.id} className={cx('press flex cursor-pointer items-center gap-3 rounded-md border p-2.5', carrier === c.id ? 'border-accent bg-accent-soft' : 'border-line-soft hover:bg-s2')}>
                    <input
                      type="radio"
                      name="carrier"
                      checked={carrier === c.id}
                      onChange={() => {
                        setCarrier(c.id);
                        setVehicle(c.vehicles[0].id);
                      }}
                      className="accent-[var(--color-accent)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink">{c.name}</span>
                      <span className="tnum block text-xs text-ink-3">€{c.ratePerKm}/km · {Math.round(c.reliability * 100)} % on time</span>
                    </span>
                    <span className="tnum text-sm font-medium text-ink">{fmtEur(shipmentCost(d.customer, c.id))}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vehicle">
                  {(id) => (
                    <Select id={id} value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
                      {CARRIERS[carrier].vehicles.map((v) => (
                        <option key={v.id} value={v.id} disabled={vehicleBusy(s, v.id)}>
                          {v.plate} — {v.type}, {v.pallets} pal{vehicleBusy(s, v.id) ? ' (busy)' : ''}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Truck at dock in">
                  {(id) => (
                    <Select id={id} value={loadIn} onChange={(e) => setLoadIn(e.target.value)}>
                      <option value="15">15 min</option>
                      <option value="30">30 min</option>
                      <option value="60">1 h</option>
                      <option value="120">2 h</option>
                      <option value="240">4 h</option>
                    </Select>
                  )}
                </Field>
              </div>
              <Button variant="primary" icon={<Truck className="size-4" />} onClick={() => run('VT01N', (sim) => createShipment(sim, d.id, carrier, vehicle, Number(loadIn)))}>
                Book truck
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-md border border-line-soft p-3">
          <SectionTitle>4 · Post goods issue · movement 601</SectionTitle>
          {d.pgi ? (
            <p className="text-sm text-ok">Goods issued — the truck has left the plant.</p>
          ) : (
            <Button variant={shp?.loadedAt !== undefined ? 'primary' : 'secondary'} icon={<Send className="size-4" />} onClick={() => run('VL_PGI', (sim) => postGoodsIssue(sim, d.id))}>
              Post goods issue
            </Button>
          )}
        </section>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- transport map
const GEO: Record<string, [number, number]> = { GLIWICE: [18.67, 50.29], 'C-2001': [18.99, 50.13], 'C-2002': [18.6, 50.32], 'C-2003': [17.03, 51.11], 'C-2004': [12.49, 50.72], 'C-2005': [11.43, 48.77] };
const proj = ([lon, lat]: [number, number]): [number, number] => [(lon - 10.6) * 62, (52.2 - lat) * 92];

function Shipments({ s }: { s: SimState }) {
  const list = docsOf(s, 'SHP').sort((a, b) => Number(!!a.deliveredAt) - Number(!!b.deliveredAt) || b.createdAt - a.createdAt);
  const g = proj(GEO.GLIWICE);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Route map" sub="Gliwice plant → customers in Poland and Germany (schematic)">
        <div className="p-3">
          <svg viewBox="-10 -10 540 330" className="h-auto w-full" role="img" aria-label="Transport routes">
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`v${i}`} x1={i * 62} y1={-10} x2={i * 62} y2={320} stroke="oklch(0.27 0.012 250)" strokeWidth={0.6} />
            ))}
            {Array.from({ length: 4 }, (_, i) => (
              <line key={`h${i}`} x1={-10} y1={i * 92} x2={530} y2={i * 92} stroke="oklch(0.27 0.012 250)" strokeWidth={0.6} />
            ))}
            <polyline points={[[14.2, 53.6], [14.6, 52.6], [14.75, 51.6], [15.0, 51.0], [14.3, 50.9], [12.9, 50.4], [12.1, 50.3], [13.8, 48.8]].map((p) => proj(p as [number, number]).join(',')).join(' ')} fill="none" stroke="oklch(0.45 0.02 250)" strokeWidth={1.2} strokeDasharray="5 4" />
            <text x={proj([19.8, 51.9])[0]} y={proj([19.8, 51.9])[1]} fill="oklch(0.5 0.012 250)" fontSize={22} fontWeight={600}>PL</text>
            <text x={proj([11.2, 51.9])[0]} y={proj([11.2, 51.9])[1]} fill="oklch(0.5 0.012 250)" fontSize={22} fontWeight={600}>DE</text>
            {Object.keys(CUSTOMERS).map((c) => {
              const p = proj(GEO[c]);
              return <line key={c} x1={g[0]} y1={g[1]} x2={p[0]} y2={p[1]} stroke="oklch(0.36 0.04 248)" strokeWidth={1.4} />;
            })}
            {list
              .filter((x) => x.departedAt !== undefined && x.deliveredAt === undefined && x.eta !== undefined)
              .map((x) => {
                const dlv = getDoc(s, x.deliveries[0], 'DLV');
                if (!dlv) return null;
                const p = proj(GEO[dlv.customer]);
                const k = Math.min(1, (s.t - x.departedAt!) / Math.max(1, x.eta! - x.departedAt!));
                return (
                  <g key={x.id}>
                    <line x1={g[0]} y1={g[1]} x2={g[0] + (p[0] - g[0]) * k} y2={g[1] + (p[1] - g[1]) * k} stroke="oklch(0.82 0.145 80)" strokeWidth={2.4} />
                    <circle cx={g[0] + (p[0] - g[0]) * k} cy={g[1] + (p[1] - g[1]) * k} r={6} fill="oklch(0.82 0.145 80)" stroke="oklch(0.2 0.01 250)" strokeWidth={1.5} />
                  </g>
                );
              })}
            <circle cx={g[0]} cy={g[1]} r={7} fill="oklch(0.7 0.135 248)" />
            <text x={g[0] + 10} y={g[1] + 16} fill="oklch(0.9 0.01 250)" fontSize={12} fontWeight={600}>Gliwice plant</text>
            {Object.values(CUSTOMERS).map((c) => {
              if (c.id === 'C-2002') return null;
              const p = proj(GEO[c.id]);
              return (
                <g key={c.id}>
                  <circle cx={p[0]} cy={p[1]} r={4.5} fill="oklch(0.85 0.01 250)" />
                  <text x={p[0] + 8} y={p[1] - 6} fill="oklch(0.8 0.01 250)" fontSize={11}>{c.city}</text>
                  <text x={p[0] + 8} y={p[1] + 7} fill="oklch(0.6 0.012 250)" fontSize={9}>{c.km} km · {c.transitHours} h</text>
                </g>
              );
            })}
          </svg>
        </div>
      </Panel>
      <Panel title="Shipments" sub="VT11 · tracking">
        {list.length === 0 ? (
          <Empty icon={<Truck className="size-6" />} title="No shipments">Book a truck from a packed delivery.</Empty>
        ) : (
          <table className="dtable">
            <thead>
              <tr>
                <th>Shipment</th>
                <th>Carrier</th>
                <th>Route</th>
                <th>Status</th>
                <th className="num">Freight</th>
              </tr>
            </thead>
            <tbody>
              {list.map((x) => {
                const dlv = getDoc(s, x.deliveries[0], 'DLV');
                const so = getDoc(s, dlv?.salesOrder, 'SO');
                const late = x.deliveredAt !== undefined && so && x.deliveredAt > so.due;
                const status = x.deliveredAt !== undefined ? (late ? 'Delivered late' : 'Delivered on time') : x.departedAt !== undefined ? `In transit · ETA ${fmtDateTime(x.eta!)}` : x.loadedAt !== undefined ? 'Loaded' : x.arrivedAt !== undefined ? 'At dock' : `Expected ${fmtDateTime(x.plannedLoad)}`;
                return (
                  <tr key={x.id} data-clickable="true" onClick={() => dlv && go(`#/logistics/dlv/${dlv.id}`)}>
                    <td className="mono strong">{x.id}</td>
                    <td>{CARRIERS[x.carrier].name}</td>
                    <td className="text-xs">{x.route}</td>
                    <td>
                      <Badge tone={x.deliveredAt !== undefined ? (late ? 'bad' : 'ok') : x.departedAt !== undefined ? 'accent' : 'warn'}>{status}</Badge>
                    </td>
                    <td className="num tnum">{fmtEur(x.cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
