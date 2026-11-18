// MM purchasing: requisitions, MRP, purchase orders and inbound deliveries.
import { MATERIALS, QUOTES, SUPPLIERS } from './master';
import { addDoc, availableQty, baseDoc, chance, fail, fmtQty, getDoc, hist, link, newBatchId, ok, randInt, round } from './core';
import type { InboundDelivery, PurchaseOrder, PurchaseReq, SimState, TxResult } from './types';

export const SAFETY_STOCK: Record<string, number> = {
  'RM-S355': 1500,
  'RM-22MNB5': 1500,
  'RM-WIRE': 150,
  'RM-KTL': 400,
  'RM-NUT': 8000,
  'RM-TUBE': 40,
  'SP-HYD-SEAL': 1,
  'SP-WELD-TIP': 4,
  'SP-LASER-NOZ': 2,
  'SP-SERVO': 1,
  'SP-BELT': 1,
  'SP-THERMO': 1,
};
export const LOT_SIZE: Record<string, number> = {
  'RM-S355': 2000,
  'RM-22MNB5': 2000,
  'RM-WIRE': 250,
  'RM-KTL': 1000,
  'RM-NUT': 20000,
  'RM-TUBE': 60,
};

export function createPR(s: SimState, material: string, qty: number, source: PurchaseReq['source'] = 'MANUAL', needBy?: number): TxResult {
  const T = 'ME51N';
  const m = MATERIALS[material];
  if (!m || m.type === 'FIN') return fail(s, T, 'Select a purchased material (raw material or spare part).', 'Finished products are produced, not purchased.');
  if (!(qty > 0)) return fail(s, T, 'Quantity must be greater than zero.', 'Enter the required quantity.');
  if (m.uom === 'PC' && !Number.isInteger(qty)) return fail(s, T, `${m.name} is ordered in whole pieces.`, 'Round the quantity.');
  const pr = addDoc<PurchaseReq>(s, { ...baseDoc(s, 'PR'), type: 'PR', material, qty: round(qty), needBy: needBy ?? s.t + 24 * 60, source });
  return ok(s, T, `Purchase requisition ${pr.id} created: ${fmtQty(qty, m.uom)} ${m.name}.`, [pr.id]);
}

export function openPoQty(s: SimState, material: string) {
  let q = 0;
  for (const d of Object.values(s.docs)) {
    if (d.type !== 'PO' || d.status === 'COMPLETED' || d.status === 'CANCELLED') continue;
    for (const it of d.items) if (it.material === material) q += Math.max(0, it.qty - it.received);
  }
  return q;
}
export function openPrQty(s: SimState, material: string) {
  return Object.values(s.docs).reduce((a, d) => a + (d.type === 'PR' && d.material === material && d.status === 'CREATED' ? d.qty : 0), 0);
}

export interface MrpLine {
  material: string;
  stock: number;
  requirements: number;
  receipts: number;
  safety: number;
  shortage: number;
  proposal: number;
}

/** Net requirements calculation (simplified MRP for purchased parts). */
export function mrpLines(s: SimState): MrpLine[] {
  const lines: MrpLine[] = [];
  for (const m of Object.values(MATERIALS)) {
    if (m.type === 'FIN') continue;
    // open dependent requirements = unreserved part of released + created orders
    let req = 0;
    for (const d of Object.values(s.docs)) {
      if (d.type !== 'PP' || d.status === 'COMPLETED' || d.status === 'CANCELLED') continue;
      for (const c of d.components) if (c.material === m.id) req += Math.max(0, c.required - c.reserved);
    }
    const stock = availableQty(s, m.id);
    const receipts = openPoQty(s, m.id) + openPrQty(s, m.id);
    const safety = SAFETY_STOCK[m.id] ?? 0;
    const shortage = round(Math.max(0, req + safety - stock - receipts));
    const lot = LOT_SIZE[m.id] ?? 1;
    const proposal = shortage > 0 ? Math.ceil(shortage / lot) * lot : 0;
    lines.push({ material: m.id, stock, requirements: round(req), receipts: round(receipts), safety, shortage, proposal });
  }
  return lines;
}

export function runMRP(s: SimState): TxResult {
  const T = 'MD01';
  const created: string[] = [];
  for (const l of mrpLines(s)) {
    if (l.proposal <= 0) continue;
    const pr = addDoc<PurchaseReq>(s, { ...baseDoc(s, 'PR'), type: 'PR', material: l.material, qty: l.proposal, needBy: s.t + 24 * 60, source: 'MRP' });
    created.push(pr.id);
  }
  return ok(s, T, created.length ? `MRP run complete — ${created.length} purchase requisition(s) created.` : 'MRP run complete — no shortages, nothing to order.', created);
}

export function quotesFor(material: string) {
  return QUOTES.filter((q) => q.material === material).map((q) => ({ ...q, supplierData: SUPPLIERS[q.supplier] }));
}

