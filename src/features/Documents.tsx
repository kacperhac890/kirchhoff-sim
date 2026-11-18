import { useMemo, useState } from 'react';
import { FileSearch } from 'lucide-react';
import { useApp } from '../store/store';
import { useSim, parseRoute, go } from '../app/hooks';
import { CARRIERS, CUSTOMERS, DOC_LABEL, MATERIALS, MVT_TEXT, SUPPLIERS, fmtDateTime, fmtEur, fmtQty, type AnyDoc, type DocType, type SimState } from '../engine';
import { TCODES } from '../game/roles';
import { Badge, DocStatusPill, Empty, Input, KV, PageHeader, Panel, SectionTitle, Select, Tabs, cx } from '../ui/kit';
import { DocLink } from '../ui/links';

const STAGE: Record<DocType, number> = { PR: 0, PO: 1, IBD: 2, MD: 3, IL: 4, QN: 5, PI: 3, RES: 3, PP: 5, WT: 4, CF: 6, SO: 7, DLV: 8, SHP: 9, PMN: 5, MO: 6 };
function stageOf(d: AnyDoc) {
  if (d.type === 'MD') {
    if (d.mvt === '601') return 10;
    if (d.mvt === '261') return 5.5;
    if (d.mvt === '101' && d.refs.some((r) => r.startsWith('PP-'))) return 7;
    return 3;
  }
  if (d.type === 'IL') return d.origin === '03' ? 6.5 : 4;
  return STAGE[d.type];
}

export function DocumentsPage() {
  const s = useSim();
  const route = useApp((st) => st.route);
  const { sub, parts } = parseRoute(route);
  const tab = sub === 'audit' ? 'audit' : 'docs';
  const selected = sub && sub !== 'audit' ? decodeURIComponent(parts.slice(1).join('/')) : undefined;
  return (
    <div>
      <PageHeader title="Documents" sap="Document flow · audit trail" sub="Every posting creates an immutable document linked to its predecessors" />
      <Tabs value={tab} onChange={(t) => go(t === 'audit' ? '#/documents/audit' : '#/documents')} tabs={[{ id: 'docs', label: 'Document center' }, { id: 'audit', label: 'Audit log', count: s.audit.filter((a) => !a.ok).length }]} />
      <div className="p-6">{tab === 'audit' ? <Audit s={s} /> : <DocCenter s={s} selected={selected} />}</div>
    </div>
  );
}

function DocCenter({ s, selected }: { s: SimState; selected?: string }) {
  const [type, setType] = useState<'ALL' | DocType>('ALL');
  const [q, setQ] = useState('');
  const docs = useMemo(
    () =>
      Object.values(s.docs)
        .filter((d) => (type === 'ALL' ? d.type !== 'WT' : d.type === type) && (!q || d.id.toLowerCase().includes(q.toLowerCase()) || DOC_LABEL[d.type].toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 200),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s, s.t, type, q, Object.keys(s.docs).length],
  );
  const doc = selected ? s.docs[selected] : undefined;
  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
      <Panel
        title="Documents"
        sub={`${Object.keys(s.docs).length} documents in this plant`}
        actions={
          <div className="flex gap-2">
            <Input aria-label="Search documents" placeholder="Number…" value={q} onChange={(e) => setQ(e.target.value)} className="h-7 w-32" />
            <Select aria-label="Document type" value={type} onChange={(e) => setType(e.target.value as 'ALL' | DocType)} className="h-7 w-44">
              <option value="ALL">All types</option>
              {(Object.keys(DOC_LABEL) as DocType[]).filter((t) => t !== 'RES').map((t) => (
                <option key={t} value={t}>{DOC_LABEL[t]}</option>
              ))}
            </Select>
          </div>
        }
        bodyClass="max-h-[70vh] overflow-y-auto"
      >
        {docs.length === 0 ? (
          <Empty icon={<FileSearch className="size-6" />} title="No documents match" />
        ) : (
          <table className="dtable">
            <thead>
              <tr>
                <th>Number</th>
                <th>Type</th>
                <th>Created</th>
                <th>User</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} data-clickable="true" data-selected={doc?.id === d.id} onClick={() => go(`#/documents/${encodeURIComponent(d.id)}`)}>
                  <td className="mono strong">{d.id}</td>
                  <td className="text-xs">{DOC_LABEL[d.type]}{d.type === 'MD' ? ` ${d.mvt}` : ''}</td>
                  <td className="tnum text-xs">{fmtDateTime(d.createdAt)}</td>
                  <td className="mono text-xs">{d.createdBy}</td>
                  <td><DocStatusPill status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {doc ? <DocDetail s={s} doc={doc} key={doc.id} /> : <Panel title="Document"><Empty title="Select a document">See its items, full history and the document flow it belongs to.</Empty></Panel>}
    </div>
  );
}

