import { useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Cpu, ShieldCheck, Undo2, XCircle } from 'lucide-react';
import { Bar as RBar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../store/store';
import { useSim, parseRoute, go } from '../app/hooks';
import {
  MATERIALS,
  SUPPLIERS,
  blockBatch,
  charOk,
  closeQualityNotification,
  createQualityNotification,
  docsOf,
  fmtDateTime,
  fmtEur,
  fmtQty,
  getDoc,
  recordResults,
  returnToVendor,
  scrapQuant,
  unblockBatch,
  usageDecision,
  type InspectionLot,
  type SimState,
} from '../engine';
import { Badge, Button, Callout, DocStatusPill, Empty, Field, Input, KV, PageHeader, Panel, SectionTitle, Select, Tabs, cx } from '../ui/kit';
import { DocLink } from '../ui/links';
import { ChartEmpty, ChartTooltip, SERIES, axisProps, gridProps } from '../ui/charts';

type Tab = 'lots' | 'batches' | 'notifications' | 'stats';

export function QualityPage() {
  const s = useSim();
  const route = useApp((st) => st.route);
  const { sub, id } = parseRoute(route);
  const tab: Tab = sub === 'batches' ? 'batches' : sub === 'notifications' ? 'notifications' : sub === 'stats' ? 'stats' : 'lots';
  const openLots = docsOf(s, 'IL').filter((l) => !l.decision).length;
  const openQn = docsOf(s, 'QN').filter((q) => q.status !== 'COMPLETED').length;
  return (
    <div>
      <PageHeader title="Quality" sap="QM · QA32 · QE51N · QA11 · QM01" sub="Inspection lots, results recording, usage decisions, batches and notifications" />
      <Tabs
        value={tab}
        onChange={(t) => go(t === 'lots' ? '#/quality' : `#/quality/${t}`)}
        tabs={[
          { id: 'lots', label: 'Inspection lots', count: openLots },
          { id: 'batches', label: 'Batches' },
          { id: 'notifications', label: 'Notifications', count: openQn },
          { id: 'stats', label: 'Statistics' },
        ]}
      />
      <div className="p-6">
        {tab === 'lots' && <Lots s={s} selected={sub === 'lot' ? id : undefined} />}
        {tab === 'batches' && <Batches s={s} selected={id} />}
        {tab === 'notifications' && <Notifications s={s} />}
        {tab === 'stats' && <Stats s={s} />}
      </div>
    </div>
  );
}

function lotReady(s: SimState, lot: InspectionLot) {
  if (lot.origin !== '03') return true;
  const pp = getDoc(s, lot.order, 'PP');
  const op = pp?.ops.find((o) => o.inspectionLot === lot.id);
  return op?.status === 'DONE' || op?.status === 'CONFIRMED';
}

function Lots({ s, selected }: { s: SimState; selected?: string }) {
  const lots = docsOf(s, 'IL').sort((a, b) => Number(!!a.decision) - Number(!!b.decision) || b.createdAt - a.createdAt);
  const active = selected ? getDoc(s, selected, 'IL') : lots.find((l) => !l.decision && lotReady(s, l)) ?? lots[0];
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]">
      <Panel title="Inspection lot worklist" sub="QA32">
        {lots.length === 0 ? (
          <Empty icon={<ShieldCheck className="size-6" />} title="No inspection lots">Lots are created automatically at goods receipt of inspected materials (type 01) and when parts reach final inspection QC-01 (type 03).</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Origin</th>
                  <th>Material</th>
                  <th className="num">Lot qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id} data-clickable="true" data-selected={active?.id === l.id} onClick={() => go(`#/quality/lot/${l.id}`)}>
                    <td className="mono strong">{l.id}</td>
                    <td>{l.origin === '01' ? '01 Goods receipt' : '03 Production'}</td>
                    <td className="max-w-[180px] truncate">{MATERIALS[l.material].name}</td>
                    <td className="num tnum">{fmtQty(l.qty, MATERIALS[l.material].uom)}</td>
                    <td>
                      {l.decision ? (
                        <Badge tone={l.decision === 'ACCEPT' ? 'ok' : 'bad'}>{l.decision === 'ACCEPT' ? 'Accepted' : 'Rejected'}</Badge>
                      ) : !lotReady(s, l) ? (
                        <Badge>Measuring…</Badge>
                      ) : l.resultsRecorded ? (
                        <Badge tone="warn">Decision due</Badge>
                      ) : (
                        <Badge tone="warn">Results due</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {active ? <LotDetail s={s} lot={active} key={active.id} /> : <Panel title="Inspection lot"><Empty title="Select a lot" /></Panel>}
    </div>
  );
}

function LotDetail({ s, lot }: { s: SimState; lot: InspectionLot }) {
  const run = useApp((st) => st.run);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(lot.chars.map((c) => [c.code, c.recorded !== undefined ? String(c.recorded) : ''])));
  const [confirmAccept, setConfirmAccept] = useState(false);
  const ready = lotReady(s, lot);
  const anyBad = lot.chars.some((c) => !charOk(c));
  const m = MATERIALS[lot.material];
  const b = s.batches[lot.batch];
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Inspection lot <span className="mono">{lot.id}</span>
        </span>
      }
      sub={`${lot.origin === '01' ? 'Incoming inspection' : 'Final inspection'} · ${m.name}`}
      actions={<DocStatusPill status={lot.status} />}
    >
      <div className="flex flex-col gap-5 p-4">
        <KV
          cols={3}
          items={[
            ['Batch', <span className="mono">{lot.batch}</span>],
            ['Lot quantity', fmtQty(lot.qty, m.uom)],
            ['Sample size', `${lot.sample}`],
            [lot.origin === '01' ? 'Purchase order' : 'Production order', <DocLink id={lot.po ?? lot.order} s={s} />],
            ['Supplier', b?.supplier ? SUPPLIERS[b.supplier].name : '—'],
            ['Created', fmtDateTime(lot.createdAt)],
          ]}
        />
        {!ready && <Callout title="Measuring in progress">QC-01 is still inspecting the lot. Results can be recorded when the operation has finished.</Callout>}

        <section>
          <SectionTitle
            actions={
              ready &&
              !lot.resultsRecorded && (
                <Button size="sm" icon={<Cpu className="size-3.5" />} onClick={() => setVals(Object.fromEntries(lot.chars.map((c) => [c.code, String(c.measured)])))}>
                  Transfer from {lot.origin === '01' ? 'certificate' : 'CMM'}
                </Button>
              )
            }
          >
            Results recording · characteristics
          </SectionTitle>
          <div className="overflow-x-auto rounded-md border border-line-soft">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Characteristic</th>
                  <th className="num">Lower limit</th>
                  <th className="num">Target</th>
                  <th className="num">Upper limit</th>
                  <th className="num">Instrument</th>
                  <th className="num">Result</th>
                  <th>Valuation</th>
                </tr>
              </thead>
              <tbody>
                {lot.chars.map((c) => {
                  const v = vals[c.code];
                  const num = v === '' ? undefined : Number(v);
                  const okv = num === undefined || Number.isNaN(num) ? undefined : charOk(c, num);
                  return (
                    <tr key={c.code}>
                      <td>
                        <div className="text-ink">{c.name}</div>
                        <div className="mono text-2xs text-ink-3">{c.code}</div>
                      </td>
                      <td className="num tnum">{c.lsl} {c.unit}</td>
                      <td className="num tnum">{c.target}</td>
                      <td className="num tnum">{c.usl} {c.unit}</td>
                      <td className="num tnum text-ink-3">{ready ? c.measured : '…'}</td>
                      <td className="num w-32">
                        {lot.resultsRecorded ? (
                          <span className="tnum text-ink">{c.recorded}</span>
                        ) : (
                          <Input aria-label={`Result ${c.name}`} type="number" step="any" disabled={!ready} value={v} onChange={(e) => setVals({ ...vals, [c.code]: e.target.value })} className="h-7" />
                        )}
                      </td>
                      <td>
                        {okv === undefined ? (
                          <span className="text-ink-4">—</span>
                        ) : okv ? (
                          <span className="inline-flex items-center gap-1 text-xs text-ok"><CheckCircle2 className="size-3.5" aria-hidden />Accept</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-[oklch(0.78_0.14_25)]"><XCircle className="size-3.5" aria-hidden />Reject</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {ready && !lot.resultsRecorded && (
            <Button
              variant="primary"
              className="mt-3"
              onClick={() => run('QA32', (sim) => recordResults(sim, lot.id, Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v === '' ? NaN : Number(v)]))))}
            >
              Save results
            </Button>
          )}
        </section>

        {lot.resultsRecorded && !lot.decision && (
          <section className="flex flex-col gap-3">
            <SectionTitle>Usage decision</SectionTitle>
            {anyBad ? (
              <Callout tone="bad" icon={<AlertTriangle className="size-4" />} title="Valuation: nonconforming">
                {lot.chars.filter((c) => !charOk(c)).map((c) => c.name).join(', ')} out of tolerance. Do not release this lot as it is.
              </Callout>
            ) : (
              <Callout tone="ok" icon={<CheckCircle2 className="size-4" />} title="Valuation: all characteristics accepted">
                The lot conforms to specification.
              </Callout>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              <UdOption
                title="Accept"
                text={lot.origin === '01' ? 'Quality → unrestricted (321)' : 'Batch released for shipping'}
                tone="ok"
                recommended={!anyBad}
                onClick={() => (anyBad && !confirmAccept ? setConfirmAccept(true) : run('QA32', (sim) => usageDecision(sim, lot.id, 'ACCEPT')))}
              />
              {lot.origin !== '01' && <UdOption title="100 % sorting" text="Sort out defective parts, accept the rest" tone="warn" recommended={anyBad} onClick={() => run('QA32', (sim) => usageDecision(sim, lot.id, 'SORT'))} />}
              <UdOption title="Reject" text={lot.origin === '01' ? 'Quality → blocked (350), supplier complaint' : 'Whole batch to blocked stock'} tone="bad" recommended={anyBad && lot.origin === '01'} onClick={() => run('QA32', (sim) => usageDecision(sim, lot.id, 'REJECT'))} />
            </div>
            {confirmAccept && (
              <div className="rounded-md border border-[oklch(0.68_0.19_25/0.4)] bg-bad-soft p-3 text-sm">
                <p className="text-ink">Accept a nonconforming lot? Defective parts will be released and may reach the customer.</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="danger" onClick={() => { setConfirmAccept(false); run('QA32', (sim) => usageDecision(sim, lot.id, 'ACCEPT')); }}>
                    Accept anyway
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmAccept(false)}>Back</Button>
                </div>
              </div>
            )}
          </section>
        )}
        {lot.decision && (
          <Callout tone={lot.decision === 'ACCEPT' ? 'ok' : 'bad'} title={`Usage decision: ${lot.decision === 'ACCEPT' ? 'accepted' : 'rejected'}`}>
            {lot.decision === 'ACCEPT' ? `${lot.acceptedQty} of ${lot.qty} accepted.` : 'The batch is blocked and cannot be used or shipped.'}{' '}
            {lot.origin === '03' && lot.order && <>Confirm the inspection operation in <DocLink id={lot.order} s={s} />.</>}
          </Callout>
        )}
      </div>
    </Panel>
  );
}

function UdOption({ title, text, tone, onClick, recommended }: { title: string; text: string; tone: 'ok' | 'warn' | 'bad'; onClick: () => void; recommended?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cx('press cursor-pointer rounded-md border p-3 text-left hover:bg-s2', recommended ? 'border-accent' : 'border-line')}>
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: `var(--color-${tone})` }} aria-hidden />
        <span className="text-sm font-medium text-ink">{title}</span>
        {recommended && <Badge tone="accent" className="ml-auto">Valuation</Badge>}
      </div>
      <div className="mt-1 text-xs text-ink-3">{text}</div>
    </button>
  );
}

