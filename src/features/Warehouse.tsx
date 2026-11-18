import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, PackageCheck, PackageOpen, ScanLine, Truck } from 'lucide-react';
import { useApp } from '../store/store';
import { useSim, parseRoute, go } from '../app/hooks';
import {
  BINS,
  BIN_MAP,
  MATERIALS,
  RACK_DEFS,
  SUPPLIERS,
  binFree,
  binLocked,
  binUsage,
  countInbound,
  countPhysInv,
  createPhysInv,
  docsOf,
  fmtDateTime,
  fmtQty,
  fmtTime,
  freeCapacitySummary,
  getDoc,
  postGoodsReceiptPO,
  postPhysInv,
  proposeBin,
  stockTotals,
  storageCheck,
  transferStock,
  type SimState,
} from '../engine';
import { Badge, Bar, Button, Callout, DocStatusPill, Empty, Field, Input, KV, PageHeader, Panel, Select, Tabs, cx } from '../ui/kit';
import { DocLink, MatName } from '../ui/links';

type Tab = 'inbound' | 'stock' | 'bins' | 'tasks' | 'count';

export function WarehousePage() {
  const s = useSim();
  const route = useApp((st) => st.route);
  const { sub, id } = parseRoute(route);
  const tab: Tab = (['inbound', 'stock', 'bins', 'tasks', 'count'] as Tab[]).includes(sub as Tab) ? (sub as Tab) : 'inbound';
  const atDock = docsOf(s, 'IBD').filter((d) => d.arrivedAt !== undefined && d.status !== 'COMPLETED').length;
  const openWt = docsOf(s, 'WT').filter((w) => w.status === 'CREATED' || w.status === 'IN_PROGRESS').length;
  const openPi = docsOf(s, 'PI').filter((p) => !p.posted).length;
  const rm = freeCapacitySummary(s, 'RACK');
  const fg = freeCapacitySummary(s, 'FGRACK');
  const sh = freeCapacitySummary(s, 'SHEET');
  return (
    <div>
      <PageHeader title="Warehouse" sap="MM-IM · EWM · WH01–WH04" sub="Goods receipts, storage bins, stock, warehouse tasks and physical inventory">
        <CapacityMini label="Sheet WH02" used={sh.used} total={sh.total} />
        <CapacityMini label="Racks WH01" used={rm.used} total={rm.total} />
        <CapacityMini label="FG WH03" used={fg.used} total={fg.total} />
      </PageHeader>
      <Tabs
        value={tab}
        onChange={(t) => go(`#/warehouse/${t}`)}
        tabs={[
          { id: 'inbound', label: 'Inbound deliveries', count: atDock },
          { id: 'stock', label: 'Stock overview' },
          { id: 'bins', label: 'Rack map' },
          { id: 'tasks', label: 'Warehouse tasks', count: openWt },
          { id: 'count', label: 'Physical inventory', count: openPi },
        ]}
      />
      <div className="p-6">
        {tab === 'inbound' && <Inbound s={s} selected={id} />}
        {tab === 'stock' && <StockOverview s={s} material={id} />}
        {tab === 'bins' && <RackMap s={s} selected={id} />}
        {tab === 'tasks' && <Tasks s={s} />}
        {tab === 'count' && <Count s={s} bin={id} />}
      </div>
    </div>
  );
}

function CapacityMini({ label, used, total }: { label: string; used: number; total: number }) {
  return (
    <div className="w-32">
      <div className="flex justify-between text-2xs text-ink-3">
        <span>{label}</span>
        <span className="tnum">{Math.round((used / Math.max(1, total)) * 100)} %</span>
      </div>
      <Bar value={used / Math.max(1, total)} tone={used / total > 0.85 ? 'warn' : 'accent'} className="mt-1" label={`${label} capacity`} />
    </div>
  );
}