function summary(s: SimState, d: AnyDoc): [string, React.ReactNode][] {
  const mt = (id: string) => MATERIALS[id]?.name ?? id;
  switch (d.type) {
    case 'PR':
      return [['Material', mt(d.material)], ['Quantity', fmtQty(d.qty, MATERIALS[d.material].uom)], ['Source', d.source], ['Need by', fmtDateTime(d.needBy)]];
    case 'PO':
      return [['Supplier', SUPPLIERS[d.supplier].name], ['Expected delivery', fmtDateTime(d.eta)], ['Value', fmtEur(d.items.reduce((a, i) => a + i.qty * i.price, 0))], ['Fully delivered', d.delivered ? 'Yes' : 'No']];
    case 'IBD':
      return [['Supplier', SUPPLIERS[d.supplier].name], ['Truck', d.carrierPlate], ['ETA', fmtDateTime(d.eta)], ['Arrived', d.arrivedAt !== undefined ? fmtDateTime(d.arrivedAt) : '—']];
    case 'MD':
      return [['Movement type', `${d.mvt} — ${MVT_TEXT[d.mvt]}`], ['Value', fmtEur(d.value)], ['Reversed by', d.reversedBy ? <DocLink id={d.reversedBy} s={s} /> : '—'], ['Reverses', d.reverses ? <DocLink id={d.reverses} s={s} /> : '—']];
    case 'PP':
      return [['Product', mt(d.product)], ['Quantity', `${d.qty} pcs`], ['Planned', `${fmtDateTime(d.plannedStart)} → ${fmtDateTime(d.plannedEnd)}`], ['Cost plan / actual', `${fmtEur(d.plannedCost)} / ${fmtEur(d.actualCost)}`], ['Goods receipt', `${d.grQty} pcs`], ['Scrap', `${d.scrapTotal} pcs`]];
    case 'CF':
      return [['Order / op', `${d.order} / ${d.op}`], ['Yield', `${d.yield} pcs`], ['Scrap', `${d.scrap} pcs`], ['Machine', d.machine], ['Duration', `${Math.round(d.durationMin)} min`], ['Final', d.final ? 'Yes' : 'No']];
    case 'IL':
      return [['Origin', d.origin === '01' ? '01 Goods receipt' : '03 Production'], ['Material', mt(d.material)], ['Batch', d.batch], ['Quantity', fmtQty(d.qty, MATERIALS[d.material].uom)], ['Decision', d.decision ?? 'open'], ['Accepted', d.acceptedQty ?? '—']];
    case 'QN':
      return [['Type', d.kind], ['Material', mt(d.material)], ['Batch', d.batch ?? '—'], ['Defect', d.defect], ['Cost', fmtEur(d.cost)]];
    case 'PMN':
      return [['Type', d.kind], ['Equipment', d.machine], ['Description', d.description], ['Order', d.order ? <DocLink id={d.order} s={s} /> : '—']];
    case 'MO':
      return [['Type', d.kind], ['Equipment', d.machine], ['Technician', d.technician ? s.employees[d.technician].name : '—'], ['Duration', `${d.durationMin} min`], ['Cost', fmtEur(d.cost)], ['Parts', d.parts.map((p) => `${p.qty}× ${p.material}`).join(', ') || '—']];
    case 'SO':
      return [['Customer', CUSTOMERS[d.customer].name], ['Requested', fmtDateTime(d.due)], ['Priority', d.priority], ['Penalty', `€${d.penaltyPerHour}/h`]];
    case 'DLV':
      return [['Customer', CUSTOMERS[d.customer].name], ['Dock', `${d.dock + 1}`], ['Picking', d.pickStatus.toLowerCase()], ['Packed', d.packed ? `${d.handlingUnits} HU` : 'No'], ['Goods issue', d.pgi ? 'Posted' : 'Open']];
    case 'SHP':
      return [['Carrier', CARRIERS[d.carrier].name], ['Route', d.route], ['Freight', fmtEur(d.cost)], ['Departed', d.departedAt !== undefined ? fmtDateTime(d.departedAt) : '—'], ['Delivered', d.deliveredAt !== undefined ? fmtDateTime(d.deliveredAt) : '—']];
    case 'WT':
      return [['Type', d.kind], ['Material', mt(d.material)], ['Quantity', fmtQty(d.qty, MATERIALS[d.material].uom)], ['From → to', `${d.fromBin} → ${d.toBin}`], ['Forklift', d.forklift ?? '—']];
    case 'PI':
      return [['Bin', d.bin], ['Items', String(d.items.length)], ['Posted', d.posted ? 'Yes' : 'No']];
    default:
      return [];
  }
}

