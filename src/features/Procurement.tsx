import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useApp } from '../store/store';
import { useSim, parseRoute, go } from '../app/hooks';
import { MATERIALS, QUOTES, SUPPLIERS, cancelPR, createPO, createPR, docsOf, fmtDateTime, fmtEur, fmtQty, getDoc, quotesFor, supplierPerformance, type SimState } from '../engine';
import { Badge, Button, DocStatusPill, Empty, Field, Input, PageHeader, Panel, Select, Tabs, cx } from '../ui/kit';
import { DocLink, MatName } from '../ui/links';

type Tab = 'pr' | 'po' | 'suppliers';

export function ProcurementPage() {
  const s = useSim();
  const route = useApp((st) => st.route);
  const { sub, id } = parseRoute(route);
  const tab: Tab = sub === 'po' ? 'po' : sub === 'suppliers' ? 'suppliers' : 'pr';
  const openPr = docsOf(s, 'PR').filter((p) => p.status === 'CREATED').length;
  const openPo = docsOf(s, 'PO').filter((p) => p.status !== 'COMPLETED').length;
  return (
    <div>
      <PageHeader title="Procurement" sap="MM-PUR · ME51N · ME21N · ME2M" sub="Requisitions, quotations, purchase orders and supplier performance" />
      <Tabs
        value={tab}
        onChange={(t) => go(t === 'pr' ? '#/procurement' : `#/procurement/${t}`)}
        tabs={[
          { id: 'pr', label: 'Requisitions', count: openPr },
          { id: 'po', label: 'Purchase orders', count: openPo },
          { id: 'suppliers', label: 'Suppliers' },
        ]}
      />
      <div className="p-6">
        {tab === 'pr' && <Requisitions s={s} selected={id} />}
        {tab === 'po' && <PurchaseOrders s={s} />}
        {tab === 'suppliers' && <Suppliers s={s} />}
      </div>
    </div>
  );
}

