import { useEffect, useState } from 'react';
import { Eye, Footprints, Gauge, Layers as LayersIcon, Map as MapIcon, Rotate3d, Route, Tag, Users, X } from 'lucide-react';
import { useApp } from '../store/store';
import { useSim, go } from '../app/hooks';
import { FactoryCanvas, type Layers } from '../three/FactoryCanvas';
import { ScreenLabels } from '../three/ScreenLabels';
import {
  BIN_MAP,
  CARRIERS,
  CUSTOMERS,
  GROUP_NAMES,
  MACHINES,
  MATERIALS,
  SUPPLIERS,
  ZONES,
  binFree,
  binLocked,
  fmtDuration,
  fmtQty,
  fmtTime,
  getDoc,
  machineDef,
  machineOee,
  shiftOf,
  type SimState,
} from '../engine';
import { Badge, Bar, Button, KV, MachinePill, cx } from '../ui/kit';
import { DocLink } from '../ui/links';
import { binLabel } from '../three/Storage';
import { TransferForm } from './Warehouse';

const ZONE_TEXT: Record<string, string> = {
  INBOUND: 'Trucks are unloaded at two inbound doors. Goods are counted against the delivery note before the goods receipt is posted.',
  RM: 'Pallet racks for welding wire drums, e-coat IBC containers, weld nuts and tubes. Every slot is a storage bin with its own capacity.',
  SHEET: 'Sheet bundles and press-hardening blanks are stored on dunnage in floor stack bays — up to six 1-tonne bundles per bay.',
  MAINT: 'Spare parts store and workshop. Technicians with mechanical, electrical or hydraulic skills are dispatched from here.',
  LASER: 'Fibre lasers cut blanks from coil (blanking) and trim formed 3D parts. Nozzle wear shows up as cut-quality alarms.',
  STAMP: 'Transfer and progressive presses form cold blanks into crossmembers and brackets. Die changes are setup time.',
  HOTFORM: 'Press hardening: 22MnB5 blanks are heated to about 930 °C in a roller hearth furnace, formed and quenched in a cooled die to reach ~1,500 MPa.',
  WELD: 'Robot cells MAG-weld stamped parts into assemblies; a turntable lets the operator load while the robots weld.',
  KTL: 'Cathodic dip painting: degreasing, rinsing, zinc phosphating, e-coat bath and curing oven give the corrosion protection.',
  MACH: 'Machining centre for flange faces and bores on the axle housing training family.',
  QC: 'CMM and visual inspection. Results are recorded in inspection lots and drive the usage decision.',
  FG: 'High-bay racks for finished goods in mesh containers, one batch per pallet for traceability.',
  SHIP: 'Outbound staging lanes and three loading docks. Goods issue is posted when the truck is loaded.',
};

