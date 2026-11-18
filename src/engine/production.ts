// PP: production orders, availability check, reservations, staging,
// backflush, confirmations and goods receipt from production.
import { machineDef, MACHINES, PSA_FOR_GROUP } from './layout';
import { MATERIALS, PRODUCTS } from './master';
import {
  addDoc,
  addQuant,
  availableQty,
  baseDoc,
  BIN_MAP_TYPES,
  cleanupQuant,
  fail,
  fmtQty,
  getDoc,
  hist,
  link,
  newBatchId,
  ok,
  round,
} from './core';
import type { Component, Confirmation, Operation, ProductionOrder, SimState, TxResult } from './types';
import { createInspectionLot, createWT, planPutaway, postMatDoc } from './inventory';

export function opDuration(setupMin: number, cycleSec: number, qty: number) {
  return round(setupMin + (qty * cycleSec) / 60, 1);
}

export function plannedCost(product: string, qty: number) {
  const p = PRODUCTS[product];
  let c = 0;
  for (const b of p.bom) c += b.qtyPer * qty * MATERIALS[b.material].price;
  for (const r of p.routing) {
    const rate = MACHINES.find((m) => m.group === r.group)?.ratePerHour ?? 100;
    c += (opDuration(r.setupMin, r.cycleSec, qty) / 60) * rate;
  }
  return round(c, 2);
}

/** Forward scheduling over the routing (operations run one after another). */
export function scheduleEnd(product: string, qty: number, start: number) {
  let t = start;
  for (const r of PRODUCTS[product].routing) t += opDuration(r.setupMin, r.cycleSec, qty);
  return t;
}

export function createProductionOrder(
  s: SimState,
  product: string,
  qty: number,
  opts: { start?: number; priority?: 'NORMAL' | 'URGENT'; salesOrder?: string; autoConfirm?: boolean } = {},
): TxResult {
  const T = 'CO01';
  const p = PRODUCTS[product];
  if (!p) return fail(s, T, 'Select a material with a valid routing and BOM.', 'Only finished products (FG-…) can be produced.');
  if (!Number.isInteger(qty) || qty <= 0) return fail(s, T, 'Order quantity must be a whole number of pieces greater than zero.', 'Enter e.g. 500.');
  if (qty > 5000) return fail(s, T, 'Order quantity exceeds the maximum lot size of 5,000 pcs.', 'Split the demand into several orders.');
  const start = Math.max(s.t, opts.start ?? s.t);
  const ops: Operation[] = p.routing.map((r) => ({
    no: r.no,
    name: r.name,
    wcGroup: r.group,
    setupMin: r.setupMin,
    cycleSec: r.cycleSec,
    qtyIn: 0,
    produced: 0,
    scrap: 0,
    status: 'WAITING',
    plannedMin: opDuration(r.setupMin, r.cycleSec, qty),
    actualMin: 0,
  }));
  ops[0].qtyIn = qty;
  const components: Component[] = p.bom.map((b) => ({ material: b.material, qtyPer: b.qtyPer, required: round(b.qtyPer * qty), reserved: 0, staged: 0, issued: 0 }));
  const pp = addDoc<ProductionOrder>(s, {
    ...baseDoc(s, 'PP'),
    type: 'PP',
    product,
    qty,
    plannedStart: start,
    plannedEnd: scheduleEnd(product, qty, start),
    priority: opts.priority ?? 'NORMAL',
    ops,
    components,
    salesOrder: opts.salesOrder,
    stagingDone: false,
    grQty: 0,
    scrapTotal: 0,
    plannedCost: plannedCost(product, qty),
    actualCost: 0,
    autoConfirm: !!opts.autoConfirm,
  });
  if (opts.salesOrder) link(s, pp.id, opts.salesOrder);
  return ok(s, T, `Production order ${pp.id} created for ${qty} × ${MATERIALS[product].name}.`, [pp.id]);
}