/** ME21N — convert a requisition (or a free request) into a purchase order. */
export function createPO(s: SimState, input: { pr?: string; material?: string; qty?: number; supplier: string }): TxResult {
  const T = 'ME21N';
  const pr = getDoc(s, input.pr, 'PR');
  if (input.pr && !pr) return fail(s, T, `Requisition ${input.pr} not found.`, 'Select an open requisition.');
  if (pr && pr.status !== 'CREATED') return fail(s, T, `Requisition ${pr.id} was already converted.`, 'Each requisition becomes exactly one purchase order.');
  const material = pr?.material ?? input.material;
  const qty = pr?.qty ?? input.qty;
  if (!material || !MATERIALS[material]) return fail(s, T, 'Select a material.', 'Choose the material to order.');
  if (!qty || qty <= 0) return fail(s, T, 'Quantity must be greater than zero.', 'Enter the order quantity.');
  const quote = QUOTES.find((q) => q.material === material && q.supplier === input.supplier);
  if (!quote) return fail(s, T, `Supplier ${input.supplier} has no valid quotation for ${MATERIALS[material].name}.`, 'Choose a supplier from the quotation comparison — only approved sources may be used.', 'NO_SOURCE');
  const sup = SUPPLIERS[input.supplier];
  const eta = s.t + quote.leadHours * 60;
  const po = addDoc<PurchaseOrder>(s, {
    ...baseDoc(s, 'PO', 'RELEASED'),
    type: 'PO',
    supplier: input.supplier,
    items: [{ material, qty, price: quote.price, received: 0 }],
    eta,
    originalEta: eta,
    delivered: false,
  });
  // supplier behaviour is decided now but revealed only as the delivery approaches
  const late = !chance(s, sup.reliability);
  const short = chance(s, 0.06) && MATERIALS[material].uom !== 'PC';
  const actual = short ? round(qty * (randInt(s, 970, 995) / 1000)) : qty;
  const ibd = addDoc<InboundDelivery>(s, {
    ...baseDoc(s, 'IBD', 'CREATED'),
    type: 'IBD',
    po: po.id,
    supplier: input.supplier,
    items: [{ material, qty, actualQty: actual, batch: newBatchId(s, 'S') }],
    eta,
    carrierPlate: plate(s, sup.country),
    plannedDelay: late ? randInt(s, 2, 6) * 60 : undefined,
  });
  link(s, po.id, ibd.id);
  if (pr) {
    pr.status = 'COMPLETED';
    link(s, pr.id, po.id);
    hist(s, pr, 'Converted to purchase order', po.id);
  }
  return ok(s, T, `Purchase order ${po.id} sent to ${sup.name}. Expected delivery in ${quote.leadHours} h.`, [po.id, ibd.id]);
}

function plate(s: SimState, country: string) {
  const L = 'ABCDEFGHJKLMNPRSTUWXYZ';
  const r = () => L[randInt(s, 0, L.length - 1)];
  if (country === 'DE') return `${r()}${r()}-${r()}${r()} ${randInt(s, 100, 9999)}`;
  if (country === 'CZ') return `${randInt(s, 1, 9)}T${r()} ${randInt(s, 1000, 9999)}`;
  return `S${r()} ${randInt(s, 10000, 99999)}`;
}

export function cancelPR(s: SimState, id: string): TxResult {
  const pr = getDoc(s, id, 'PR');
  if (!pr) return fail(s, 'ME51N', 'Requisition not found.', 'Select a requisition.');
  if (pr.status !== 'CREATED') return fail(s, 'ME51N', `${pr.id} is already processed.`, 'Only open requisitions can be cancelled.');
  pr.status = 'CANCELLED';
  hist(s, pr, 'Cancelled');
  return ok(s, 'ME51N', `Requisition ${pr.id} cancelled.`, [pr.id]);
}

export function supplierPerformance(s: SimState) {
  const res: Record<string, { pos: number; onTime: number; delivered: number; rejected: number; value: number }> = {};
  for (const sup of Object.keys(SUPPLIERS)) res[sup] = { pos: 0, onTime: 0, delivered: 0, rejected: 0, value: 0 };
  for (const d of Object.values(s.docs)) {
    if (d.type === 'PO') {
      const r = res[d.supplier];
      r.pos++;
      r.value += d.items.reduce((a, i) => a + i.qty * i.price, 0);
    }
    if (d.type === 'IBD' && d.arrivedAt !== undefined) {
      const r = res[d.supplier];
      r.delivered++;
      const po = getDoc(s, d.po, 'PO');
      if (po && d.arrivedAt <= po.originalEta + 30) r.onTime++;
    }
    if (d.type === 'QN' && d.kind === 'Q2') {
      const b = d.batch ? s.batches[d.batch] : undefined;
      if (b?.supplier && res[b.supplier]) res[b.supplier].rejected++;
    }
  }
  return res;
}