export default function FactoryPage() {
  const camera = useApp((s) => s.camera);
  const setCamera = useApp((s) => s.setCamera);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const quality = useApp((s) => s.quality);
  const setQuality = useApp((s) => s.setQuality);
  const focus = useApp((s) => s.focus);
  const [layers, setLayers] = useState<Layers>({ labels: true, flows: true, workers: true });
  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  useEffect(
    () => () => {
      document.body.style.cursor = '';
    },
    [],
  );
  return (
    <div className="canvas-host relative h-full w-full bg-bg">
      <FactoryCanvas layers={layers} />
      <ScreenLabels machines={layers.labels && camera !== 'explore'} compact={camera !== 'overview'} />

      {/* toolbar */}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-start gap-2">
        <div role="radiogroup" aria-label="Camera mode" className="overlay-surface pointer-events-auto flex rounded-lg p-1">
          {(
            [
              ['overview', 'Overview', Rotate3d],
              ['map', 'Top-down map', MapIcon],
              ['explore', 'Explore', Footprints],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={camera === id}
              onClick={() => setCamera(id)}
              className={cx('press flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs', camera === id ? 'bg-accent text-accent-ink font-medium' : 'text-ink-2 hover:bg-s3 hover:text-ink')}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <div className="overlay-surface pointer-events-auto flex rounded-lg p-1" role="group" aria-label="Layers">
          <LayerBtn on={layers.labels} onClick={() => toggle('labels')} label="Machine labels" Icon={Tag} />
          <LayerBtn on={layers.flows} onClick={() => toggle('flows')} label="Material flow" Icon={Route} />
          <LayerBtn on={layers.workers} onClick={() => toggle('workers')} label="People" Icon={Users} />
          <LayerBtn on={quality === 'high'} onClick={() => setQuality(quality === 'high' ? 'low' : 'high')} label={quality === 'high' ? 'High quality (shadows, bloom)' : 'Performance mode'} Icon={Gauge} />
        </div>
      </div>

      {/* department jump list */}
      <nav aria-label="Departments" className="overlay-surface absolute top-[60px] left-3 hidden max-h-[calc(100%-200px)] w-48 overflow-y-auto rounded-lg p-1 lg:block">
        <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-2xs font-medium text-ink-3">
          <LayersIcon className="size-3" aria-hidden /> Departments
        </div>
        {ZONES.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => focus(`zone:${z.id}`)}
            className={cx('press flex w-full cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs', selection?.kind === 'zone' && selection.id === z.id ? 'bg-s3 text-ink' : 'text-ink-2 hover:bg-s3 hover:text-ink')}
          >
            <span className="truncate">{z.name}</span>
            <ZoneDot zone={z.id} />
          </button>
        ))}
      </nav>

      {camera === 'explore' && (
        <div className="overlay-surface pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg px-3 py-2 text-xs text-ink-2">
          <Eye className="mr-1.5 inline size-3.5 text-ink-3" aria-hidden />
          <b className="text-ink">W A S D</b> walk · <b className="text-ink">Shift</b> run · <b className="text-ink">drag</b> to look · click a machine to inspect
        </div>
      )}

      <StatusLegend />

      {selection && (
        <aside aria-label="Inspector" className="overlay-surface slide-in-right absolute top-3 right-3 bottom-3 z-[var(--z-canvas-ui)] flex w-[min(380px,calc(100%-24px))] flex-col rounded-xl">
          <button type="button" onClick={() => select(null)} aria-label="Close inspector" className="press absolute top-2.5 right-2.5 z-10 flex size-7 cursor-pointer items-center justify-center rounded text-ink-3 hover:bg-s3 hover:text-ink">
            <X className="size-4" />
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <Inspector />
          </div>
        </aside>
      )}
    </div>
  );
}

function LayerBtn({ on, onClick, label, Icon }: { on: boolean; onClick: () => void; label: string; Icon: typeof Tag }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} title={label} className={cx('press flex size-8 cursor-pointer items-center justify-center rounded-md', on ? 'bg-s3 text-ink' : 'text-ink-4 hover:bg-s3 hover:text-ink-2')}>
      <Icon className="size-4" />
    </button>
  );
}