/** CO02 release with availability check + material reservation. */
export function releaseOrder(s: SimState, id: string): TxResult {
  const T = 'CO02';
  const pp = getDoc(s, id, 'PP');
  if (!pp) return fail(s, T, `Production order ${id} not found.`, 'Select an order from the order list.');
  if (pp.status === 'CANCELLED' || pp.status === 'COMPLETED') return fail(s, T, `Order ${pp.id} is ${pp.status.toLowerCase()}.`, 'Create a new order.');
  const missing: string[] = [];
  for (const c of pp.components) {
    const need = round(c.required - c.reserved);
    if (need <= 1e-6) continue;
    const avail = availableQty(s, c.material);
    if (avail + 1e-6 < need) missing.push(`${MATERIALS[c.material].name}: need ${fmtQty(need, MATERIALS[c.material].uom)}, available ${fmtQty(avail, MATERIALS[c.material].uom)}`);
  }
  if (missing.length) {
    pp.history.push({ t: s.t, user: s.user, action: 'Availability check failed', detail: missing.join('; ') });
    return fail(s, T, `Missing parts — order ${pp.id} cannot be released. ${missing.join('; ')}.`, 'Post the pending goods receipt, or run MRP / create a purchase requisition for the missing material, then release again.', 'MISSING_PARTS');
  }
  for (const c of pp.components) reserve(s, c, pp.id);
  const wasReleased = pp.status !== 'CREATED';
  pp.status = pp.status === 'CREATED' ? 'RELEASED' : pp.status;
  hist(s, pp, wasReleased ? 'Availability re-checked' : 'Released', 'Material availability confirmed, components reserved');
  return ok(s, T, wasReleased ? `Reservations for ${pp.id} completed.` : `Order ${pp.id} released. Components are reserved in the warehouse.`, [pp.id]);
}

function reserve(s: SimState, c: Component, ref: string) {
  let need = round(c.required - c.reserved);
  if (need <= 1e-6) return;
  const quants = Object.values(s.quants)
    .filter((q) => q.material === c.material && q.stockType === 'UNR' && BIN_MAP_TYPES.storage(q.bin) && (s.batches[q.batch]?.status ?? 'RELEASED') === 'RELEASED')
    .sort((a, b) => a.createdAt - b.createdAt); // FIFO
  for (const q of quants) {
    if (need <= 1e-6) break;
    const free = q.qty - q.reserved;
    if (free <= 1e-6) continue;
    const take = Math.min(free, need);
    q.reserved = round(q.reserved + take);
    c.reserved = round(c.reserved + take);
    need = round(need - take);
  }
  void ref;
}

/** Stage reserved components from the warehouse to the production supply areas. */
export function stageComponents(s: SimState, id: string): TxResult {
  const T = 'CO_STAGE';
  const pp = getDoc(s, id, 'PP');
  if (!pp) return fail(s, T, `Production order ${id} not found.`, 'Select an order.');
  if (pp.status === 'CREATED') return fail(s, T, `Order ${pp.id} is not released — nothing is reserved yet.`, 'Release the order (CO02) first. Release checks availability and reserves the components.');
  if (pp.status === 'COMPLETED' || pp.status === 'CANCELLED') return fail(s, T, `Order ${pp.id} is closed.`, 'No staging needed.');
  const product = PRODUCTS[pp.product];
  const tasks: string[] = [];
  for (const c of pp.components) {
    const inTransit = Object.values(s.docs).reduce((a, d) => a + (d.type === 'WT' && d.kind === 'STAGING' && d.ref === pp.id && d.material === c.material && (d.status === 'CREATED' || d.status === 'IN_PROGRESS') ? d.qty : 0), 0);
    let need = round(c.required - c.staged - inTransit);
    if (need <= 1e-6) continue;
    if (c.reserved - c.staged - inTransit + 1e-6 < need) {
      return fail(s, T, `Reservation for ${MATERIALS[c.material].name} is incomplete (${fmtQty(c.reserved - c.staged - inTransit, MATERIALS[c.material].uom)} of ${fmtQty(need, MATERIALS[c.material].uom)} reserved).`, 'Run the availability check again (CO02 "Check availability") after correcting the stock.');
    }
    const op = product.bom.find((b) => b.material === c.material)?.op ?? pp.ops[0].no;
    const group = pp.ops.find((o) => o.no === op)?.wcGroup ?? pp.ops[0].wcGroup;
    const psa = PSA_FOR_GROUP[group] ?? 'PSA-LAS';
    const quants = Object.values(s.quants)
      .filter((q) => q.material === c.material && q.reserved > 0 && BIN_MAP_TYPES.storage(q.bin))
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const q of quants) {
      if (need <= 1e-6) break;
      const busy = Object.values(s.docs).reduce((a, d) => a + (d.type === 'WT' && d.quant === q.id && (d.status === 'CREATED' || d.status === 'IN_PROGRESS') ? d.qty : 0), 0);
      const take = Math.min(q.reserved - busy, need);
      if (take <= 1e-6) continue;
      tasks.push(createWT(s, 'STAGING', q.id, take, psa, pp.id).id);
      need = round(need - take);
    }
  }
  if (!tasks.length) return fail(s, T, `All components for ${pp.id} are already staged or on their way.`, 'Watch the forklifts — production starts as soon as staging is complete.');
  hist(s, pp, 'Staging requested', `${tasks.length} warehouse task(s)`);
  return ok(s, T, `${tasks.length} staging task(s) created. Forklifts bring the material to the line.`, [pp.id, ...tasks]);
}

