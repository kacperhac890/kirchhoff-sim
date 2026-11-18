import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCheck, ClipboardCheck, Factory, PackagePlus, Play, Truck, X } from 'lucide-react';
import { useApp } from '../store/store';
import { useSim, parseRoute, go } from '../app/hooks';
import {
  BINS,
  CUSTOMERS,
  GROUP_NAMES,
  MACHINES,
  MATERIALS,
  PRODUCTS,
  availableQty,
  binFree,
  cancelOrder,
  confirmOperation,
  createProductionOrder,
  docsOf,
  fmtDateTime,
  fmtDuration,
  fmtEur,
  fmtQty,
  fmtTime,
  getDoc,
  mrpLines,
  plannedCost,
  postOrderGR,
  proposeBins,
  readyForGR,
  releaseOrder,
  runMRP,
  scheduleEnd,
  setAutoConfirm,
  stageComponents,
  type Operation,
  type ProductionOrder,
  type SimState,
} from '../engine';
import { Badge, Bar, Button, Callout, DocStatusPill, Empty, Field, Input, KV, PageHeader, Panel, SectionTitle, Select, Tabs, cx } from '../ui/kit';
import { DocLink, MatName } from '../ui/links';

type Tab = 'orders' | 'create' | 'mrp' | 'schedule';

export function ProductionPage() {
  const s = useSim();
  const route = useApp((st) => st.route);
  const { sub, id } = parseRoute(route);
  const tab: Tab = sub === 'create' ? 'create' : sub === 'mrp' ? 'mrp' : sub === 'schedule' ? 'schedule' : 'orders';
  const open = docsOf(s, 'PP').filter((p) => p.status !== 'COMPLETED' && p.status !== 'CANCELLED').length;
  return (
    <div>
      <PageHeader title="Production" sap="PP · CO01 · CO02 · CO11N · MD01" sub="Production orders, bills of materials, routings, confirmations and capacity">
        <Button variant="primary" icon={<PackagePlus className="size-4" />} onClick={() => go('#/production/create')}>
          Create order
        </Button>
      </PageHeader>
      <Tabs
        value={tab}
        onChange={(t) => go(t === 'orders' ? '#/production' : `#/production/${t}`)}
        tabs={[
          { id: 'orders', label: 'Production orders', count: open },
          { id: 'create', label: 'Create order' },
          { id: 'schedule', label: 'Work centre schedule' },
          { id: 'mrp', label: 'MRP' },
        ]}
      />
      <div className="p-6">
        {tab === 'orders' && <Orders s={s} selected={sub === 'order' ? id : undefined} />}
        {tab === 'create' && <CreateOrder s={s} preset={id} />}
        {tab === 'mrp' && <Mrp s={s} />}
        {tab === 'schedule' && <Schedule s={s} />}
      </div>
    </div>
  );
}