function ZoneDot({ zone }: { zone: string }) {
  const s = useSim();
  const ms = MACHINES.filter((m) => m.zone === zone).map((m) => s.machines[m.id].status);
  if (!ms.length) return null;
  const worst = ms.includes('STOPPED') ? 'bad' : ms.includes('WARNING') ? 'warn' : ms.includes('MAINT') || ms.includes('SETUP') ? 'maint' : ms.includes('RUNNING') ? 'ok' : 'idle';
  return <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--color-${worst})` }} aria-hidden />;
}

function StatusLegend() {
  return (
    <div className="overlay-surface pointer-events-none absolute right-3 bottom-3 hidden gap-3 rounded-lg px-3 py-2 text-2xs text-ink-2 md:flex" aria-hidden>
      {[
        ['ok', 'Running'],
        ['warn', 'Warning'],
        ['bad', 'Stopped'],
        ['maint', 'Setup / maintenance'],
        ['idle', 'Idle'],
      ].map(([c, l]) => (
        <span key={c} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: `var(--color-${c})` }} />
          {l}
        </span>
      ))}
    </div>
  );
}

function Inspector() {
  const s = useSim();
  const sel = useApp((st) => st.selection)!;
  switch (sel.kind) {
    case 'machine':
      return <MachineInspector s={s} id={sel.id} />;
    case 'bin':
      return <BinInspector s={s} id={sel.id} />;
    case 'zone':
      return <ZoneInspector s={s} id={sel.id} />;
    case 'truck':
      return <TruckInspector s={s} id={sel.id} />;
    case 'forklift':
      return <ForkliftInspector s={s} id={sel.id} />;
    default:
      return null;
  }
}

function Head({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="pr-8">
      <div className="text-2xs font-medium text-ink-3">{kicker}</div>
      <h2 className="mono mt-0.5 text-lg font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

export function machineEta(s: SimState, id: string) {
  const m = s.machines[id];
  const pp = getDoc(s, m.order, 'PP');
  const op = pp?.ops.find((o) => o.no === m.op);
  if (!pp || !op) return undefined;
  const left = m.setupLeft + ((op.qtyIn - op.produced) * op.cycleSec) / 60 / Math.max(0.5, 0.82 + 0.18 * Math.min(1, m.health / 70));
  return s.t + left;
}

function MachineInspector({ s, id }: { s: SimState; id: string }) {
  const d = machineDef(id);
  const m = s.machines[id];
  const pp = getDoc(s, m.order, 'PP');
  const op = pp?.ops.find((o) => o.no === m.op);
  const oee = machineOee(m);
  const op_ = m.operator ? s.employees[m.operator] : undefined;
  const mo = getDoc(s, m.maintOrder, 'MO');
  const eta = machineEta(s, id);
  const notif = Object.values(s.docs).find((x) => x.type === 'PMN' && x.machine === id && x.status !== 'COMPLETED');
  return (
    <div className="flex flex-col gap-4">
      <Head kicker={`${GROUP_NAMES[d.group]} · ${d.zone === 'LASER' ? 'Laser cutting' : ZONES.find((z) => z.id === d.zone)?.name}`} title={id}>
        <p className="text-sm text-ink-2">{d.name}</p>
        <div className="mt-2">
          <MachinePill status={m.status} />
        </div>
      </Head>
      {m.failure && (
        <div className="rounded-md bg-bad-soft px-3 py-2.5 text-sm">
          <div className="font-medium text-[oklch(0.82_0.12_25)]">{m.failure.text}</div>
          <div className="mt-0.5 text-xs text-ink-2">
            Stopped since {fmtTime(m.failure.since)} ({fmtDuration(s.t - m.failure.since)}). {notif ? <>Notification <DocLink id={notif.id} s={s} />.</> : null}
          </div>
        </div>
      )}
      {m.notice && !m.failure && <p className="rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">{m.notice}</p>}
      <KV
        items={[
          ['Current order', pp ? <DocLink id={pp.id} s={s} /> : '—'],
          ['Operation', op ? `${op.no} ${op.name.split('–')[0]}` : '—'],
          ['Output', op ? `${op.produced.toLocaleString('en-US')} / ${op.qtyIn.toLocaleString('en-US')} pcs` : '—'],
          ['Scrap', op ? `${op.scrap} pcs` : '—'],
          ['Efficiency (OEE)', oee ? `${(oee.oee * 100).toFixed(0)} %` : '—'],
          ['Operator', op_ ? `${op_.name} (${op_.id})` : m.order ? 'none on shift' : '—'],
          ['Estimated completion', eta && !m.failure ? fmtTime(eta) : '—'],
          ['Maintenance order', mo ? <DocLink id={mo.id} s={s} /> : '—'],
        ]}
      />
      {op && <Bar value={op.produced / Math.max(1, op.qtyIn)} label="Operation progress" />}
      <div>
        <div className="flex justify-between text-xs text-ink-3">
          <span>Machine health</span>
          <span className="tnum">{Math.round(m.health)} %</span>
        </div>
        <Bar value={m.health / 100} tone={m.health < 35 ? 'bad' : m.health < 60 ? 'warn' : 'ok'} className="mt-1" label="Machine health" />
        <p className="mt-1 text-2xs text-ink-4">Wear {d.wearPerHour} %/h running · last maintenance {m.lastPmAt < 0 ? 'before simulation start' : fmtTime(m.lastPmAt)}</p>
      </div>
      <KV
        cols={2}
        items={[
          ['Technology', <span className="whitespace-normal">{d.tech}</span>],
          ['Rate', `€${d.ratePerHour}/h`],
          ['Good parts (total)', m.goodCount.toLocaleString('en-US')],
          ['Downtime', fmtDuration(m.downMin)],
        ]}
      />
      <div className="flex flex-wrap gap-2 border-t border-line-soft pt-3">
        {pp && <Button size="sm" onClick={() => go(`#/production/order/${pp.id}`)}>Open order</Button>}
        {(m.failure || m.health < 60 || mo) && (
          <Button size="sm" variant={m.failure ? 'danger' : 'secondary'} onClick={() => go(`#/maintenance/equipment/${id}`)}>
            {m.failure && !mo ? 'Create repair order' : mo ? 'Maintenance order' : 'Plan maintenance'}
          </Button>
        )}
        {!m.failure && !mo && <Button size="sm" variant="ghost" onClick={() => go(`#/maintenance/equipment/${id}`)}>Equipment record</Button>}
      </div>
    </div>
  );
}