function Batches({ s, selected }: { s: SimState; selected?: string }) {
  const run = useApp((st) => st.run);
  const [reason, setReason] = useState('');
  const batches = Object.values(s.batches)
    .filter((b) => Object.values(s.quants).some((q) => q.batch === b.id) || b.status !== 'RELEASED')
    .sort((a, b) => b.createdAt - a.createdAt);
  const sel = selected ? s.batches[selected] : undefined;
  const quants = sel ? Object.values(s.quants).filter((q) => q.batch === sel.id) : [];
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Panel title="Batches" sub="Traceability from supplier to customer">
        <div className="overflow-x-auto">
          <table className="dtable">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Material</th>
                <th>Origin</th>
                <th className="num">In stock</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const qty = Object.values(s.quants).filter((q) => q.batch === b.id).reduce((a, q) => a + q.qty, 0);
                return (
                  <tr key={b.id} data-clickable="true" data-selected={sel?.id === b.id} onClick={() => go(`#/quality/batches/${b.id}`)}>
                    <td className="mono strong">{b.id}</td>
                    <td className="max-w-[200px] truncate">{MATERIALS[b.material].name}</td>
                    <td className="text-xs">{b.origin === 'SUPPLIER' ? SUPPLIERS[b.supplier!].name : b.origin === 'PRODUCTION' ? b.order : 'Opening stock'}</td>
                    <td className="num tnum">{fmtQty(qty, MATERIALS[b.material].uom)}</td>
                    <td>
                      <Badge tone={b.status === 'RELEASED' ? 'ok' : b.status === 'PENDING_QI' ? 'warn' : 'bad'}>{b.status === 'PENDING_QI' ? 'In inspection' : b.status.toLowerCase()}</Badge>
                      {b.shippedTo?.length ? <Badge className="ml-1">shipped</Badge> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      {sel ? (
        <Panel title={<span className="mono">{sel.id}</span>} sub={MATERIALS[sel.material].name}>
          <div className="flex flex-col gap-4 p-4">
            <KV items={[["Status", sel.status.toLowerCase()], ['Created', fmtDateTime(sel.createdAt)], ['Order', sel.order ? <DocLink id={sel.order} s={s} /> : '—'], ['Shipped to', sel.shippedTo?.length ? `${sel.shippedTo.length} delivery(ies)` : '—']]} />
            <ul className="flex flex-col divide-y divide-line-soft rounded-md border border-line-soft">
              {quants.length === 0 && <li className="px-3 py-2 text-sm text-ink-3">No stock left of this batch.</li>}
              {quants.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="mono text-xs">{q.bin}</span>
                  <Badge tone={q.stockType === 'UNR' ? 'ok' : q.stockType === 'QI' ? 'warn' : 'bad'}>{q.stockType}</Badge>
                  <span className="tnum ml-auto">{fmtQty(q.qty, MATERIALS[q.material].uom)}</span>
                  {q.stockType === 'BLK' && sel.origin === 'SUPPLIER' && (
                    <Button size="sm" icon={<Undo2 className="size-3.5" />} onClick={() => run('MIGO_GR', (sim) => returnToVendor(sim, q.id))}>Return to vendor (122)</Button>
                  )}
                  {q.stockType === 'BLK' && sel.origin !== 'SUPPLIER' && (
                    <Button size="sm" variant="danger" onClick={() => run('QA_BLOCK', (sim) => scrapQuant(sim, q.id))}>Scrap (551)</Button>
                  )}
                </li>
              ))}
            </ul>
            {sel.status === 'RELEASED' && quants.length > 0 && (
              <div className="flex flex-col gap-2 rounded-md bg-s2 p-3">
                <Field label="Reason for blocking" required>{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. e-coat thickness below 15 µm" />}</Field>
                <Button variant="danger" icon={<Ban className="size-3.5" />} onClick={() => { const r = run('QA_BLOCK', (sim) => blockBatch(sim, sel.id, reason)); if (r.ok) setReason(''); }}>
                  Block batch (344)
                </Button>
              </div>
            )}
            {sel.status === 'BLOCKED' && quants.some((q) => q.stockType === 'BLK') && <Button onClick={() => run('QA_BLOCK', (sim) => unblockBatch(sim, sel.id))}>Release batch (343)</Button>}
          </div>
        </Panel>
      ) : (
        <Panel title="Batch"><Empty title="Select a batch">Block, release, scrap or return it to the supplier.</Empty></Panel>
      )}
    </div>
  );
}