function Orders({ s, selected }: { s: SimState; selected?: string }) {
  const [showClosed, setShowClosed] = useState(false);
  const orders = docsOf(s, 'PP')
    .filter((p) => showClosed || (p.status !== 'COMPLETED' && p.status !== 'CANCELLED'))
    .sort((a, b) => (a.priority === 'URGENT' ? -1 : 0) - (b.priority === 'URGENT' ? -1 : 0) || b.createdAt - a.createdAt);
  const active = selected ? getDoc(s, selected, 'PP') : orders[0];
  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
      <Panel
        title="Order list"
        sub="COOIS"
        actions={
          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="accent-[var(--color-accent)]" />
            Show closed
          </label>
        }
      >
        {orders.length === 0 ? (
          <Empty icon={<Factory className="size-6" />} title="No production orders" action={<Button variant="primary" onClick={() => go('#/production/create')}>Create order</Button>}>
            An order turns demand into work for the presses, lasers and weld cells.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Product</th>
                  <th className="num">Qty</th>
                  <th>Progress</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((p) => {
                  const conf = p.ops.filter((o) => o.status === 'CONFIRMED').length;
                  return (
                    <tr key={p.id} data-clickable="true" data-selected={active?.id === p.id} onClick={() => go(`#/production/order/${p.id}`)}>
                      <td className="mono strong">{p.id}</td>
                      <td className="max-w-[180px] truncate">{MATERIALS[p.product].name}</td>
                      <td className="num tnum">{p.qty}</td>
                      <td className="w-32">
                        <Bar value={conf / p.ops.length} tone={p.status === 'COMPLETED' ? 'ok' : 'accent'} label="Operations confirmed" />
                        <div className="tnum mt-0.5 text-2xs text-ink-3">{conf}/{p.ops.length} ops</div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <DocStatusPill status={p.status} />
                          {p.priority === 'URGENT' && <Badge tone="bad">Urgent</Badge>}
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
      {active ? <OrderDetail s={s} pp={active} key={active.id} /> : <Panel title="Order"><Empty title="Select an order">Details, operations and confirmations appear here.</Empty></Panel>}
    </div>
  );
}

function OrderDetail({ s, pp }: { s: SimState; pp: ProductionOrder }) {
  const run = useApp((st) => st.run);
  const [grBins, setGrBins] = useState<string[]>([]);
  const so = getDoc(s, pp.salesOrder, 'SO');
  const reservationShort = pp.status !== 'CREATED' && pp.components.some((c) => c.reserved + 1e-6 < c.required);
  const stagingOpen = docsOf(s, 'WT').some((w) => w.ref === pp.id && w.kind === 'STAGING' && (w.status === 'CREATED' || w.status === 'IN_PROGRESS'));
  const ready = readyForGR(pp);
  const last = pp.ops[pp.ops.length - 1];
  const lot = getDoc(s, last.inspectionLot, 'IL');
  const grQty = lot ? (lot.decision === 'REJECT' ? last.qtyIn : lot.acceptedQty ?? last.qtyIn) : last.qtyIn;
  const grMd = Object.values(s.docs).find((d) => d.type === 'MD' && d.mvt === '101' && d.refs.includes(pp.id));
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <span className="mono">{pp.id}</span>
          <DocStatusPill status={pp.status} />
          {pp.priority === 'URGENT' && <Badge tone="bad">Urgent</Badge>}
        </span>
      }
      sub={`${pp.qty} × ${MATERIALS[pp.product].name}`}
      actions={<DocLink id={pp.id} s={s} className="text-xs" />}
    >
      <div className="flex flex-col gap-5 p-4">
        <KV
          cols={3}
          items={[
            ['Planned start', fmtDateTime(pp.plannedStart)],
            ['Planned finish', fmtDateTime(pp.plannedEnd)],
            ['Sales order', so ? <DocLink id={so.id} s={s} /> : '—'],
            ['Planned cost', fmtEur(pp.plannedCost)],
            ['Actual cost', fmtEur(pp.actualCost)],
            ['Batch', pp.batch ?? '—'],
          ]}
        />
        {pp.waitingReason && pp.status !== 'COMPLETED' && <Callout tone={pp.waitingReason.includes('down') ? 'bad' : 'accent'}>{pp.waitingReason}</Callout>}

        <div className="flex flex-wrap gap-2">
          {pp.status === 'CREATED' && (
            <Button variant="primary" icon={<Play className="size-3.5" />} onClick={() => run('CO02', (sim) => releaseOrder(sim, pp.id))}>
              Release (availability check)
            </Button>
          )}
          {reservationShort && (
            <Button variant="primary" onClick={() => run('CO02', (sim) => releaseOrder(sim, pp.id))}>
              Check availability again
            </Button>
          )}
          {pp.status !== 'CREATED' && pp.status !== 'COMPLETED' && pp.status !== 'CANCELLED' && !pp.stagingDone && (
            <Button variant={reservationShort ? 'secondary' : 'primary'} icon={<Truck className="size-3.5" />} disabled={stagingOpen} onClick={() => run('CO_STAGE', (sim) => stageComponents(sim, pp.id))}>
              {stagingOpen ? 'Staging in progress…' : 'Stage components'}
            </Button>
          )}
          {(pp.status === 'RELEASED' || pp.status === 'IN_PROGRESS') && (
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-2.5 text-xs text-ink-2">
              <input type="checkbox" checked={pp.autoConfirm} onChange={(e) => run('CO02', (sim) => setAutoConfirm(sim, pp.id, e.target.checked), { silent: true })} className="accent-[var(--color-accent)]" />
              Auto-confirm from machine data
            </label>
          )}
          {(pp.status === 'CREATED' || (pp.status === 'RELEASED' && pp.components.every((c) => c.staged === 0))) && (
            <Button variant="ghost" icon={<X className="size-3.5" />} onClick={() => run('CO02', (sim) => cancelOrder(sim, pp.id))}>
              Cancel order
            </Button>
          )}
        </div>

        <section>
          <SectionTitle>Components (BOM) — reservation & staging</SectionTitle>
          <div className="overflow-x-auto rounded-md border border-line-soft">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Material</th>
                  <th className="num">Per pc</th>
                  <th className="num">Required</th>
                  <th className="num">Reserved</th>
                  <th className="num">Staged</th>
                  <th className="num">Consumed (261)</th>
                  <th className="num">Free in WH</th>
                </tr>
              </thead>
              <tbody>
                {pp.components.map((c) => {
                  const m = MATERIALS[c.material];
                  const avail = availableQty(s, c.material);
                  return (
                    <tr key={c.material}>
                      <td className="max-w-[200px] truncate">{m.name}</td>
                      <td className="num tnum">{c.qtyPer}</td>
                      <td className="num tnum strong">{fmtQty(c.required, m.uom)}</td>
                      <td className={cx('num tnum', c.reserved + 1e-6 < c.required && pp.status !== 'CREATED' && 'text-warn')}>{fmtQty(c.reserved, m.uom)}</td>
                      <td className="num tnum">{fmtQty(c.staged, m.uom)}</td>
                      <td className="num tnum">{fmtQty(c.issued, m.uom)}</td>
                      <td className={cx('num tnum', pp.status === 'CREATED' && avail < c.required && 'text-[oklch(0.78_0.14_25)]')}>{fmtQty(avail, m.uom)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <SectionTitle>Operations (routing)</SectionTitle>
          <ol className="flex flex-col gap-2">
            {pp.ops.map((op, i) => (
              <OperationRow key={op.no} s={s} pp={pp} op={op} prevConfirmed={i === 0 || pp.ops[i - 1].status === 'CONFIRMED'} />
            ))}
          </ol>
        </section>

        {(ready || pp.status === 'COMPLETED') && (
          <section className="rounded-md border border-line-soft p-3">
            <SectionTitle>Goods receipt from production · MIGO 101</SectionTitle>
            {pp.status === 'COMPLETED' ? (
              <p className="text-sm text-ink-2">
                {pp.grQty} pcs received with batch <span className="mono">{pp.batch}</span> — material document <DocLink id={grMd?.id} s={s} />.
              </p>
            ) : (
              <GrForm s={s} pp={pp} qty={grQty} bins={grBins} setBins={setGrBins} onPost={() => run('CO_GR', (sim) => postOrderGR(sim, pp.id, grBins))} blocked={lot?.decision === 'REJECT'} />
            )}
          </section>
        )}

        <section>
          <SectionTitle>History</SectionTitle>
          <ol className="flex max-h-52 flex-col gap-1.5 overflow-y-auto">
            {[...pp.history].reverse().map((h, i) => (
              <li key={i} className="flex gap-3 text-xs">
                <span className="tnum w-20 shrink-0 text-ink-4">{fmtDateTime(h.t)}</span>
                <span className="text-ink-2">
                  {h.action}
                  {h.detail && <span className="text-ink-3"> — {h.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Panel>
  );
}

function GrForm({ s, pp, qty, bins, setBins, onPost, blocked }: { s: SimState; pp: ProductionOrder; qty: number; bins: string[]; setBins: (b: string[]) => void; onPost: () => void; blocked?: boolean }) {
  const m = MATERIALS[pp.product];
  const pallets = Math.ceil(qty / m.perPallet);
  const fgBins = BINS.filter((b) => b.type === 'FGRACK');
  const cap = bins.reduce((a, b) => a + binFree(s, b), 0);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">
        {qty} pcs = <b className="text-ink">{pallets} pallets</b> ({m.perPallet} pcs per mesh container) into {blocked ? <b className="text-[oklch(0.78_0.14_25)]">blocked stock</b> : 'unrestricted stock'}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setBins(proposeBins(s, pp.product, qty))}>Propose bins</Button>
        <Select
          aria-label="Add bin"
          value=""
          onChange={(e) => e.target.value && setBins([...bins, e.target.value])}
          className="h-7 w-48"
        >
          <option value="">Add bin manually…</option>
          {fgBins
            .filter((b) => !bins.includes(b.id) && binFree(s, b.id) > 0)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.id} ({binFree(s, b.id)} free)
              </option>
            ))}
        </Select>
        {bins.length > 0 && <Button size="sm" variant="ghost" onClick={() => setBins([])}>Clear</Button>}
      </div>
      {bins.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {bins.map((b) => (
            <span key={b} className="mono rounded bg-s3 px-1.5 py-0.5 text-xs text-ink-2">{b}</span>
          ))}
          <span className={cx('text-xs', cap >= pallets ? 'text-ok' : 'text-warn')}>
            {cap}/{pallets} pallet places
          </span>
        </div>
      )}
      <Button variant="primary" className="self-start" icon={<CheckCheck className="size-4" />} onClick={onPost}>
        Post goods receipt
      </Button>
    </div>
  );
}

function OperationRow({ s, pp, op, prevConfirmed }: { s: SimState; pp: ProductionOrder; op: Operation; prevConfirmed: boolean }) {
  const run = useApp((st) => st.run);
  const [y, setY] = useState('');
  const [sc, setSc] = useState('');
  const lot = getDoc(s, op.inspectionLot, 'IL');
  const good = lot?.decision ? (lot.decision === 'ACCEPT' ? lot.acceptedQty ?? op.qtyIn : op.qtyIn) : op.produced - op.scrap;
  const scrap = lot?.decision ? (lot.decision === 'ACCEPT' ? op.qtyIn - good : 0) : op.scrap;
  const operator = op.machine ? s.machines[op.machine]?.operator : undefined;
  const statusTone = op.status === 'CONFIRMED' ? 'ok' : op.status === 'DONE' ? 'warn' : op.status === 'RUNNING' ? 'accent' : op.status === 'SETUP' ? 'maint' : op.status === 'PAUSED' ? 'bad' : 'muted';
  const canConfirm = op.status === 'DONE' && prevConfirmed && (!op.inspectionLot || !!lot?.decision);
  return (
    <li className={cx('rounded-md border p-3', op.status === 'DONE' ? 'border-[oklch(0.84_0.15_88/0.4)] bg-warn-soft/40' : 'border-line-soft')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="mono text-xs text-ink-3">{op.no}</span>
        <span className="text-sm font-medium text-ink">{op.name}</span>
        <Badge tone={statusTone}>{op.status === 'DONE' ? 'Awaiting confirmation' : op.status.toLowerCase()}</Badge>
        <span className="ml-auto text-xs text-ink-3">
          {GROUP_NAMES[op.wcGroup]}
          {op.machine && <span className="mono ml-1 text-ink-2">{op.machine}</span>}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
        <span className="text-ink-3">Planned <b className="tnum font-medium text-ink-2">{fmtDuration(op.plannedMin)}</b></span>
        <span className="text-ink-3">Actual <b className="tnum font-medium text-ink-2">{op.actualMin ? fmtDuration(op.actualMin) : '—'}</b></span>
        <span className="text-ink-3">In <b className="tnum font-medium text-ink-2">{op.qtyIn || '—'}</b></span>
        <span className="text-ink-3">Produced <b className="tnum font-medium text-ink-2">{op.produced}</b></span>
        <span className="text-ink-3">Scrap <b className="tnum font-medium text-ink-2">{op.scrap}</b></span>
      </div>
      {(op.status === 'RUNNING' || op.status === 'SETUP' || op.status === 'PAUSED') && (
        <div className="mt-2">
          <Bar value={op.produced / Math.max(1, op.qtyIn)} tone={op.status === 'PAUSED' ? 'bad' : 'accent'} label="Operation progress" />
          <div className="mt-1 text-2xs text-ink-3">
            {op.status === 'SETUP' ? 'Setup / die change' : op.status === 'PAUSED' ? 'Paused — machine stopped' : 'Running'} · operator {operator ? s.employees[operator].name : 'none'}
          </div>
        </div>
      )}
      {op.inspectionLot && (
        <div className="mt-2 text-xs text-ink-3">
          Inspection lot <DocLink id={op.inspectionLot} s={s} /> {lot?.decision ? `— decision: ${lot.decision.toLowerCase()}` : op.status === 'DONE' ? '— record results & usage decision in Quality' : ''}
          {op.status === 'DONE' && !lot?.decision && (
            <Button size="sm" variant="amber" className="ml-2" icon={<ClipboardCheck className="size-3.5" />} onClick={() => go(`#/quality/lot/${op.inspectionLot}`)}>
              Open in QM
            </Button>
          )}
        </div>
      )}
      {op.status === 'CONFIRMED' && op.confirmation && (
        <div className="mt-2 text-xs text-ink-3">
          Confirmed with <DocLink id={op.confirmation} s={s} />
        </div>
      )}
      {canConfirm && !pp.autoConfirm && (
        <div className="mt-3 rounded-md bg-s2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-ink-2">Final confirmation · CO11N</span>
            <span className="text-ink-3">
              {op.inspectionLot ? 'Usage decision' : 'Machine counter'}: <b className="tnum text-ink">{good}</b> good / <b className="tnum text-ink">{scrap}</b> scrap
              <button type="button" onClick={() => { setY(String(good)); setSc(String(scrap)); }} className="ml-2 cursor-pointer text-accent hover:underline">
                Copy values
              </button>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Field label="Yield (pcs)">{(id) => <Input id={id} type="number" min={0} value={y} onChange={(e) => setY(e.target.value)} className="w-28" />}</Field>
            <Field label="Scrap (pcs)">{(id) => <Input id={id} type="number" min={0} value={sc} onChange={(e) => setSc(e.target.value)} className="w-28" />}</Field>
            <Button variant="primary" disabled={y === '' || sc === ''} onClick={() => run('CO11N', (sim) => confirmOperation(sim, pp.id, op.no, Number(y), Number(sc)))}>
              Confirm operation
            </Button>
          </div>
        </div>
      )}
      {op.status === 'DONE' && !prevConfirmed && <p className="mt-2 text-xs text-warn">Confirm the previous operation first — operations are confirmed in routing sequence.</p>}
    </li>
  );
}

function CreateOrder({ s, preset }: { s: SimState; preset?: string }) {
  const run = useApp((st) => st.run);
  const products = Object.keys(PRODUCTS);
  const [product, setProduct] = useState(preset && PRODUCTS[preset] ? preset : products[0]);
  const [qty, setQty] = useState('500');
  const [prio, setPrio] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [startIn, setStartIn] = useState('0');
  const [so, setSo] = useState('');
  const [auto, setAuto] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (preset && PRODUCTS[preset]) setProduct(preset);
  }, [preset]);
  const q = Number(qty);
  const qtyErr = touched && (!Number.isInteger(q) || q <= 0) ? 'Enter a whole number of pieces greater than zero.' : touched && q > 5000 ? 'Maximum lot size is 5,000 pcs.' : undefined;
  const p = PRODUCTS[product];
  const start = s.t + Number(startIn) * 60;
  const valid = Number.isInteger(q) && q > 0 && q <= 5000;
  const end = valid ? scheduleEnd(product, q, start) : start;
  const cost = valid ? plannedCost(product, q) : 0;
  const sos = docsOf(s, 'SO').filter((x) => x.items[0].material === product && x.status !== 'COMPLETED' && x.status !== 'CANCELLED');
  const submit = () => {
    setTouched(true);
    if (!valid) return;
    const r = run('CO01', (sim) => createProductionOrder(sim, product, q, { start, priority: prio, salesOrder: so || undefined, autoConfirm: auto }));
    if (r.ok && r.docs?.[0]) go(`#/production/order/${r.docs[0]}`);
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <Panel title={<>Create production order <span className="mono ml-1 text-xs font-normal text-ink-3">CO01</span></>}>
        <form
          className="flex flex-col gap-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
        >
          <Field label="Material (finished product)" required>
            {(id) => (
              <Select id={id} value={product} onChange={(e) => setProduct(e.target.value)}>
                {products.map((pid) => (
                  <option key={pid} value={pid}>
                    {pid} — {MATERIALS[pid].name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity (pcs)" required error={qtyErr}>
              {(id) => <Input id={id} type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} />}
            </Field>
            <Field label="Priority">
              {(id) => (
                <Select id={id} value={prio} onChange={(e) => setPrio(e.target.value as 'NORMAL' | 'URGENT')}>
                  <option value="NORMAL">Normal</option>
                  <option value="URGENT">Urgent — machines first</option>
                </Select>
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Basic start" hint={fmtDateTime(start)}>
              {(id) => (
                <Select id={id} value={startIn} onChange={(e) => setStartIn(e.target.value)}>
                  <option value="0">Now</option>
                  <option value="2">In 2 h</option>
                  <option value="4">In 4 h</option>
                  <option value="8">Next shift (+8 h)</option>
                </Select>
              )}
            </Field>
            <Field label="Sales order (optional)">
              {(id) => (
                <Select id={id} value={so} onChange={(e) => setSo(e.target.value)}>
                  <option value="">Make-to-stock</option>
                  {sos.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.id} — {x.items[0].qty} pcs, {CUSTOMERS[x.customer].city}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-1 accent-[var(--color-accent)]" />
            <span>
              Auto-confirm operations from machine data
              <span className="block text-xs text-ink-3">The final inspection always needs a usage decision.</span>
            </span>
          </label>
          <Button type="submit" variant="primary">
            Create order
          </Button>
        </form>
      </Panel>
      <div className="flex flex-col gap-4">
        <Panel title="Bill of materials" sub={`${p.family} · for ${valid ? q : '—'} pcs`}>
          <table className="dtable">
            <thead>
              <tr>
                <th>Component</th>
                <th className="num">Per piece</th>
                <th className="num">Required</th>
                <th className="num">Available</th>
                <th>Consumed at</th>
              </tr>
            </thead>
            <tbody>
              {p.bom.map((b) => {
                const m = MATERIALS[b.material];
                const need = valid ? b.qtyPer * q : 0;
                const avail = availableQty(s, b.material);
                return (
                  <tr key={b.material}>
                    <td><MatName id={b.material} /></td>
                    <td className="num tnum">{fmtQty(b.qtyPer, m.uom)}</td>
                    <td className="num tnum strong">{fmtQty(need, m.uom)}</td>
                    <td className={cx('num tnum', avail < need ? 'text-[oklch(0.78_0.14_25)]' : 'text-ok')}>{fmtQty(avail, m.uom)}</td>
                    <td className="mono text-xs">{b.op}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        <Panel title="Routing" sub={valid ? `Planned finish ${fmtDateTime(end)} · lead time ${fmtDuration(end - start)} · planned cost ${fmtEur(cost)}` : 'Enter a valid quantity'}>
          <table className="dtable">
            <thead>
              <tr>
                <th>Op</th>
                <th>Operation</th>
                <th>Work centre</th>
                <th className="num">Setup</th>
                <th className="num">Cycle</th>
                <th className="num">Planned time</th>
              </tr>
            </thead>
            <tbody>
              {p.routing.map((r) => (
                <tr key={r.no}>
                  <td className="mono">{r.no}</td>
                  <td>{r.name}</td>
                  <td className="text-xs">{MACHINES.filter((m) => m.group === r.group).map((m) => m.id).join(', ')}</td>
                  <td className="num tnum">{r.setupMin} min</td>
                  <td className="num tnum">{r.cycleSec} s</td>
                  <td className="num tnum">{valid ? fmtDuration(r.setupMin + (q * r.cycleSec) / 60) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

function Mrp({ s }: { s: SimState }) {
  const run = useApp((st) => st.run);
  const lines = mrpLines(s);
  const fg = useMemo(
    () =>
      Object.keys(PRODUCTS).map((id) => {
        const demand = docsOf(s, 'SO')
          .filter((so) => so.items[0].material === id && so.status !== 'COMPLETED' && so.status !== 'CANCELLED')
          .reduce((a, so) => a + so.items[0].qty - so.items[0].delivered, 0);
        const stock = availableQty(s, id) + Object.values(s.quants).filter((q) => q.material === id && (q.bin === 'QA-OUT' || q.bin.startsWith('DOCK-OUT'))).reduce((a, q) => a + q.qty, 0);
        const wip = docsOf(s, 'PP')
          .filter((p) => p.product === id && p.status !== 'COMPLETED' && p.status !== 'CANCELLED')
          .reduce((a, p) => a + p.qty, 0);
        return { id, demand, stock, wip, gap: Math.max(0, demand - stock - wip) };
      }),
    [s],
  );
  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Finished goods coverage"
        sub="Open customer demand vs. stock and open production orders"
      >
        <table className="dtable">
          <thead>
            <tr>
              <th>Product</th>
              <th className="num">Open demand</th>
              <th className="num">Stock</th>
              <th className="num">In production</th>
              <th className="num">Uncovered</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fg.map((r) => (
              <tr key={r.id}>
                <td><MatName id={r.id} /></td>
                <td className="num tnum">{r.demand}</td>
                <td className="num tnum">{r.stock}</td>
                <td className="num tnum">{r.wip}</td>
                <td className={cx('num tnum strong', r.gap > 0 && 'text-warn')}>{r.gap}</td>
                <td className="text-right">{r.gap > 0 && <Button size="sm" onClick={() => go(`#/production/create/${r.id}`)}>Plan order</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel
        title={<>Material requirements planning <span className="mono ml-1 text-xs font-normal text-ink-3">MD01</span></>}
        sub="Net requirements for purchased parts: requirements + safety stock − stock − open receipts"
        actions={<Button variant="primary" size="sm" icon={<CalendarClock className="size-3.5" />} onClick={() => run('MD01', (sim) => runMRP(sim))}>Run MRP</Button>}
      >
        <div className="overflow-x-auto">
          <table className="dtable">
            <thead>
              <tr>
                <th>Material</th>
                <th className="num">Free stock</th>
                <th className="num">Requirements</th>
                <th className="num">Open PO / PR</th>
                <th className="num">Safety stock</th>
                <th className="num">Shortage</th>
                <th className="num">Proposal</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const m = MATERIALS[l.material];
                return (
                  <tr key={l.material}>
                    <td className="max-w-[240px] truncate"><MatName id={l.material} /></td>
                    <td className="num tnum">{fmtQty(l.stock, m.uom)}</td>
                    <td className="num tnum">{fmtQty(l.requirements, m.uom)}</td>
                    <td className="num tnum">{fmtQty(l.receipts, m.uom)}</td>
                    <td className="num tnum">{fmtQty(l.safety, m.uom)}</td>
                    <td className={cx('num tnum', l.shortage > 0 && 'text-warn strong')}>{l.shortage > 0 ? fmtQty(l.shortage, m.uom) : '—'}</td>
                    <td className="num tnum">{l.proposal > 0 ? fmtQty(l.proposal, m.uom) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Schedule({ s }: { s: SimState }) {
  const from = s.t - 4 * 60;
  const to = s.t + 12 * 60;
  const span = to - from;
  const pct = (t: number) => `${Math.max(0, Math.min(100, ((t - from) / span) * 100))}%`;
  const ticks: number[] = [];
  for (let h = Math.ceil(from / 60); h * 60 <= to; h += 2) ticks.push(h * 60);
  const bars = MACHINES.map((d) => {
    const items: { pp: ProductionOrder; op: Operation; a: number; b: number; kind: 'done' | 'run' | 'plan' }[] = [];
    for (const pp of docsOf(s, 'PP')) {
      if (pp.status === 'CANCELLED') continue;
      for (const op of pp.ops) {
        if (op.machine !== d.id || op.startedAt === undefined) continue;
        if (op.finishedAt !== undefined) items.push({ pp, op, a: op.startedAt, b: op.finishedAt, kind: 'done' });
        else {
          const m = s.machines[d.id];
          const left = m.setupLeft + ((op.qtyIn - op.produced) * op.cycleSec) / 60;
          items.push({ pp, op, a: op.startedAt, b: s.t + left, kind: 'run' });
        }
      }
    }
    return { d, items };
  });
  return (
    <Panel title="Work centre schedule" sub="Last 4 h and next 12 h · actual and forecast operation times">
      <div className="overflow-x-auto p-4">
        <div className="min-w-[760px]">
          <div className="relative ml-28 h-5 border-b border-line-soft">
            {ticks.map((t) => (
              <span key={t} className="tnum absolute -translate-x-1/2 text-2xs text-ink-3" style={{ left: pct(t) }}>
                {fmtTime(t)}
              </span>
            ))}
          </div>
          {bars.map(({ d, items }) => (
            <div key={d.id} className="flex h-9 items-center border-b border-line-soft">
              <div className="w-28 shrink-0">
                <div className="mono text-xs text-ink">{d.id}</div>
                <div className="truncate text-2xs text-ink-3">{GROUP_NAMES[d.group]}</div>
              </div>
              <div className="relative h-full flex-1">
                <div className="absolute top-0 bottom-0 w-px bg-amber" style={{ left: pct(s.t) }} aria-hidden />
                {items.map(({ pp, op, a, b, kind }) => (
                  <button
                    key={`${pp.id}${op.no}`}
                    type="button"
                    onClick={() => go(`#/production/order/${pp.id}`)}
                    title={`${pp.id} / ${op.no} ${op.name}: ${fmtTime(a)}–${fmtTime(b)}`}
                    className={cx('press absolute top-1.5 bottom-1.5 cursor-pointer overflow-hidden rounded px-1 text-left text-[10px] font-medium', kind === 'done' ? 'bg-s4 text-ink-2' : 'bg-accent text-accent-ink')}
                    style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})`, minWidth: 4 }}
                  >
                    <span className="mono truncate">{pp.id}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