/** Called by the tick: start an operation on a machine of the right group. */
export function startOperation(s: SimState, pp: ProductionOrder, op: Operation, machineId: string) {
  op.machine = machineId;
  op.status = 'SETUP';
  op.startedAt = s.t;
  const m = s.machines[machineId];
  m.order = pp.id;
  m.op = op.no;
  m.setupLeft = op.setupMin;
  m.frac = 0;
  if (pp.status === 'RELEASED') {
    pp.status = 'IN_PROGRESS';
    hist(s, pp, 'Production started', `${op.no} on ${machineId}`);
  }
  // backflush: consume staged components assigned to this operation
  const product = PRODUCTS[pp.product];
  const items = [];
  for (const c of pp.components) {
    const consumeAt = product.bom.find((b) => b.material === c.material)?.op;
    if (consumeAt !== op.no || c.issued >= c.required - 1e-6) continue;
    let need = round(c.required - c.issued);
    for (const q of Object.values(s.quants)) {
      if (need <= 1e-6) break;
      if (q.order !== pp.id || q.material !== c.material) continue;
      const take = Math.min(q.qty, need);
      q.qty = round(q.qty - take);
      q.physical = round(Math.max(0, q.physical - take));
      need = round(need - take);
      c.issued = round(c.issued + take);
      items.push({ material: c.material, qty: take, batch: q.batch, fromBin: q.bin, stockType: q.stockType, quant: q.id });
      cleanupQuant(s, q);
    }
  }
  if (items.length) {
    const md = postMatDoc(s, '261', items, [pp.id], `Backflush for ${pp.id} op ${op.no}`);
    pp.actualCost = round(pp.actualCost + md.value, 2);
    s.stats.materialCost += md.value;
  }
  if (op.wcGroup === 'QC') {
    if (!pp.batch) {
      pp.batch = newBatchId(s, 'P');
      s.batches[pp.batch] = { id: pp.batch, material: pp.product, origin: 'PRODUCTION', order: pp.id, createdAt: s.t, status: 'PENDING_QI' };
    }
    // defect rate grows with machine wear and quality drift on the machines used
    let rate = 0;
    for (const o of pp.ops) {
      if (!o.machine) continue;
      const mm = s.machines[o.machine];
      if ((mm.defectBoostUntil ?? -1) > (o.startedAt ?? 0)) rate += 0.05;
      if (mm.health < 40) rate += 0.02;
    }
    if (s.scenario === 'M01') rate = 0;
    const lot = createInspectionLot(s, '03', pp.product, pp.batch, op.qtyIn, { order: pp.id, defectRate: rate });
    op.inspectionLot = lot.id;
    hist(s, pp, 'Inspection lot created', lot.id);
  }
}