function Notifications({ s }: { s: SimState }) {
  const run = useApp((st) => st.run);
  const [mat, setMat] = useState('FG-CM-4410');
  const [batch, setBatch] = useState('');
  const [defect, setDefect] = useState('');
  const [qty, setQty] = useState('');
  const list = docsOf(s, 'QN').sort((a, b) => Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED') || b.createdAt - a.createdAt);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Panel title="Quality notifications" sub="Q1 customer · Q2 supplier · Q3 internal">
        {list.length === 0 ? (
          <Empty title="No quality notifications">They are created by rejections, blocked batches and customer complaints — or manually.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Notification</th>
                  <th>Type</th>
                  <th>Material / batch</th>
                  <th>Defect</th>
                  <th className="num">Cost</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((q) => (
                  <tr key={q.id}>
                    <td><DocLink id={q.id} s={s} /></td>
                    <td><Badge tone={q.kind === 'Q1' ? 'bad' : q.kind === 'Q2' ? 'warn' : 'muted'}>{q.kind}</Badge></td>
                    <td className="text-xs">{MATERIALS[q.material].name.split(' ').slice(0, 2).join(' ')} <span className="mono text-ink-3">{q.batch}</span></td>
                    <td className="max-w-[260px] truncate text-xs" title={q.defect}>{q.defect}</td>
                    <td className="num tnum">{q.cost ? fmtEur(q.cost) : '—'}</td>
                    <td><DocStatusPill status={q.status} /></td>
                    <td className="text-right">{q.status !== 'COMPLETED' && <Button size="sm" onClick={() => run('QM01', (sim) => closeQualityNotification(sim, q.id))}>Close</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title={<>New notification <span className="mono ml-1 text-xs font-normal text-ink-3">QM01</span></>}>
        <form className="flex flex-col gap-3 p-4" onSubmit={(e) => { e.preventDefault(); const r = run('QM01', (sim) => createQualityNotification(sim, mat, batch || undefined, defect, Number(qty))); if (r.ok) { setDefect(''); setQty(''); } }}>
          <Field label="Material">
            {(id) => (
              <Select id={id} value={mat} onChange={(e) => setMat(e.target.value)}>
                {Object.values(MATERIALS).filter((m) => m.type !== 'SPARE').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Batch (optional)">
            {(id) => (
              <Select id={id} value={batch} onChange={(e) => setBatch(e.target.value)}>
                <option value="">—</option>
                {Object.values(s.batches).filter((b) => b.material === mat).map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Defect description" required>{(id) => <Input id={id} value={defect} onChange={(e) => setDefect(e.target.value)} placeholder="Weld seam porosity, left bracket" />}</Field>
          <Field label="Affected quantity" required>{(id) => <Input id={id} type="number" value={qty} onChange={(e) => setQty(e.target.value)} />}</Field>
          <Button type="submit" variant="primary">Create notification</Button>
        </form>
      </Panel>
    </div>
  );
}

function Stats({ s }: { s: SimState }) {
  const lots = docsOf(s, 'IL').filter((l) => l.decision);
  const byChar: Record<string, { name: string; ok: number; bad: number }> = {};
  for (const l of docsOf(s, 'IL').filter((x) => x.resultsRecorded)) {
    for (const c of l.chars) {
      byChar[c.code] ??= { name: c.name, ok: 0, bad: 0 };
      if (charOk(c)) byChar[c.code].ok++;
      else byChar[c.code].bad++;
    }
  }
  const data = Object.entries(byChar).map(([code, v]) => ({ code, ...v }));
  const accepted = lots.filter((l) => l.decision === 'ACCEPT').length;
  let good = 0;
  let scrap = 0;
  for (const m of Object.values(s.machines)) {
    good += m.goodCount;
    scrap += m.scrapCount;
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Panel title="Quality KPIs">
        <div className="p-4">
          <KV
            cols={1}
            items={[
              ['First pass yield (operations)', good + scrap ? `${((good / (good + scrap)) * 100).toFixed(2)} %` : '—'],
              ['Lots decided', `${lots.length} (${accepted} accepted, ${lots.length - accepted} rejected)`],
              ['Customer complaints', String(s.stats.complaints)],
              ['Open notifications', String(docsOf(s, 'QN').filter((q) => q.status !== 'COMPLETED').length)],
              ['Wrong usage decisions', String(s.stats.mistakes.filter((m) => m.code.startsWith('UD_')).length)],
            ]}
          />
        </div>
      </Panel>
      <Panel title="Results by characteristic" sub="Accepted vs rejected results">
        <div className="h-64 p-3">
          {data.length === 0 ? (
            <ChartEmpty>No results recorded yet.</ChartEmpty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" barGap={2} margin={{ left: 10 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" {...axisProps} allowDecimals={false} />
                <YAxis type="category" dataKey="code" {...axisProps} width={64} />
                <Tooltip cursor={{ fill: 'oklch(0.3 0.012 250 / 0.4)' }} content={<ChartTooltip unit="" />} />
                <RBar dataKey="ok" name="Accepted" stackId="a" fill={SERIES.blue} />
                <RBar dataKey="bad" name="Rejected" stackId="a" fill={SERIES.orange} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>
    </div>
  );
}

