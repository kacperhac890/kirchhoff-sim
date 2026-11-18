// The worklist: open work derived from document status — like an SAP inbox.
import { CUSTOMERS, MATERIALS, availableQty, docsOf, fmtQty, fmtTime, getDoc, readyForGR, type RoleId, type SimState } from '../engine';

export interface Task {
  id: string;
  title: string;
  detail: string;
  role: RoleId;
  module: 'warehouse' | 'production' | 'quality' | 'maintenance' | 'procurement' | 'logistics';
  route: string;
  severity: 'normal' | 'high' | 'critical';
  due?: number;
}

export function getTasks(s: SimState): Task[] {
  const out: Task[] = [];
  for (const ibd of docsOf(s, 'IBD')) {
    if (ibd.arrivedAt !== undefined && ibd.status !== 'COMPLETED' && ibd.status !== 'CANCELLED') {
      const it = ibd.items[0];
      out.push({ id: `gr-${ibd.id}`, title: `Receive delivery ${ibd.id}`, detail: `${fmtQty(it.qty, MATERIALS[it.material].uom)} ${MATERIALS[it.material].name} at inbound door ${(ibd.dock ?? 0) + 1}`, role: 'WAREHOUSE', module: 'warehouse', route: `#/warehouse/inbound/${ibd.id}`, severity: 'high' });
    }
  }
  for (const ev of s.events) {
    if (ev.kind === 'PICK_SHORTAGE' && !ev.resolved) out.push({ id: `pi-${ev.id}`, title: `Count bin ${ev.refs[0]}`, detail: 'Pick shortage — book stock differs from the shelf', role: 'WAREHOUSE', module: 'warehouse', route: '#/warehouse/count', severity: 'critical' });
  }
  for (const pi of docsOf(s, 'PI')) if (!pi.posted && pi.status !== 'CANCELLED') out.push({ id: `pip-${pi.id}`, title: `Post physical inventory ${pi.id}`, detail: `Bin ${pi.bin} is frozen until the count is posted`, role: 'WAREHOUSE', module: 'warehouse', route: '#/warehouse/count', severity: 'normal' });
  for (const pp of docsOf(s, 'PP')) {
    if (pp.status === 'CREATED') out.push({ id: `rel-${pp.id}`, title: `Release ${pp.id}`, detail: `${pp.qty} × ${MATERIALS[pp.product].name}`, role: 'PLANNER', module: 'production', route: `#/production/order/${pp.id}`, severity: pp.priority === 'URGENT' ? 'high' : 'normal' });
    if ((pp.status === 'RELEASED' || pp.status === 'IN_PROGRESS') && !pp.stagingDone) {
      const transit = docsOf(s, 'WT').some((w) => w.ref === pp.id && w.kind === 'STAGING' && (w.status === 'CREATED' || w.status === 'IN_PROGRESS'));
      const short = pp.components.some((c) => c.reserved + 1e-6 < c.required);
      if (short) out.push({ id: `avail-${pp.id}`, title: `Re-check availability for ${pp.id}`, detail: 'Reservation incomplete after a stock correction', role: 'PLANNER', module: 'production', route: `#/production/order/${pp.id}`, severity: 'high' });
      else if (!transit) out.push({ id: `stage-${pp.id}`, title: `Stage components for ${pp.id}`, detail: 'Production cannot start until material is at the line', role: 'WAREHOUSE', module: 'production', route: `#/production/order/${pp.id}`, severity: 'high' });
    }
    for (const op of pp.ops) {
      if (op.status === 'DONE' && !op.inspectionLot && !pp.autoConfirm) out.push({ id: `conf-${pp.id}-${op.no}`, title: `Confirm ${pp.id} / ${op.no}`, detail: `${op.name} — ${op.produced - op.scrap} good, ${op.scrap} scrap`, role: 'PROD_OP', module: 'production', route: `#/production/order/${pp.id}`, severity: 'high' });
      if (op.status === 'DONE' && op.inspectionLot && getDoc(s, op.inspectionLot, 'IL')?.decision) out.push({ id: `conf-${pp.id}-${op.no}`, title: `Confirm inspection ${pp.id} / ${op.no}`, detail: 'Usage decision made — confirm the operation', role: 'PROD_OP', module: 'production', route: `#/production/order/${pp.id}`, severity: 'high' });
    }
    if (readyForGR(pp)) out.push({ id: `gr-${pp.id}`, title: `Goods receipt for ${pp.id}`, detail: 'All operations confirmed — receive finished goods into WH03', role: 'PROD_OP', module: 'production', route: `#/production/order/${pp.id}`, severity: 'high' });
  }
  for (const lot of docsOf(s, 'IL')) {
    if (lot.decision) continue;
    const pp = getDoc(s, lot.order, 'PP');
    const op = pp?.ops.find((o) => o.inspectionLot === lot.id);
    if (op && op.status !== 'DONE') continue;
    out.push({ id: `il-${lot.id}`, title: lot.resultsRecorded ? `Usage decision for lot ${lot.id}` : `Record results for lot ${lot.id}`, detail: `${lot.origin === '01' ? 'Incoming' : 'Final'} inspection · ${MATERIALS[lot.material].name}`, role: 'QUALITY', module: 'quality', route: `#/quality/lot/${lot.id}`, severity: 'high' });
  }
  for (const q of Object.values(s.quants)) {
    const b = s.batches[q.batch];
    if (b?.status === 'REJECTED' && b.origin === 'SUPPLIER' && q.qty > 0) out.push({ id: `rtv-${q.id}`, title: `Return batch ${b.id} to supplier`, detail: `${fmtQty(q.qty, MATERIALS[q.material].uom)} rejected ${MATERIALS[q.material].name} in ${q.bin}`, role: 'WAREHOUSE', module: 'quality', route: '#/quality/batches', severity: 'normal' });
  }
  for (const m of Object.values(s.machines)) {
    if (m.failure && !m.maintOrder) out.push({ id: `bd-${m.id}`, title: `Repair ${m.id}`, detail: m.failure.text, role: 'MAINTENANCE', module: 'maintenance', route: `#/maintenance/equipment/${m.id}`, severity: 'critical' });
    else if (!m.failure && !m.maintOrder && m.health < 35) out.push({ id: `pm-${m.id}`, title: `Plan preventive maintenance on ${m.id}`, detail: `Health ${Math.round(m.health)} % — breakdown risk rising`, role: 'MAINTENANCE', module: 'maintenance', route: `#/maintenance/equipment/${m.id}`, severity: 'normal' });
  }
  for (const mo of docsOf(s, 'MO')) if (mo.workDoneAt !== undefined && mo.status !== 'COMPLETED') out.push({ id: `iw41-${mo.id}`, title: `Confirm maintenance order ${mo.id}`, detail: `${mo.machine} stays locked until confirmed`, role: 'MAINTENANCE', module: 'maintenance', route: '#/maintenance/orders', severity: 'high' });
  for (const pr of docsOf(s, 'PR')) if (pr.status === 'CREATED') out.push({ id: `pr-${pr.id}`, title: `Convert requisition ${pr.id}`, detail: `${fmtQty(pr.qty, MATERIALS[pr.material].uom)} ${MATERIALS[pr.material].name}`, role: 'PROCUREMENT', module: 'procurement', route: '#/procurement', severity: 'normal' });
  for (const so of docsOf(s, 'SO')) {
    if (so.status === 'COMPLETED' || so.status === 'CANCELLED') continue;
    const it = so.items[0];
    const inDlv = docsOf(s, 'DLV').filter((d) => d.salesOrder === so.id && d.status !== 'CANCELLED').reduce((a, d) => a + d.items[0].qty, 0);
    const open = it.qty - it.delivered - (inDlv - docsOf(s, 'DLV').filter((d) => d.salesOrder === so.id && d.pgi).reduce((a, d) => a + d.items[0].qty, 0));
    if (open > 0 && availableQty(s, it.material) >= open) out.push({ id: `dlv-${so.id}`, title: `Create delivery for ${so.id}`, detail: `${open} × ${MATERIALS[it.material].name} for ${CUSTOMERS[so.customer].name}, due ${fmtTime(so.due)}`, role: 'LOGISTICS', module: 'logistics', route: `#/logistics/so/${so.id}`, severity: so.due - s.t < 360 ? 'critical' : 'normal', due: so.due });
  }
  for (const d of docsOf(s, 'DLV')) {
    if (d.pgi || d.status === 'CANCELLED') continue;
    const shp = getDoc(s, d.shipment, 'SHP');
    if (d.pickStatus === 'NONE') out.push({ id: `pick-${d.id}`, title: `Pick delivery ${d.id}`, detail: `${d.items[0].qty} pcs to dock ${d.dock + 1}`, role: 'LOGISTICS', module: 'logistics', route: `#/logistics/dlv/${d.id}`, severity: 'high' });
    else if (d.pickStatus === 'DONE' && !d.packed) out.push({ id: `pack-${d.id}`, title: `Pack delivery ${d.id}`, detail: 'All pallets are at the dock', role: 'LOGISTICS', module: 'logistics', route: `#/logistics/dlv/${d.id}`, severity: 'high' });
    else if (d.packed && !shp) out.push({ id: `shp-${d.id}`, title: `Plan shipment for ${d.id}`, detail: 'Choose carrier and truck', role: 'LOGISTICS', module: 'logistics', route: `#/logistics/dlv/${d.id}`, severity: 'high' });
    else if (shp?.loadedAt !== undefined) out.push({ id: `pgi-${d.id}`, title: `Post goods issue for ${d.id}`, detail: `Truck loaded at dock ${d.dock + 1}`, role: 'LOGISTICS', module: 'logistics', route: `#/logistics/dlv/${d.id}`, severity: 'critical' });
  }
  const rank = { critical: 0, high: 1, normal: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function tasksByModule(tasks: Task[]) {
  const r: Record<string, number> = {};
  for (const t of tasks) r[t.module] = (r[t.module] ?? 0) + 1;
  return r;
}