function Requisitions({ s, selected }: { s: SimState; selected?: string }) {
  const run = useApp((st) => st.run);
  const prs = docsOf(s, 'PR').sort((a, b) => Number(a.status !== 'CREATED') - Number(b.status !== 'CREATED') || b.createdAt - a.createdAt);
  const [sel, setSel] = useState<string | undefined>(selected);
  const active = getDoc(s, sel, 'PR') ?? prs.find((p) => p.status === 'CREATED');
  const purchased = Object.values(MATERIALS).filter((m) => m.type !== 'FIN');
  const [mat, setMat] = useState(purchased[0].id);
  const [qty, setQty] = useState('');
  // free PO without a requisition (e.g. replacement order)
  const [direct, setDirect] = useState(false);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_480px]">
      <div className="flex flex-col gap-4">
        <Panel title="Purchase requisitions" sub="From MRP, maintenance or manual entry">
          {prs.length === 0 ? (
            <Empty icon={<ShoppingCart className="size-6" />} title="No requisitions">Run MRP in Production, or create one manually below.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Requisition</th>
                    <th>Source</th>
                    <th>Material</th>
                    <th className="num">Quantity</th>
                    <th>Need by</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {prs.map((p) => (
                    <tr key={p.id} data-clickable="true" data-selected={active?.id === p.id && !direct} onClick={() => { setSel(p.id); setDirect(false); }}>
                      <td className="mono strong">{p.id}</td>
                      <td><Badge>{p.source.toLowerCase()}</Badge></td>
                      <td className="max-w-[220px] truncate">{MATERIALS[p.material].name}</td>
                      <td className="num tnum">{fmtQty(p.qty, MATERIALS[p.material].uom)}</td>
                      <td className="tnum text-xs">{fmtDateTime(p.needBy)}</td>
                      <td>{p.status === 'CREATED' ? <Badge tone="warn">Open</Badge> : <DocStatusPill status={p.status} label={p.status === 'COMPLETED' ? 'Ordered' : undefined} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title={<>Create requisition <span className="mono ml-1 text-xs font-normal text-ink-3">ME51N</span></>}>
          <form className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); const r = run('ME51N', (sim) => createPR(sim, mat, Number(qty))); if (r.ok) { setQty(''); setSel(r.docs?.[0]); setDirect(false); } }}>
            <Field label="Material">{(id) => <Select id={id} value={mat} onChange={(e) => setMat(e.target.value)}>{purchased.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}</Field>
            <Field label={`Quantity (${MATERIALS[mat].uom})`} required>{(id) => <Input id={id} type="number" value={qty} onChange={(e) => setQty(e.target.value)} />}</Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary">Create</Button>
              <Button type="button" onClick={() => setDirect(true)}>Direct PO…</Button>
            </div>
          </form>
        </Panel>
      </div>
      {direct ? (
        <ConvertPanel s={s} material={mat} qty={Number(qty) || 0} onDone={() => setDirect(false)} />
      ) : active && active.status === 'CREATED' ? (
        <ConvertPanel s={s} prId={active.id} material={active.material} qty={active.qty} onDone={() => setSel(undefined)} onCancel={() => run('ME51N', (sim) => cancelPR(sim, active.id))} key={active.id} />
      ) : (
        <Panel title="Source of supply"><Empty title="Select an open requisition">Compare quotations and convert it into a purchase order.</Empty></Panel>
      )}
    </div>
  );
}

function ConvertPanel({ s, prId, material, qty, onDone, onCancel }: { s: SimState; prId?: string; material: string; qty: number; onDone: () => void; onCancel?: () => void }) {
  const run = useApp((st) => st.run);
  const quotes = quotesFor(material);
  const perf = supplierPerformance(s);
  const [sup, setSup] = useState(quotes[0]?.supplier ?? '');
  const [q, setQ] = useState(String(qty || ''));
  const m = MATERIALS[material];
  return (
    <Panel title={<>Convert to purchase order <span className="mono ml-1 text-xs font-normal text-ink-3">ME21N</span></>} sub={prId ? `Requisition ${prId}` : 'Direct purchase order'}>
      <div className="flex flex-col gap-4 p-4">
        <div className="text-sm text-ink">
          <MatName id={material} />
        </div>
        {!prId && <Field label={`Quantity (${m.uom})`} required>{(id) => <Input id={id} type="number" value={q} onChange={(e) => setQ(e.target.value)} />}</Field>}
        {prId && <p className="tnum text-sm text-ink-2">Quantity {fmtQty(qty, m.uom)}</p>}
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-ink-2">Quotation comparison</legend>
          {quotes.length === 0 ? (
            <p className="text-sm text-ink-3">No approved source for this material.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {quotes.map((x) => {
                const sd = x.supplierData;
                const p = perf[x.supplier];
                const total = x.price * (prId ? qty : Number(q) || 0);
                return (
                  <label key={x.supplier} className={cx('press flex cursor-pointer items-start gap-3 rounded-md border p-3', sup === x.supplier ? 'border-accent bg-accent-soft' : 'border-line-soft hover:bg-s2')}>
                    <input type="radio" name="sup" checked={sup === x.supplier} onChange={() => setSup(x.supplier)} className="mt-1 accent-[var(--color-accent)]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-medium text-ink">{sd.name}</span>
                        <span className="text-xs text-ink-3">{sd.city}, {sd.country}</span>
                      </span>
                      <span className="tnum mt-1 grid grid-cols-2 gap-x-4 text-xs text-ink-2 sm:grid-cols-4">
                        <span>€{x.price}/{m.uom}</span>
                        <span>{x.leadHours} h lead time</span>
                        <span>{Math.round(sd.reliability * 100)} % on time</span>
                        <span>{Math.round(sd.quality * 100)} % quality</span>
                      </span>
                      <span className="tnum mt-1 block text-2xs text-ink-3">Total {fmtEur(total)}{p.delivered ? ` · history: ${p.onTime}/${p.delivered} on time, ${p.rejected} rejected` : ''}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={!sup}
            onClick={() => {
              const r = run('ME21N', (sim) => createPO(sim, prId ? { pr: prId, supplier: sup } : { material, qty: Number(q), supplier: sup }));
              if (r.ok) onDone();
            }}
          >
            Create purchase order
          </Button>
          {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel requisition</Button>}
        </div>
      </div>
    </Panel>
  );
}

function PurchaseOrders({ s }: { s: SimState }) {
  const pos = docsOf(s, 'PO').sort((a, b) => Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED') || b.createdAt - a.createdAt);
  return (
    <Panel title="Purchase orders" sub="ME2M">
      {pos.length === 0 ? (
        <Empty title="No purchase orders">Convert a requisition to create one.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="dtable">
            <thead>
              <tr>
                <th>PO</th>
                <th>Supplier</th>
                <th>Material</th>
                <th className="num">Ordered</th>
                <th className="num">Received</th>
                <th className="num">Value</th>
                <th>Delivery</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((p) => {
                const it = p.items[0];
                const m = MATERIALS[it.material];
                const ibd = p.refs.map((r) => s.docs[r]).find((d) => d?.type === 'IBD');
                const late = p.eta > p.originalEta;
                return (
                  <tr key={p.id} data-clickable="true" onClick={() => go(`#/documents/${p.id}`)}>
                    <td className="mono strong">{p.id}</td>
                    <td>{SUPPLIERS[p.supplier].name}</td>
                    <td className="max-w-[200px] truncate">{m.name}</td>
                    <td className="num tnum">{fmtQty(it.qty, m.uom)}</td>
                    <td className="num tnum">{fmtQty(it.received, m.uom)}</td>
                    <td className="num tnum">{fmtEur(it.qty * it.price)}</td>
                    <td className="text-xs">
                      {ibd && ibd.type === 'IBD' && ibd.arrivedAt !== undefined ? <>arrived <DocLink id={ibd.id} s={s} /></> : <span className={cx('tnum', late && 'text-warn')}>ETA {fmtDateTime(p.eta)}{late ? ' (delayed)' : ''}</span>}
                    </td>
                    <td><DocStatusPill status={p.status} /></td>
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

function Suppliers({ s }: { s: SimState }) {
  const perf = supplierPerformance(s);
  return (
    <Panel title="Supplier evaluation" sub="Master data rating and actual performance in this simulation">
      <div className="overflow-x-auto">
        <table className="dtable">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Location</th>
              <th>Materials</th>
              <th className="num">Rated on time</th>
              <th className="num">Rated quality</th>
              <th className="num">POs</th>
              <th className="num">Deliveries on time</th>
              <th className="num">Rejections</th>
              <th className="num">Spend</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(SUPPLIERS).map((sp) => {
              const p = perf[sp.id];
              return (
                <tr key={sp.id}>
                  <td>
                    <div className="text-ink">{sp.name}</div>
                    <div className="mono text-2xs text-ink-3">{sp.id}</div>
                  </td>
                  <td className="text-xs">{sp.city}, {sp.country}</td>
                  <td className="max-w-[220px] truncate text-xs">{QUOTES.filter((q) => q.supplier === sp.id).map((q) => MATERIALS[q.material].name.split(' ')[0]).join(', ')}</td>
                  <td className="num tnum">{Math.round(sp.reliability * 100)} %</td>
                  <td className="num tnum">{Math.round(sp.quality * 100)} %</td>
                  <td className="num tnum">{p.pos}</td>
                  <td className="num tnum">{p.delivered ? `${p.onTime}/${p.delivered}` : '—'}</td>
                  <td className={cx('num tnum', p.rejected > 0 && 'text-[oklch(0.78_0.14_25)]')}>{p.rejected}</td>
                  <td className="num tnum">{fmtEur(p.value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