// ---------------------------------------------------------------- inbound + MIGO
function Inbound({ s, selected }: { s: SimState; selected?: string }) {
  const list = docsOf(s, 'IBD').sort((a, b) => (a.status === 'COMPLETED' ? 1 : 0) - (b.status === 'COMPLETED' ? 1 : 0) || a.eta - b.eta);
  const active = selected ? getDoc(s, selected, 'IBD') : list.find((d) => d.arrivedAt !== undefined && d.status !== 'COMPLETED') ?? list.find((d) => d.arrivedAt !== undefined) ?? list[0];
  useEffect(() => {
    useApp.getState().visit('warehouse.inbound');
  }, []);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
      <Panel title="Inbound deliveries" sub="Announced by suppliers against purchase orders">
        {list.length === 0 ? (
          <Empty icon={<Truck className="size-6" />} title="No inbound deliveries">Create a purchase order in Procurement — the supplier announces the delivery automatically.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Delivery</th>
                  <th>PO</th>
                  <th>Supplier</th>
                  <th>Material</th>
                  <th className="num">Quantity</th>
                  <th>Arrival</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((d) => {
                  const it = d.items[0];
                  return (
                    <tr key={d.id} data-clickable="true" data-selected={active?.id === d.id} onClick={() => go(`#/warehouse/inbound/${d.id}`)}>
                      <td className="mono strong">{d.id}</td>
                      <td><DocLink id={d.po} s={s} /></td>
                      <td>{SUPPLIERS[d.supplier].name}</td>
                      <td className="max-w-[200px] truncate">{MATERIALS[it.material].name}</td>
                      <td className="num tnum">{fmtQty(it.qty, MATERIALS[it.material].uom)}</td>
                      <td className="tnum">{d.arrivedAt !== undefined ? <>Door {(d.dock ?? 0) + 1} · {fmtTime(d.arrivedAt)}</> : <>ETA {fmtDateTime(d.eta)}</>}</td>
                      <td>
                        {d.status === 'COMPLETED' ? <DocStatusPill status="COMPLETED" label="Received" /> : d.arrivedAt !== undefined ? <Badge tone="warn" dot>At dock</Badge> : <Badge>In transit</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <div>{active ? <GoodsReceipt s={s} ibdId={active.id} key={active.id} /> : <Panel title="Goods receipt"><Empty icon={<PackageOpen className="size-6" />} title="Select a delivery at the dock">The goods receipt form opens here.</Empty></Panel>}</div>
    </div>
  );
}

function GoodsReceipt({ s, ibdId }: { s: SimState; ibdId: string }) {
  const run = useApp((st) => st.run);
  const ibd = getDoc(s, ibdId, 'IBD')!;
  const it = ibd.items[0];
  const m = MATERIALS[it.material];
  const po = getDoc(s, ibd.po, 'PO');
  const poItem = po?.items.find((p) => p.material === it.material);
  const [qty, setQty] = useState<string>(it.counted !== undefined ? String(it.counted) : '');
  const [bin, setBin] = useState<string>('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (it.counted !== undefined && qty === '') setQty(String(it.counted));
  }, [it.counted, qty]);
  const q = Number(qty);
  const binOptions = useMemo(() => BINS.filter((b) => b.type === m.binType), [m.binType]);
  const qtyErr = touched && !(q > 0) ? 'Enter the counted quantity.' : undefined;
  const binErr = touched && !bin ? 'Assign a storage bin.' : touched && bin && q > 0 ? storageCheck(s, it.material, q, bin) ?? undefined : undefined;
  const received = ibd.status === 'COMPLETED';
  const md = Object.values(s.docs).find((d) => d.type === 'MD' && d.mvt === '101' && d.refs.includes(ibd.id) && !d.reversedBy);
  const post = () => {
    setTouched(true);
    if (!(q > 0) || !bin) return;
    run('MIGO_GR', (sim) => postGoodsReceiptPO(sim, ibd.id, [{ idx: 0, qty: q, bin }]));
  };
  return (
    <Panel title={<>Goods receipt <span className="mono ml-1 text-xs font-normal text-ink-3">MIGO · 101</span></>} sub={`Delivery ${ibd.id} · truck ${ibd.carrierPlate}`}>
      <div className="flex flex-col gap-4 p-4">
        <KV
          items={[
            ['Purchase order', <DocLink id={ibd.po} s={s} />],
            ['Supplier', SUPPLIERS[ibd.supplier].name],
            ['Material', <MatName id={it.material} short />],
            ['Delivery note', fmtQty(it.qty, m.uom)],
            ['Open on PO', poItem ? fmtQty(poItem.qty - poItem.received, m.uom) : '—'],
            ['Door', ibd.arrivedAt !== undefined ? `Inbound ${(ibd.dock ?? 0) + 1}` : `ETA ${fmtDateTime(ibd.eta)}`],
          ]}
        />
        {m.qmIncoming && <Callout tone="warn" title="Incoming inspection required">This material is posted to quality inspection stock. An inspection lot (type 01) is created automatically.</Callout>}
        {received ? (
          <Callout tone="ok" title="Goods receipt posted">
            Material document <DocLink id={md?.id} s={s} />. The put-away task moves the goods to their bin — watch it in the 3D view.
          </Callout>
        ) : ibd.arrivedAt === undefined ? (
          <Callout title="Truck not at the dock yet">You can receive goods only after they physically arrive. Speed up time or check the expected arrival.</Callout>
        ) : (
          <>
            <section className="rounded-md border border-line-soft p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-ink">1 · Verify the quantity</div>
                  <div className="text-xs text-ink-3">Count the pallets at the dock before you post.</div>
                </div>
                <Button size="sm" icon={<ScanLine className="size-3.5" />} onClick={() => run('MIGO_GR', (sim) => countInbound(sim, ibd.id))} disabled={it.counted !== undefined}>
                  {it.counted !== undefined ? 'Counted' : 'Count at dock'}
                </Button>
              </div>
              {it.counted !== undefined && (
                <p className={cx('mt-2 text-sm', it.counted === it.qty ? 'text-ok' : 'text-warn')}>
                  Counted {fmtQty(it.counted, m.uom)} — {it.counted === it.qty ? 'matches the delivery note.' : `${fmtQty(it.qty - it.counted, m.uom)} short against the delivery note. Post what you counted.`}
                </p>
              )}
            </section>
            <section className="flex flex-col gap-3">
              <div className="text-sm font-medium text-ink">2 · Quantity and storage bin</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Quantity (${m.uom})`} required error={qtyErr}>
                  {(fid) => <Input id={fid} type="number" min={0} step={m.uom === 'PC' ? 1 : 0.1} value={qty} onChange={(e) => setQty(e.target.value)} />}
                </Field>
                <Field label="Stock type">{(fid) => <Input id={fid} value={m.qmIncoming ? 'Quality inspection' : 'Unrestricted'} readOnly className="text-ink-3" />}</Field>
              </div>
              <Field label="Destination storage bin" required error={binErr} hint={`Allowed: ${m.binType === 'SHEET' ? 'sheet metal storage WH02' : m.binType === 'RACK' ? 'raw material racks WH01' : m.binType === 'SPARE' ? 'spare parts WH04' : 'finished goods WH03'}`}>
                {(fid) => (
                  <div className="flex gap-2">
                    <Select id={fid} value={bin} onChange={(e) => setBin(e.target.value)}>
                      <option value="">Select a bin…</option>
                      {binOptions.map((b) => {
                        const free = binFree(s, b.id);
                        return (
                          <option key={b.id} value={b.id} disabled={free === 0 || binLocked(s, b.id)}>
                            {b.id} — {free} free{binLocked(s, b.id) ? ' (locked)' : ''}
                          </option>
                        );
                      })}
                    </Select>
                    <Button onClick={() => setBin(proposeBin(s, it.material, q > 0 ? q : it.qty) ?? '')}>Propose</Button>
                  </div>
                )}
              </Field>
            </section>
            <Button variant="primary" icon={<PackageCheck className="size-4" />} onClick={post}>
              Post goods receipt
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- stock overview
function StockOverview({ s, material }: { s: SimState; material?: string }) {
  const [filter, setFilter] = useState<'ALL' | 'RAW' | 'FIN' | 'SPARE'>('ALL');
  const [query, setQuery] = useState('');
  const mats = Object.values(MATERIALS).filter((m) => (filter === 'ALL' || m.type === filter) && (!query || `${m.id} ${m.name}`.toLowerCase().includes(query.toLowerCase())));
  const sel = material ? MATERIALS[material] : undefined;
  useEffect(() => {
    useApp.getState().visit('warehouse.stock');
  }, []);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Panel
        title="Stock overview"
        sub="Book stock per material (MMBE)"
        actions={
          <div className="flex items-center gap-2">
            <Input aria-label="Filter materials" placeholder="Filter…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-7 w-36" />
            <Select aria-label="Material type" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="h-7 w-32">
              <option value="ALL">All types</option>
              <option value="RAW">Raw materials</option>
              <option value="FIN">Finished goods</option>
              <option value="SPARE">Spare parts</option>
            </Select>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="dtable">
            <thead>
              <tr>
                <th>Material</th>
                <th className="num">Unrestricted</th>
                <th className="num">Reserved</th>
                <th className="num">Quality insp.</th>
                <th className="num">Blocked</th>
                <th className="num">At line / dock</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {mats.map((m) => {
                const t = stockTotals(s, m.id);
                return (
                  <tr key={m.id} data-clickable="true" data-selected={sel?.id === m.id} onClick={() => go(`#/warehouse/stock/${m.id}`)}>
                    <td className="max-w-[260px] truncate"><MatName id={m.id} /></td>
                    <td className="num tnum strong">{fmtQty(t.UNR - t.psa - t.transit, m.uom)}</td>
                    <td className="num tnum">{t.reserved ? fmtQty(t.reserved, m.uom) : '—'}</td>
                    <td className="num tnum">{t.QI ? <span className="text-warn">{fmtQty(t.QI, m.uom)}</span> : '—'}</td>
                    <td className="num tnum">{t.BLK ? <span className="text-[oklch(0.78_0.14_25)]">{fmtQty(t.BLK, m.uom)}</span> : '—'}</td>
                    <td className="num tnum">{t.psa + t.transit ? fmtQty(t.psa + t.transit, m.uom) : '—'}</td>
                    <td className="num tnum">€{Math.round((t.UNR + t.QI + t.BLK) * m.price).toLocaleString('en-US')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      {sel ? (
        <Panel title={sel.name} sub={<span className="mono">{sel.id}</span>}>
          <div className="flex flex-col gap-4 p-4">
            <p className="text-sm text-ink-2">{sel.description}</p>
            <KV items={[["Standard price", `€${sel.price} / ${sel.uom}`], ['Per pallet / HU', fmtQty(sel.perPallet, sel.uom)], ['Storage', sel.binType], ['Incoming inspection', sel.qmIncoming ? 'Yes (lot type 01)' : 'No']]} />
            <div>
              <div className="mb-1.5 text-xs font-medium text-ink-2">Stock by bin and batch</div>
              <ul className="flex flex-col divide-y divide-line-soft rounded-md border border-line-soft">
                {Object.values(s.quants)
                  .filter((q) => q.material === sel.id)
                  .map((q) => (
                    <li key={q.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <button type="button" onClick={() => go(`#/warehouse/bins/${q.bin}`)} className="mono cursor-pointer text-[oklch(0.8_0.1_248)] hover:underline">{q.bin}</button>
                      <span className="mono text-xs text-ink-3">{q.batch}</span>
                      <Badge tone={q.stockType === 'UNR' ? 'ok' : q.stockType === 'QI' ? 'warn' : 'bad'}>{q.stockType}</Badge>
                      <span className="tnum ml-auto text-ink">{fmtQty(q.qty, sel.uom)}</span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel title="Material details"><Empty icon={<ClipboardList className="size-6" />} title="Select a material">See bins, batches and stock types.</Empty></Panel>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- rack map
function RackMap({ s, selected }: { s: SimState; selected?: string }) {
  const groups: { title: string; ids: string[]; cols: number; rows: number; rack?: (typeof RACK_DEFS)[number] }[] = [
    ...RACK_DEFS.map((r) => ({ title: `${r.wh}-${r.rack}`, ids: BINS.filter((b) => b.rack === `${r.wh}-${r.rack}`).map((b) => b.id), cols: r.bays, rows: r.levels, rack: r })),
    { title: 'WH02-S sheet stacks', ids: BINS.filter((b) => b.type === 'SHEET').map((b) => b.id), cols: 4, rows: 2 },
    { title: 'Supply areas & docks', ids: BINS.filter((b) => b.type === 'PSA' || b.type === 'DOCK' || b.type === 'QA').map((b) => b.id), cols: 6, rows: 2 },
  ];
  const sel = selected && BIN_MAP[selected] ? selected : undefined;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g) => (
          <Panel key={g.title} title={<span className="mono">{g.title}</span>} sub={g.rack ? `${g.rack.bays} bays × ${g.rack.levels} levels` : undefined}>
            <div className="p-3">
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${g.cols}, minmax(0, 1fr))` }}>
                {orderCells(g).map((id) => {
                  const b = BIN_MAP[id];
                  const used = binUsage(s, id);
                  const fill = Math.min(1, used / b.capacity);
                  const qs = Object.values(s.quants).filter((q) => q.bin === id);
                  const blocked = qs.some((q) => q.stockType === 'BLK');
                  const qi = qs.some((q) => q.stockType === 'QI');
                  const label = id.replace(/^WH0\d-/, '');
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => go(`#/warehouse/bins/${id}`)}
                      title={`${id}: ${used}/${b.capacity} pallets${qs.length ? ` — ${qs.map((q) => MATERIALS[q.material].name).join(', ')}` : ''}`}
                      className={cx('press relative h-10 cursor-pointer overflow-hidden rounded border text-left', sel === id ? 'border-accent ring-2 ring-[oklch(0.7_0.135_248/0.35)]' : 'border-line-soft hover:border-s4', binLocked(s, id) && 'opacity-50')}
                    >
                      <span className="absolute inset-x-0 bottom-0" style={{ height: `${fill * 100}%`, background: blocked ? 'var(--color-bad-soft)' : qi ? 'var(--color-warn-soft)' : 'oklch(0.7 0.135 248 / 0.2)' }} aria-hidden />
                      <span className="mono relative block truncate px-1 pt-0.5 text-[10px] text-ink-2">{label}</span>
                      <span className="tnum relative block px-1 text-[10px] text-ink-3">{used}/{b.capacity}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Panel>
        ))}
      </div>
      <div>
        {sel ? <BinDetail s={s} id={sel} /> : <Panel title="Storage bin"><Empty title="Select a bin">Bins are colored by fill level. Amber = quality inspection stock, red = blocked stock.</Empty></Panel>}
      </div>
    </div>
  );
}

function orderCells(g: { ids: string[]; rows: number; cols: number; rack?: unknown }) {
  if (!g.rack) return g.ids;
  // show highest level on top: rows = levels, columns = bays
  const out: string[] = [];
  for (let l = g.rows; l >= 1; l--) for (let b = 1; b <= g.cols; b++) out.push(g.ids.find((id) => id.endsWith(`-${String(b).padStart(2, '0')}-${l}`))!);
  return out.filter(Boolean);
}

function BinDetail({ s, id }: { s: SimState; id: string }) {
  const b = BIN_MAP[id];
  const qs = Object.values(s.quants).filter((q) => q.bin === id);
  const [transfer, setTransfer] = useState<string | null>(null);
  const focus = useApp((st) => st.focus);
  return (
    <Panel title={<span className="mono">{id}</span>} sub={`${b.type} · ${b.capacity} pallet places · ${binFree(s, id)} free`}>
      <div className="flex flex-col gap-3 p-4">
        {qs.length === 0 && <p className="text-sm text-ink-3">Empty.</p>}
        {qs.map((q) => {
          const m = MATERIALS[q.material];
          return (
            <div key={q.id} className="rounded-md border border-line-soft p-3">
              <div className="text-sm font-medium text-ink">{m.name}</div>
              <div className="mono text-xs text-ink-3">batch {q.batch}{q.order ? ` · staged for ${q.order}` : ''}</div>
              <div className="mt-2">
                <KV cols={3} items={[["Available", fmtQty(q.qty, m.uom)], ['Reserved', fmtQty(q.reserved, m.uom)], ['Free', fmtQty(q.qty - q.reserved, m.uom)]]} />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Badge tone={q.stockType === 'UNR' ? 'ok' : q.stockType === 'QI' ? 'warn' : 'bad'}>{q.stockType === 'UNR' ? 'Unrestricted' : q.stockType === 'QI' ? 'Quality inspection' : 'Blocked'}</Badge>
                {q.stockType === 'UNR' && !q.order && q.qty - q.reserved > 0 && transfer !== q.id && (
                  <Button size="sm" onClick={() => setTransfer(q.id)}>Transfer…</Button>
                )}
              </div>
              {transfer === q.id && (
                <div className="mt-3">
                  <TransferForm quantId={q.id} onDone={() => setTransfer(null)} />
                </div>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => { go('#/factory'); setTimeout(() => focus(`bin:${id}`), 50); }}>Show in 3D</Button>
          {qs.length > 0 && <Button size="sm" variant="ghost" onClick={() => go(`#/warehouse/count/${id}`)}>Count this bin</Button>}
        </div>
      </div>
    </Panel>
  );
}

export function TransferForm({ quantId, onDone }: { quantId: string; onDone: () => void }) {
  const s = useSim();
  const run = useApp((st) => st.run);
  const q = s.quants[quantId];
  const [qty, setQty] = useState(q ? String(q.qty - q.reserved) : '');
  const [to, setTo] = useState('');
  if (!q) return null;
  const m = MATERIALS[q.material];
  const opts = BINS.filter((b) => b.type === m.binType && b.id !== q.bin);
  return (
    <div className="flex flex-col gap-2 rounded-md bg-s2 p-3">
      <div className="text-xs font-medium text-ink-2">Transfer posting · movement 311</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={`Quantity (${m.uom})`}>{(id) => <Input id={id} type="number" value={qty} onChange={(e) => setQty(e.target.value)} />}</Field>
        <Field label="To bin">
          {(id) => (
            <Select id={id} value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Select…</option>
              {opts.map((b) => (
                <option key={b.id} value={b.id} disabled={binFree(s, b.id) === 0}>
                  {b.id} ({binFree(s, b.id)} free)
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            const r = run('MIGO_TR', (sim) => transferStock(sim, quantId, Number(qty), to));
            if (r.ok) onDone();
          }}
        >
          Post transfer
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- warehouse tasks
function Tasks({ s }: { s: SimState }) {
  const [showDone, setShowDone] = useState(false);
  const list = docsOf(s, 'WT')
    .filter((w) => showDone || w.status === 'CREATED' || w.status === 'IN_PROGRESS')
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <Panel
      title="Warehouse tasks"
      sub="Forklift moves created by goods receipts, staging, picking and transfers"
      actions={
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-[var(--color-accent)]" />
          Show confirmed
        </label>
      }
    >
      {list.length === 0 ? (
        <Empty title="No open warehouse tasks">All forklifts are idle. Tasks appear when you post receipts, stage orders or pick deliveries.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="dtable">
            <thead>
              <tr>
                <th>Task</th>
                <th>Type</th>
                <th>Material</th>
                <th className="num">Qty</th>
                <th>From → to</th>
                <th>Forklift</th>
                <th>Reference</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 100).map((w) => {
                const p = w.startedAt !== undefined ? Math.min(1, (s.t - w.startedAt) / w.durationMin) : 0;
                return (
                  <tr key={w.id}>
                    <td className="mono strong">{w.id}</td>
                    <td>{w.kind.replace('_', ' ').toLowerCase()}</td>
                    <td className="max-w-[180px] truncate">{MATERIALS[w.material].name}</td>
                    <td className="num tnum">{fmtQty(w.qty, MATERIALS[w.material].uom)}</td>
                    <td className="mono text-xs">{w.fromBin} → {w.toBin}</td>
                    <td className="mono text-xs">{w.forklift ?? '—'}</td>
                    <td>{w.ref ? <DocLink id={w.ref} s={s} /> : '—'}</td>
                    <td className="w-36">
                      {w.status === 'IN_PROGRESS' ? <Bar value={p} label="Task progress" /> : <DocStatusPill status={w.status} label={w.status === 'CREATED' ? 'Queued' : w.status === 'COMPLETED' ? 'Confirmed' : undefined} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- physical inventory
function Count({ s, bin }: { s: SimState; bin?: string }) {
  const run = useApp((st) => st.run);
  const [target, setTarget] = useState(bin ?? '');
  useEffect(() => {
    if (bin) setTarget(bin);
  }, [bin]);
  const docs = docsOf(s, 'PI').sort((a, b) => Number(a.posted) - Number(b.posted) || b.createdAt - a.createdAt);
  const stocked = BINS.filter((b) => Object.values(s.quants).some((q) => q.bin === b.id));
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Panel title="Create count document" sub="MI01 · freezes the book stock of a bin">
        <div className="flex flex-col gap-3 p-4">
          <Field label="Storage bin" hint="Cycle counting regularly keeps book stock honest.">
            {(id) => (
              <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Select a bin with stock…</option>
                {stocked.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button variant="primary" disabled={!target} onClick={() => run('MI01', (sim) => createPhysInv(sim, target))}>
            Create physical inventory document
          </Button>
          <Callout>
            Counting compares <b className="text-ink">book stock</b> (what was posted) with <b className="text-ink">physical stock</b> (what is on the shelf). Differences are posted with movement 701 (gain) or 702 (loss).
          </Callout>
        </div>
      </Panel>
      <div className="flex flex-col gap-4">
        {docs.length === 0 && <Panel title="Count documents"><Empty title="No physical inventory documents">Create one for a bin on the left.</Empty></Panel>}
        {docs.map((pi) => (
          <PiCard key={pi.id} s={s} id={pi.id} run={run} />
        ))}
      </div>
    </div>
  );
}

function PiCard({ s, id, run }: { s: SimState; id: string; run: ReturnType<typeof useApp.getState>['run'] }) {
  const pi = getDoc(s, id, 'PI')!;
  const [counts, setCounts] = useState<string[]>(pi.items.map((i) => (i.counted !== undefined ? String(i.counted) : '')));
  useEffect(() => {
    setCounts(pi.items.map((i) => (i.counted !== undefined ? String(i.counted) : '')));
  }, [pi.items.map((i) => i.counted).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Panel title={<><span className="mono">{pi.id}</span> · <span className="mono">{pi.bin}</span></>} sub={pi.posted ? 'Differences posted' : 'Book stock frozen — count and post'} actions={<DocStatusPill status={pi.status} />}>
      <table className="dtable">
        <thead>
          <tr>
            <th>Material</th>
            <th>Batch</th>
            <th className="num">Book</th>
            <th className="num">Counted</th>
            <th className="num">Difference</th>
          </tr>
        </thead>
        <tbody>
          {pi.items.map((it, i) => {
            const m = MATERIALS[it.material];
            const c = Number(counts[i]);
            const diff = counts[i] === '' ? null : c - it.book;
            return (
              <tr key={it.quant}>
                <td className="max-w-[200px] truncate">{m.name}</td>
                <td className="mono text-xs">{it.batch}</td>
                <td className="num tnum">{fmtQty(it.book, m.uom)}</td>
                <td className="num w-36">
                  {pi.posted ? (
                    <span className="tnum">{fmtQty(it.counted ?? 0, m.uom)}</span>
                  ) : (
                    <Input aria-label={`Counted ${m.name}`} type="number" value={counts[i]} onChange={(e) => setCounts(counts.map((x, j) => (j === i ? e.target.value : x)))} className="h-7" />
                  )}
                </td>
                <td className={cx('num tnum', diff && diff < 0 ? 'text-[oklch(0.78_0.14_25)]' : diff && diff > 0 ? 'text-ok' : '')}>{diff === null ? '—' : `${diff > 0 ? '+' : ''}${fmtQty(diff, m.uom)}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!pi.posted && (
        <div className="flex gap-2 p-3">
          <Button size="sm" icon={<ScanLine className="size-3.5" />} onClick={() => run('MI01', (sim) => countPhysInv(sim, pi.id))}>
            Count bin (scanner)
          </Button>
          <Button size="sm" variant="primary" onClick={() => run('MI01', (sim) => postPhysInv(sim, pi.id, counts.map((c) => (c === '' ? NaN : Number(c)))))}>
            Post differences
          </Button>
        </div>
      )}
    </Panel>
  );
}