function BinInspector({ s, id }: { s: SimState; id: string }) {
  const b = BIN_MAP[id];
  const qs = Object.values(s.quants).filter((q) => q.bin === id);
  const [transfer, setTransfer] = useState<string | null>(null);
  if (!b) return null;
  const free = binFree(s, id);
  return (
    <div className="flex flex-col gap-4">
      <Head kicker={binLabel(id)} title={id}>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge>{b.capacity} pallet places</Badge>
          <Badge tone={free === 0 ? 'warn' : 'ok'}>{free} free</Badge>
          {binLocked(s, id) && <Badge tone="bad">Locked</Badge>}
        </div>
      </Head>
      {qs.length === 0 ? (
        <p className="text-sm text-ink-3">Empty bin. Put-away proposals use free bins of the matching storage type.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {qs.map((q) => {
            const m = MATERIALS[q.material];
            return (
              <li key={q.id} className="rounded-md border border-line-soft p-3">
                <div className="text-sm font-medium text-ink">{m.name}</div>
                <div className="mono text-xs text-ink-3">
                  {m.id} · batch {q.batch}
                </div>
                <div className="mt-2">
                  <KV
                    cols={3}
                    items={[
                      ['Available', fmtQty(q.qty, m.uom)],
                      ['Reserved', fmtQty(q.reserved, m.uom)],
                      ['Free', fmtQty(q.qty - q.reserved, m.uom)],
                    ]}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone={q.stockType === 'UNR' ? 'ok' : q.stockType === 'QI' ? 'warn' : 'bad'}>{q.stockType === 'UNR' ? 'Unrestricted' : q.stockType === 'QI' ? 'Quality inspection' : 'Blocked'}</Badge>
                  {q.order && <Badge tone="accent">Staged for {q.order}</Badge>}
                  {q.qty !== q.physical && <span className="sr-only">Book and physical differ</span>}
                </div>
                {transfer === q.id ? (
                  <div className="mt-3">
                    <TransferForm quantId={q.id} onDone={() => setTransfer(null)} />
                  </div>
                ) : (
                  q.stockType === 'UNR' &&
                  !q.order &&
                  q.qty - q.reserved > 0 && (
                    <Button size="sm" className="mt-2" onClick={() => setTransfer(q.id)}>
                      Transfer…
                    </Button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line-soft pt-3">
        <Button size="sm" onClick={() => go(`#/warehouse/bins/${id}`)}>Open in warehouse</Button>
        {qs.length > 0 && <Button size="sm" variant="ghost" onClick={() => go(`#/warehouse/count/${id}`)}>Count this bin</Button>}
      </div>
    </div>
  );
}

function ZoneInspector({ s, id }: { s: SimState; id: string }) {
  const z = ZONES.find((x) => x.id === id)!;
  const ms = MACHINES.filter((m) => m.zone === id);
  const select = useApp((st) => st.select);
  const bins = Object.values(BIN_MAP).filter((b) => b.zone === id && b.type !== 'PSA');
  const cap = bins.reduce((a, b) => a + b.capacity, 0);
  const free = bins.reduce((a, b) => a + binFree(s, b.id), 0);
  return (
    <div className="flex flex-col gap-4">
      <Head kicker={z.sap} title={z.name} />
      <p className="text-sm text-ink-2">{ZONE_TEXT[id]}</p>
      {ms.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {ms.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => select({ kind: 'machine', id: m.id })} className="press flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-line-soft px-3 py-2 text-left hover:bg-s2">
                <span>
                  <span className="mono block text-sm text-ink">{m.id}</span>
                  <span className="block text-xs text-ink-3">{m.name}</span>
                </span>
                <MachinePill status={s.machines[m.id].status} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {cap > 0 && (
        <div>
          <div className="flex justify-between text-xs text-ink-3">
            <span>Storage capacity used</span>
            <span className="tnum">
              {cap - free} / {cap} pallet places
            </span>
          </div>
          <Bar value={(cap - free) / cap} tone={free / cap < 0.15 ? 'warn' : 'accent'} className="mt-1" label="Capacity used" />
        </div>
      )}
    </div>
  );
}

function TruckInspector({ s, id }: { s: SimState; id: string }) {
  const d = s.docs[id];
  if (d?.type === 'IBD') {
    const it = d.items[0];
    return (
      <div className="flex flex-col gap-4">
        <Head kicker="Inbound truck" title={d.carrierPlate}>
          <p className="text-sm text-ink-2">{SUPPLIERS[d.supplier].name}, {SUPPLIERS[d.supplier].city}</p>
        </Head>
        <KV
          items={[
            ['Inbound delivery', <DocLink id={d.id} s={s} />],
            ['Purchase order', <DocLink id={d.po} s={s} />],
            ['Material', MATERIALS[it.material].name],
            ['Delivery note qty', fmtQty(it.qty, MATERIALS[it.material].uom)],
            ['Door', `Inbound ${(d.dock ?? 0) + 1}`],
            ['Arrived', d.arrivedAt !== undefined ? fmtTime(d.arrivedAt) : '—'],
          ]}
        />
        {d.status !== 'COMPLETED' && <Button variant="primary" size="sm" onClick={() => go(`#/warehouse/inbound/${d.id}`)}>Receive goods (MIGO)</Button>}
      </div>
    );
  }
  if (d?.type === 'SHP') {
    const cr = CARRIERS[d.carrier];
    const v = cr.vehicles.find((x) => x.id === d.vehicle);
    const dlv = getDoc(s, d.deliveries[0], 'DLV');
    const state = d.departedAt !== undefined ? 'Departed' : d.loadedAt !== undefined ? 'Loaded — post goods issue' : d.loadingStart !== undefined ? 'Loading' : 'At dock, waiting for picking';
    return (
      <div className="flex flex-col gap-4">
        <Head kicker={`Outbound truck · ${cr.name}`} title={v?.plate ?? d.vehicle}>
          <p className="text-sm text-ink-2">{d.route}</p>
        </Head>
        <Badge tone={d.loadedAt !== undefined && d.departedAt === undefined ? 'warn' : 'accent'}>{state}</Badge>
        <KV
          items={[
            ['Shipment', <DocLink id={d.id} s={s} />],
            ['Delivery', <DocLink id={d.deliveries[0]} s={s} />],
            ['Customer', dlv ? CUSTOMERS[dlv.customer].name : '—'],
            ['Dock', `Outbound ${d.dock + 1}`],
            ['Freight', `€${d.cost.toLocaleString('en-US')}`],
            ['ETA', d.eta ? fmtTime(d.eta) : '—'],
          ]}
        />
        {dlv && !dlv.pgi && <Button variant="primary" size="sm" onClick={() => go(`#/logistics/dlv/${dlv.id}`)}>Open delivery</Button>}
      </div>
    );
  }
  return <p className="text-sm text-ink-3">This truck has left the plant.</p>;
}

function ForkliftInspector({ s, id }: { s: SimState; id: string }) {
  const f = s.forklifts[id];
  const wt = f.task ? getDoc(s, f.task, 'WT') : undefined;
  const open = Object.values(s.docs).filter((d) => d.type === 'WT' && d.status === 'CREATED').length;
  return (
    <div className="flex flex-col gap-4">
      <Head kicker="Forklift · counterbalance 2.5 t" title={id}>
        <p className="text-sm text-ink-2">Driver: {f.driver} · shift {shiftOf(s.t)}</p>
      </Head>
      {wt ? (
        <>
          <KV
            items={[
              ['Warehouse task', <DocLink id={wt.id} s={s} />],
              ['Type', wt.kind.replace('_', ' ').toLowerCase()],
              ['Material', MATERIALS[wt.material].name],
              ['Quantity', fmtQty(wt.qty, MATERIALS[wt.material].uom)],
              ['From', <span className="mono">{wt.fromBin}</span>],
              ['To', <span className="mono">{wt.toBin}</span>],
            ]}
          />
          <Bar value={wt.startedAt !== undefined ? (s.t - wt.startedAt) / wt.durationMin : 0} label="Task progress" />
        </>
      ) : (
        <p className="text-sm text-ink-3">Idle at its home position. {open ? `${open} task(s) are queued for the next free forklift.` : 'No open warehouse tasks.'}</p>
      )}
    </div>
  );
}