/** CO11N — final confirmation of an operation. */
export function confirmOperation(s: SimState, id: string, opNo: string, yieldQty: number, scrapQty: number, auto = false): TxResult {
  const T = 'CO11N';
  const pp = getDoc(s, id, 'PP');
  if (!pp) return fail(s, T, `Production order ${id} not found.`, 'Select an order.');
  const idx = pp.ops.findIndex((o) => o.no === opNo);
  const op = pp.ops[idx];
  if (!op) return fail(s, T, `Operation ${opNo} does not exist on ${pp.id}.`, 'Pick an operation from the routing.');
  if (op.status === 'CONFIRMED') return fail(s, T, `Operation ${opNo} is already confirmed.`, 'Each operation is confirmed once (final confirmation).');
  if (idx > 0 && pp.ops[idx - 1].status !== 'CONFIRMED') return fail(s, T, `Operation ${pp.ops[idx - 1].no} must be confirmed before ${opNo}.`, 'Confirm operations in routing sequence — the prerequisite is not complete.');
  if (op.status !== 'DONE') return fail(s, T, `Operation ${opNo} is still ${op.status.toLowerCase()} on ${op.machine ?? 'the line'}.`, 'You can only finally confirm an operation after the machine has processed the full quantity.');
  if (!Number.isInteger(yieldQty) || !Number.isInteger(scrapQty) || yieldQty < 0 || scrapQty < 0) return fail(s, T, 'Yield and scrap must be whole numbers ≥ 0.', 'Copy the machine counter values.');
  let good = op.produced - op.scrap;
  let scrap = op.scrap;
  if (op.inspectionLot) {
    const lot = getDoc(s, op.inspectionLot, 'IL');
    if (!lot?.decision) return fail(s, T, `Usage decision for inspection lot ${op.inspectionLot} is missing.`, 'Record results and make the usage decision in Quality (QA32) before confirming the inspection operation.');
    if (lot.decision === 'ACCEPT') {
      good = lot.acceptedQty ?? op.qtyIn;
      scrap = op.qtyIn - good;
    } else {
      good = op.qtyIn; // rejected lot: received to blocked stock for rework/scrap decision
      scrap = 0;
    }
  }
  if (yieldQty !== good || scrapQty !== scrap) {
    return fail(s, T, `Confirmed quantities (${yieldQty} yield / ${scrapQty} scrap) do not match the machine data (${good} / ${scrap}).`, 'Confirm exactly what the machine counter reports. Wrong confirmations distort stock, costs and OEE.', 'CONF_QTY');
  }
  const cf = addDoc<Confirmation>(s, {
    ...baseDoc(s, 'CF', 'COMPLETED'),
    type: 'CF',
    order: pp.id,
    op: op.no,
    yield: good,
    scrap,
    machine: op.machine ?? '',
    durationMin: round(op.actualMin, 1),
    final: true,
  });
  link(s, cf.id, pp.id);
  if (op.inspectionLot) link(s, cf.id, op.inspectionLot);
  op.status = 'CONFIRMED';
  op.confirmation = cf.id;
  pp.scrapTotal += scrap;
  const rate = op.machine ? machineDef(op.machine).ratePerHour : 100;
  const conv = (op.actualMin / 60) * rate;
  pp.actualCost = round(pp.actualCost + conv, 2);
  s.stats.conversionCost += conv;
  const next = pp.ops[idx + 1];
  if (next) next.qtyIn = good;
  hist(s, pp, `Operation ${op.no} confirmed${auto ? ' (auto)' : ''}`, `${cf.id}: yield ${good}, scrap ${scrap}`);
  return ok(s, T, `Confirmation ${cf.id} posted for ${pp.id} / ${op.no}: yield ${good}, scrap ${scrap}.`, [cf.id]);
}

export function readyForGR(pp: ProductionOrder) {
  return pp.ops.every((o) => o.status === 'CONFIRMED') && pp.status !== 'COMPLETED';
}