function itemsTable(d: AnyDoc) {
  const rows: string[][] = [];
  let head: string[] = [];
  if (d.type === 'PO') {
    head = ['Material', 'Ordered', 'Received', 'Price'];
    for (const i of d.items) rows.push([MATERIALS[i.material].name, fmtQty(i.qty, MATERIALS[i.material].uom), fmtQty(i.received, MATERIALS[i.material].uom), `€${i.price}`]);
  } else if (d.type === 'MD') {
    head = ['Material', 'Quantity', 'Batch', 'From', 'To'];
    for (const i of d.items) rows.push([MATERIALS[i.material].name, fmtQty(i.qty, MATERIALS[i.material].uom), i.batch, i.fromBin ?? (i.stockType ?? '—'), i.toBin ?? (i.toStockType ?? '—')]);
  } else if (d.type === 'PP') {
    head = ['Op', 'Operation', 'Machine', 'Yield', 'Scrap', 'Status'];
    for (const o of d.ops) rows.push([o.no, o.name, o.machine ?? '—', String(o.produced - o.scrap), String(o.scrap), o.status.toLowerCase()]);
  } else if (d.type === 'IL') {
    head = ['Characteristic', 'Tolerance', 'Result'];
    for (const c of d.chars) rows.push([c.name, `${c.lsl} – ${c.usl} ${c.unit}`, c.recorded !== undefined ? String(c.recorded) : '—']);
  } else if (d.type === 'SO' || d.type === 'DLV') {
    head = ['Material', 'Quantity', d.type === 'SO' ? 'Delivered' : 'Picked'];
    for (const i of d.items) rows.push([MATERIALS[i.material].name, String(i.qty), String('delivered' in i ? i.delivered : i.picked)]);
  } else if (d.type === 'PI') {
    head = ['Material', 'Batch', 'Book', 'Counted'];
    for (const i of d.items) rows.push([MATERIALS[i.material].name, i.batch, fmtQty(i.book), i.counted !== undefined ? fmtQty(i.counted) : '—']);
  }
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-line-soft">
      <table className="dtable">
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={j === 0 ? 'strong' : ''}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocDetail({ s, doc }: { s: SimState; doc: AnyDoc }) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {DOC_LABEL[doc.type]} <span className="mono">{doc.id}</span>
        </span>
      }
      sub={`Created ${fmtDateTime(doc.createdAt)} by ${doc.createdBy}${doc.text ? ` · ${doc.text}` : ''}`}
      actions={<DocStatusPill status={doc.status} />}
    >
      <div className="flex flex-col gap-5 p-4">
        <KV cols={3} items={summary(s, doc)} />
        {itemsTable(doc)}
        <section>
          <SectionTitle>Document flow</SectionTitle>
          <FlowGraph s={s} root={doc} />
        </section>
        <section>
          <SectionTitle>Transaction history (immutable)</SectionTitle>
          <ol className="flex flex-col gap-1.5">
            {doc.history.map((h, i) => (
              <li key={i} className="flex gap-3 text-xs">
                <span className="tnum w-20 shrink-0 text-ink-4">{fmtDateTime(h.t)}</span>
                <span className="mono w-24 shrink-0 truncate text-ink-3">{h.user}</span>
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

function FlowGraph({ s, root }: { s: SimState; root: AnyDoc }) {
  const { nodes, edges } = useMemo(() => {
    const seen = new Map<string, AnyDoc>();
    const queue: [string, number][] = [[root.id, 0]];
    while (queue.length && seen.size < 28) {
      const [id, depth] = queue.shift()!;
      const d = s.docs[id];
      if (!d || seen.has(id)) continue;
      if (d.type === 'WT' && id !== root.id) continue;
      seen.set(id, d);
      if (depth < 4) for (const r of d.refs) if (!seen.has(r)) queue.push([r, depth + 1]);
    }
    const list = [...seen.values()];
    const stages = [...new Set(list.map(stageOf))].sort((a, b) => a - b);
    const cols = new Map<number, AnyDoc[]>();
    for (const d of list) {
      const c = stages.indexOf(stageOf(d));
      cols.set(c, [...(cols.get(c) ?? []), d]);
    }
    const pos = new Map<string, { x: number; y: number; d: AnyDoc }>();
    for (const [c, ds] of cols) ds.sort((a, b) => a.createdAt - b.createdAt).forEach((d, i) => pos.set(d.id, { x: c * 168, y: i * 58, d }));
    const e: [string, string][] = [];
    for (const d of list) for (const r of d.refs) if (pos.has(r) && d.id < r) e.push([d.id, r]);
    return { nodes: [...pos.values()], edges: e.map(([a, b]) => [pos.get(a)!, pos.get(b)!] as const) };
  }, [s, root]);
  const W = Math.max(...nodes.map((n) => n.x)) + 152;
  const H = Math.max(...nodes.map((n) => n.y)) + 46;
  return (
    <div className="overflow-x-auto rounded-md border border-line-soft bg-bg p-3">
      <svg width={W} height={H} role="img" aria-label="Document flow graph">
        {edges.map(([a, b], i) => {
          const [l, r] = a.x <= b.x ? [a, b] : [b, a];
          const x1 = l.x + 148;
          const y1 = l.y + 21;
          const x2 = r.x;
          const y2 = r.y + 21;
          const sameCol = l.x === r.x;
          const path = sameCol ? `M ${l.x + 74} ${l.y + 42} L ${r.x + 74} ${r.y}` : `M ${x1} ${y1} C ${x1 + 14} ${y1}, ${x2 - 14} ${y2}, ${x2} ${y2}`;
          return <path key={i} d={path} fill="none" stroke="oklch(0.45 0.05 248)" strokeWidth={1.4} />;
        })}
        {nodes.map(({ x, y, d }) => (
          <g key={d.id} transform={`translate(${x},${y})`} className="cursor-pointer" onClick={() => go(`#/documents/${encodeURIComponent(d.id)}`)} role="link" aria-label={`${DOC_LABEL[d.type]} ${d.id}`}>
            <rect width={148} height={42} rx={6} fill={d.id === root.id ? 'oklch(0.7 0.135 248 / 0.22)' : 'oklch(0.235 0.012 250)'} stroke={d.id === root.id ? 'oklch(0.7 0.135 248)' : 'oklch(0.36 0.012 250)'} />
            <text x={10} y={16} fontSize={10} fill="oklch(0.68 0.012 250)">
              {DOC_LABEL[d.type]}{d.type === 'MD' ? ` · ${d.mvt}` : ''}
            </text>
            <text x={10} y={32} fontSize={12} fill="oklch(0.95 0.005 250)" style={{ fontFamily: 'IBM Plex Mono' }}>
              {d.id}
            </text>
            <circle cx={136} cy={13} r={3.5} fill={d.status === 'COMPLETED' ? 'var(--color-ok)' : d.status === 'CANCELLED' ? 'var(--color-idle)' : d.status === 'BLOCKED' ? 'var(--color-bad)' : 'var(--color-warn)'} />
          </g>
        ))}
      </svg>
    </div>
  );
}

function Audit({ s }: { s: SimState }) {
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const list = [...s.audit].reverse().filter((a) => (!failed || !a.ok) && (!q || `${a.tcode} ${a.message} ${a.user}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <Panel
      title="Audit log"
      sub="Every transaction attempt — accepted or rejected — with user and simulated time"
      actions={
        <div className="flex items-center gap-3">
          <Input aria-label="Search audit log" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="h-7 w-40" />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={failed} onChange={(e) => setFailed(e.target.checked)} className="accent-[var(--color-accent)]" />
            Rejected only
          </label>
        </div>
      }
    >
      {list.length === 0 ? (
        <Empty title="Nothing logged yet">Post your first transaction.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="dtable">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Transaction</th>
                <th>Result</th>
                <th>Message</th>
                <th>Documents</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 300).map((a) => (
                <tr key={a.id}>
                  <td className="tnum text-xs">{fmtDateTime(a.t)}</td>
                  <td className="mono text-xs">{a.user}</td>
                  <td className="mono text-xs">{TCODES[a.tcode as keyof typeof TCODES]?.sap ?? a.tcode}</td>
                  <td>{a.ok ? <Badge tone="ok">Posted</Badge> : <Badge tone="bad">Rejected</Badge>}</td>
                  <td className={cx('max-w-[480px] truncate text-xs', !a.ok && 'text-ink')} title={a.message}>{a.message}</td>
                  <td className="text-xs">
                    <span className="flex gap-2">
                      {a.docs.slice(0, 3).map((d) => <DocLink key={d} id={d} s={s} />)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