/** MIGO 101 for the production order — finished goods into the warehouse. */
export function postOrderGR(s: SimState, id: string, binOrBins: string | string[]): TxResult {
  const bins = Array.isArray(binOrBins) ? binOrBins.filter(Boolean) : [binOrBins].filter(Boolean);
  const T = 'CO_GR';
  const pp = getDoc(s, id, 'PP');
  if (!pp) return fail(s, T, `Production order ${id} not found.`, 'Select an order.');
  if (pp.status === 'COMPLETED') return fail(s, T, `Goods receipt for ${pp.id} was already posted.`, 'Find the material document in the document flow.');
  if (!readyForGR(pp)) return fail(s, T, `Order ${pp.id} still has unconfirmed operations.`, 'Confirm every operation (CO11N), including the final inspection, before the goods receipt.');
  const last = pp.ops[pp.ops.length - 1];
  const qty = last.qtyIn - (pp.ops[pp.ops.length - 1].scrap ?? 0);
  const lot = last.inspectionLot ? getDoc(s, last.inspectionLot, 'IL') : undefined;
  const accepted = lot ? (lot.decision === 'ACCEPT' ? lot.acceptedQty ?? qty : 0) : qty;
  const blocked = lot?.decision === 'REJECT';
  const grQty = blocked ? last.qtyIn : accepted;
  if (grQty <= 0) return fail(s, T, 'Nothing to receive — all parts were scrapped.', 'Technically complete the order (TECO) instead.');
  if (!bins.length) return fail(s, T, 'No destination bin selected.', 'Assign finished goods bins (WH03). The proposal button selects enough free bins.');
  const plan = planPutaway(s, pp.product, grQty, bins);
  if (typeof plan === 'string') return fail(s, T, plan, 'Choose free finished goods bins (WH03) — use the proposal button.');
  const batch = pp.batch ?? newBatchId(s, 'P');
  s.batches[batch] = s.batches[batch] ?? { id: batch, material: pp.product, origin: 'PRODUCTION', order: pp.id, createdAt: s.t, status: 'RELEASED' };
  if (blocked) s.batches[batch].status = 'BLOCKED';
  else s.batches[batch].status = 'RELEASED';
  const q = addQuant(s, pp.product, 'QA-OUT', batch, grQty, blocked ? 'BLK' : 'UNR', grQty);
  const md = postMatDoc(s, '101', plan.map((p) => ({ material: pp.product, qty: p.qty, batch, toBin: p.bin, stockType: q.stockType, quant: q.id })), [pp.id], `Goods receipt from ${pp.id}`);
  const wts = plan.map((p) => createWT(s, 'FG_PUTAWAY', q.id, p.qty, p.bin, pp.id));
  for (const wt of wts) link(s, md.id, wt.id);
  if (lot) link(s, md.id, lot.id);
  pp.grQty = grQty;
  pp.status = 'COMPLETED';
  s.stats.goodOutput += blocked ? 0 : grQty;
  hist(s, pp, 'Goods receipt posted — order delivered', `${md.id}: ${grQty} pcs, batch ${batch}${blocked ? ' (blocked stock)' : ''}`);
  const so = getDoc(s, pp.salesOrder, 'SO');
  if (so) link(s, md.id, so.id);
  return ok(s, T, `Goods receipt ${md.id}: ${grQty} pcs into ${blocked ? 'blocked' : 'unrestricted'} stock, batch ${batch}. ${wts.length} forklift task(s) created.`, [md.id, ...wts.map((w) => w.id)]);
}

export function cancelOrder(s: SimState, id: string): TxResult {
  const T = 'CO02';
  const pp = getDoc(s, id, 'PP');
  if (!pp) return fail(s, T, 'Order not found.', 'Select an order.');
  if (pp.status !== 'CREATED' && pp.status !== 'RELEASED') return fail(s, T, `Order ${pp.id} is already in production and cannot be cancelled.`, 'Let it finish or technically complete it.');
  if (pp.components.some((c) => c.staged > 0)) return fail(s, T, `Components for ${pp.id} are already staged at the line.`, 'Return the staged material first (not supported here) — let the order run.');
  for (const c of pp.components) {
    let left = c.reserved;
    for (const q of Object.values(s.quants)) {
      if (left <= 0) break;
      if (q.material !== c.material || q.reserved <= 0 || !BIN_MAP_TYPES.storage(q.bin)) continue;
      const take = Math.min(q.reserved, left);
      q.reserved = round(q.reserved - take);
      left -= take;
    }
    c.reserved = 0;
  }
  for (const d of Object.values(s.docs)) if (d.type === 'WT' && d.ref === pp.id && d.status === 'CREATED') d.status = 'CANCELLED';
  pp.status = 'CANCELLED';
  hist(s, pp, 'Cancelled', 'Reservations released');
  return ok(s, T, `Order ${pp.id} cancelled and its reservations released.`, [pp.id]);
}

export function setAutoConfirm(s: SimState, id: string, on: boolean): TxResult {
  const pp = getDoc(s, id, 'PP');
  if (!pp) return fail(s, 'CO02', 'Order not found.', 'Select an order.');
  pp.autoConfirm = on;
  hist(s, pp, on ? 'Auto-confirmation on' : 'Auto-confirmation off');
  return ok(s, 'CO02', on ? `Operations of ${pp.id} will be confirmed automatically from machine data.` : `Auto-confirmation switched off for ${pp.id}.`, [pp.id]);
}
