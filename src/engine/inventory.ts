// MM / EWM: goods receipts, warehouse tasks, transfers, physical inventory,
// reversals and batch blocking.
import { BIN_MAP, routeBetween, routeLength } from './layout';
import { MATERIALS, SUPPLIERS } from './master';
import {
  addDoc,
  addQuant,
  baseDoc,
  binFree,
  chance,
  cleanupQuant,
  fail,
  fmtQty,
  getDoc,
  hist,
  link,
  newBatchId,
  ok,
  round,
  storageCheck,
  STORAGE_TYPES,
} from './core';
import type {
  InspectionLot,
  MaterialDoc,
  MatDocItem,
  MovementType,
  PhysInvDoc,
  QualityNotification,
  SimState,
  StockType,
  TxResult,
  WarehouseTask,
  WtKind,
} from './types';
import { makeCharacteristics } from './quality';

export const MVT_TEXT: Record<MovementType, string> = {
  '101': 'Goods receipt',
  '102': 'GR reversal',
  '122': 'Return to vendor',
  '261': 'Goods issue to order',
  '262': 'GI reversal',
  '311': 'Transfer posting bin to bin',
  '312': 'Transfer reversal',
  '321': 'Quality → unrestricted',
  '343': 'Blocked → unrestricted',
  '344': 'Unrestricted → blocked',
  '350': 'Quality → blocked',
  '551': 'Scrapping',
  '601': 'Goods issue for delivery',
  '701': 'Inventory gain',
  '702': 'Inventory loss',
};

export function postMatDoc(s: SimState, mvt: MovementType, items: MatDocItem[], refs: string[], text?: string): MaterialDoc {
  const value = items.reduce((v, it) => v + it.qty * (MATERIALS[it.material]?.price ?? 0), 0);
  const md = addDoc<MaterialDoc>(s, { ...baseDoc(s, 'MD', 'COMPLETED'), type: 'MD', mvt, items, value: round(value, 2), text: text ?? MVT_TEXT[mvt] });
  hist(s, md, `Posted movement ${mvt}`, MVT_TEXT[mvt]);
  for (const r of refs) link(s, md.id, r);
  return md;
}

// ------------------------------------------------------------------ warehouse tasks
export function createWT(
  s: SimState,
  kind: WtKind,
  quantId: string,
  qty: number,
  toBin: string,
  ref?: string,
): WarehouseTask {
  const q = s.quants[quantId];
  const dist = routeLength(routeBetween(q.bin, toBin));
  const handling = kind === 'PICK' || kind === 'STAGING' ? 3 : 2.5;
  const wt = addDoc<WarehouseTask>(s, {
    ...baseDoc(s, 'WT', 'CREATED'),
    type: 'WT',
    kind,
    material: q.material,
    qty: round(qty),
    batch: q.batch,
    quant: q.id,
    fromBin: q.bin,
    toBin,
    stockType: q.stockType,
    durationMin: round(handling + dist / 85 + 1.5, 2),
    ref,
  });
  if (ref) link(s, wt.id, ref);
  return wt;
}

// ------------------------------------------------------------------ inbound / GR
/** "Verify quantity": the warehouse operator counts the pallets at the dock. */
export function countInbound(s: SimState, ibdId: string): TxResult {
  const ibd = getDoc(s, ibdId, 'IBD');
  if (!ibd) return fail(s, 'MIGO_GR', `Inbound delivery ${ibdId} not found.`, 'Pick an inbound delivery from the dock list.');
  if ((ibd.arrivedAt === undefined)) return fail(s, 'MIGO_GR', `Truck for delivery ${ibd.id} has not arrived yet.`, 'Wait until the truck is at the inbound door, then count.');
  for (const it of ibd.items) it.counted = it.actualQty;
  hist(s, ibd, 'Physical count at dock', ibd.items.map((i) => `${i.material}: ${fmtQty(i.actualQty, MATERIALS[i.material].uom)}`).join(', '));
  return ok(s, 'MIGO_GR', `Delivery ${ibd.id} counted at the dock.`, [ibd.id]);
}

export interface GrLine {
  idx: number;
  qty: number;
  bin: string;
}

export function postGoodsReceiptPO(s: SimState, ibdId: string, lines: GrLine[]): TxResult {
  const T = 'MIGO_GR';
  const ibd = getDoc(s, ibdId, 'IBD');
  if (!ibd) return fail(s, T, `Inbound delivery ${ibdId} not found.`, 'Select an inbound delivery that is at the dock.');
  const po = getDoc(s, ibd.po, 'PO');
  if (!po) return fail(s, T, `Purchase order for delivery ${ibdId} not found.`, 'Check the document flow of the delivery.');
  if (ibd.status === 'COMPLETED') return fail(s, T, `Goods receipt for delivery ${ibd.id} was already posted.`, 'Open the material document in the document flow instead of posting twice.');
  if ((ibd.arrivedAt === undefined)) return fail(s, T, `Delivery ${ibd.id} is not at the dock yet (ETA ${Math.round(ibd.eta)}).`, 'You can only receive goods that have physically arrived.');
  if (!lines.length) return fail(s, T, 'No items selected for goods receipt.', 'Enter a quantity for at least one item.');

  // validate everything first — no partial postings
  for (const ln of lines) {
    const it = ibd.items[ln.idx];
    const poItem = po.items.find((p) => p.material === it?.material);
    if (!it || !poItem) return fail(s, T, `Item ${ln.idx + 1} does not exist on delivery ${ibd.id}.`, 'Reload the delivery.');
    const m = MATERIALS[it.material];
    if (!(ln.qty > 0)) return fail(s, T, `Quantity for ${m.name} must be greater than zero.`, 'Enter the counted quantity.');
    if (m.uom === 'PC' && !Number.isInteger(ln.qty)) return fail(s, T, `${m.name} is managed in pieces — enter a whole number.`, 'Round to the counted number of pieces.');
    const open = poItem.qty - poItem.received;
    if (ln.qty > open * 1.1 + 1e-6) return fail(s, T, `Over-delivery: ${fmtQty(ln.qty, m.uom)} exceeds the open PO quantity ${fmtQty(open, m.uom)} + 10 % tolerance.`, 'Receive only what was ordered; return the excess to the supplier.');
    if (!ln.bin) return fail(s, T, `No destination storage bin for ${m.name}.`, 'Assign a storage bin (the system proposes a free one).');
    const err = storageCheck(s, it.material, ln.qty, ln.bin);
    if (err) return fail(s, T, err, 'Choose a free bin of the correct storage type. The proposal button picks one automatically.');
  }

  const items: MatDocItem[] = [];
  const created: string[] = [];
  const dockBin = `DOCK-IN-${(ibd.dock ?? 0) + 1}`;
  let mismatch = false;
  for (const ln of lines) {
    const it = ibd.items[ln.idx];
    const m = MATERIALS[it.material];
    const poItem = po.items.find((p) => p.material === it.material)!;
    const qi = !!m.qmIncoming;
    const sup = SUPPLIERS[ibd.supplier];
    const batch = it.batch || newBatchId(s, 'S');
    s.batches[batch] = s.batches[batch] ?? {
      id: batch,
      material: it.material,
      origin: 'SUPPLIER',
      supplier: ibd.supplier,
      createdAt: s.t,
      status: qi ? 'PENDING_QI' : 'RELEASED',
    };
    // physical stock is what really arrived — book stock is what the user posted
    // everything that arrived goes onto the pallet, whatever quantity is posted
    const physical = it.actualQty;
    if (Math.abs(ln.qty - it.actualQty) > 1e-6) mismatch = true;
    const stockType: StockType = qi ? 'QI' : 'UNR';
    const q = addQuant(s, it.material, dockBin, batch, ln.qty, stockType, physical);
    poItem.received = round(poItem.received + ln.qty);
    items.push({ material: it.material, qty: ln.qty, batch, toBin: ln.bin, stockType, quant: q.id });
    const wt = createWT(s, 'PUTAWAY', q.id, ln.qty, ln.bin, ibd.id);
    created.push(wt.id);
    if (qi) {
      const defective = !chance(s, sup?.quality ?? 0.98) || s.scenario === 'M03';
      const lot = createInspectionLot(s, '01', it.material, batch, ln.qty, { po: po.id, defective });
      created.push(lot.id);
    }
  }
  const md = postMatDoc(s, '101', items, [po.id, ibd.id], 'Goods receipt for purchase order');
  for (const id of created) link(s, md.id, id);
  ibd.status = 'COMPLETED';
  hist(s, ibd, 'Goods receipt posted', md.id);
  ibd.departAt = s.t + 20;
  const allIn = po.items.every((p) => p.received >= p.qty - 1e-6);
  po.status = allIn ? 'COMPLETED' : 'IN_PROGRESS';
  po.delivered = allIn;
  hist(s, po, 'Goods receipt', `${md.id}${allIn ? ' — fully delivered' : ' — partially delivered'}`);
  if (mismatch) {
    const counted = ibd.items.some((i) => i.counted !== undefined);
    s.stats.mistakes.push({
      t: s.t,
      code: 'GR_QTY',
      text: `GR quantity on ${md.id} differs from the quantity that physically arrived.`,
      fix: counted
        ? 'Reverse the material document (movement 102) and post the counted quantity.'
        : 'Always count the delivery before posting. Run a physical inventory on the bin to correct the book stock.',
    });
  }
  return ok(s, T, `Material document ${md.id} posted. Warehouse task${created.length > 1 ? 's' : ''} created for put-away.`, [md.id, ...created]);
}

/** Proposal: first free bin of the right type, preferring bins already holding the material. */
export function proposeBin(s: SimState, material: string, qty: number, prefer?: string[]): string | undefined {
  const m = MATERIALS[material];
  if (!m) return undefined;
  const bins = Object.values(BIN_MAP).filter((b) => b.type === m.binType);
  const same = bins.filter((b) => Object.values(s.quants).some((q) => q.bin === b.id && q.material === material));
  const order = [...(prefer ?? []).map((id) => BIN_MAP[id]).filter(Boolean), ...same, ...bins];
  for (const b of order) if (!storageCheck(s, material, qty, b.id)) return b.id;
  return undefined;
}

// ------------------------------------------------------------------ transfers
export function transferStock(s: SimState, quantId: string, qty: number, toBin: string): TxResult {
  const T = 'MIGO_TR';
  const q = s.quants[quantId];
  if (!q) return fail(s, T, 'Stock quant not found.', 'Refresh the bin and select the stock again.');
  const m = MATERIALS[q.material];
  if (!(qty > 0)) return fail(s, T, 'Transfer quantity must be greater than zero.', 'Enter a positive quantity.');
  if (qty > q.qty - q.reserved + 1e-6) return fail(s, T, `Only ${fmtQty(q.qty - q.reserved, m.uom)} of ${m.name} in ${q.bin} is unreserved.`, 'Reserved stock belongs to an order — transfer the free quantity only.');
  if (toBin === q.bin) return fail(s, T, 'Source and destination bin are identical.', 'Choose a different destination bin.');
  const open = Object.values(s.docs).some((d) => d.type === 'WT' && d.quant === q.id && (d.status === 'CREATED' || d.status === 'IN_PROGRESS'));
  if (open) return fail(s, T, `A warehouse task is already moving stock from ${q.bin}.`, 'Wait for the open warehouse task to be confirmed.');
  const err = storageCheck(s, q.material, qty, toBin);
  if (err) return fail(s, T, err, 'Choose a free bin of the correct storage type.');
  const wt = createWT(s, 'TRANSFER', q.id, qty, toBin);
  const md = postMatDoc(s, '311', [{ material: q.material, qty, batch: q.batch, fromBin: q.bin, toBin, stockType: q.stockType, quant: q.id }], [wt.id]);
  return ok(s, T, `Transfer ${md.id} posted, forklift task ${wt.id} created.`, [md.id, wt.id]);
}

/** Called by the tick when a forklift finishes a task: physically move the stock. */
export function executeWT(s: SimState, wt: WarehouseTask) {
  const q = s.quants[wt.quant];
  if (!q) {
    wt.status = 'CANCELLED';
    hist(s, wt, 'Cancelled', 'Source stock no longer exists');
    return;
  }
  const qty = Math.min(wt.qty, q.qty);
  const phys = Math.min(q.physical, qty);
  const reservedMove = Math.min(q.reserved, qty);
  const order = wt.kind === 'STAGING' || wt.kind === 'SPARE' ? wt.ref : wt.kind === 'PICK' ? wt.ref : undefined;
  if (Math.abs(qty - q.qty) < 1e-6 && wt.kind !== 'STAGING' && wt.kind !== 'PICK' && wt.kind !== 'SPARE') {
    q.bin = wt.toBin;
  } else {
    q.qty = round(q.qty - qty);
    q.physical = round(q.physical - phys);
    q.reserved = round(Math.max(0, q.reserved - reservedMove));
    const dest = addQuant(s, q.material, wt.toBin, q.batch, qty, q.stockType, phys, order);
    if (wt.kind === 'PICK') dest.reserved = qty;
    cleanupQuant(s, q);
  }
  wt.status = 'COMPLETED';
  wt.finishedAt = s.t;
  hist(s, wt, 'Confirmed', `${fmtQty(qty, MATERIALS[wt.material].uom)} → ${wt.toBin}`);
}

// ------------------------------------------------------------------ physical inventory
export function createPhysInv(s: SimState, bin: string): TxResult {
  const T = 'MI01';
  if (!BIN_MAP[bin]) return fail(s, T, `Bin ${bin} does not exist.`, 'Select a storage bin.');
  const open = Object.values(s.docs).find((d) => d.type === 'PI' && d.bin === bin && !d.posted && d.status !== 'CANCELLED');
  if (open) return fail(s, T, `Physical inventory ${open.id} is already open for ${bin}.`, 'Count and post the open document.');
  const quants = Object.values(s.quants).filter((q) => q.bin === bin);
  if (!quants.length) return fail(s, T, `Bin ${bin} is empty in the system — nothing to count.`, 'Choose a bin that holds stock.');
  const pi = addDoc<PhysInvDoc>(s, {
    ...baseDoc(s, 'PI'),
    type: 'PI',
    bin,
    items: quants.map((q) => ({ quant: q.id, material: q.material, batch: q.batch, book: q.qty })),
    posted: false,
  });
  return ok(s, T, `Physical inventory document ${pi.id} created for ${bin}. Book stock is frozen for counting.`, [pi.id]);
}

/** Simulates walking to the bin and counting — fills counts with the real physical stock. */
export function countPhysInv(s: SimState, piId: string): TxResult {
  const pi = getDoc(s, piId, 'PI');
  if (!pi) return fail(s, 'MI04', 'Physical inventory document not found.', 'Create one with MI01.');
  for (const it of pi.items) {
    const q = s.quants[it.quant];
    it.counted = q ? q.physical : 0;
  }
  pi.status = 'IN_PROGRESS';
  hist(s, pi, 'Counted', 'Count entered from scanner');
  return ok(s, 'MI04', `Count entered for ${pi.id}.`, [pi.id]);
}

export function postPhysInv(s: SimState, piId: string, counts?: number[]): TxResult {
  const T = 'MI07';
  const pi = getDoc(s, piId, 'PI');
  if (!pi) return fail(s, T, 'Physical inventory document not found.', 'Create one with MI01.');
  if (pi.posted) return fail(s, T, `${pi.id} is already posted.`, 'Create a new count if needed.');
  if (counts) counts.forEach((c, i) => pi.items[i] && (pi.items[i].counted = c));
  if (pi.items.some((i) => i.counted === undefined || !(i.counted >= 0))) return fail(s, T, 'Enter a count for every item (0 if nothing was found).', 'Use "Count bin" or type the counted quantities.');
  const gains: MatDocItem[] = [];
  const losses: MatDocItem[] = [];
  for (const it of pi.items) {
    const q = s.quants[it.quant];
    if (!q) continue;
    const diff = round(it.counted! - q.qty);
    if (Math.abs(diff) < 1e-6) continue;
    (diff > 0 ? gains : losses).push({ material: q.material, qty: Math.abs(diff), batch: q.batch, fromBin: q.bin, stockType: q.stockType, quant: q.id });
    q.qty = round(it.counted!);
    // the user counted reality — if they typed something else, physical stays as it is
    if (q.reserved > q.qty) {
      const lost = q.reserved - q.qty;
      q.reserved = q.qty;
      releaseReservationsFor(s, q.material, lost);
    }
  }
  const docs: string[] = [pi.id];
  if (gains.length) docs.push(postMatDoc(s, '701', gains, [pi.id]).id);
  if (losses.length) docs.push(postMatDoc(s, '702', losses, [pi.id]).id);
  pi.posted = true;
  pi.status = 'COMPLETED';
  hist(s, pi, 'Differences posted', gains.length + losses.length ? `${gains.length + losses.length} difference(s)` : 'No differences');
  for (const id of pi.items.map((i) => i.quant)) {
    const q = s.quants[id];
    if (q) cleanupQuant(s, q);
  }
  // physical shortages that were caught by this count are resolved
  for (const e of s.events) if (e.kind === 'PICK_SHORTAGE' && e.refs.includes(pi.bin)) e.resolved = true;
  return ok(s, T, gains.length + losses.length ? `Inventory differences posted for ${pi.bin}. Book stock now matches the shelf.` : `No differences in ${pi.bin}. Book stock was correct.`, docs);
}

/** When book stock drops below what is reserved, orders lose part of their reservation. */
function releaseReservationsFor(s: SimState, material: string, qty: number) {
  let left = qty;
  for (const d of Object.values(s.docs)) {
    if (left <= 0) break;
    if (d.type !== 'PP' || d.status === 'COMPLETED' || d.status === 'CANCELLED') continue;
    for (const c of d.components) {
      if (c.material !== material || left <= 0) continue;
      const free = Math.max(0, c.reserved - c.staged);
      const take = Math.min(free, left);
      c.reserved = round(c.reserved - take);
      left -= take;
      if (take > 0) hist(s, d, 'Reservation reduced', `${material} −${fmtQty(take)} after inventory correction`);
    }
  }
}

// ------------------------------------------------------------------ reversal
export function reverseMatDoc(s: SimState, mdId: string): TxResult {
  const T = 'MB_REV';
  const md = getDoc(s, mdId, 'MD');
  if (!md) return fail(s, T, `Material document ${mdId} not found.`, 'Search the document center.');
  if (md.reversedBy) return fail(s, T, `${md.id} was already reversed by ${md.reversedBy}.`, 'A document can only be reversed once.');
  if (md.reverses) return fail(s, T, `${md.id} is itself a reversal document.`, 'Post a new transaction instead of reversing a reversal.');
  if (md.mvt !== '101' || !md.refs.some((r) => s.docs[r]?.type === 'PO')) {
    return fail(s, T, `Movement ${md.mvt} cannot be reversed in this simulation.`, 'Use a correction posting: physical inventory (701/702) or a transfer posting (311).');
  }
  // every received quant must still be untouched
  for (const it of md.items) {
    const q = it.quant ? s.quants[it.quant] : undefined;
    if (!q || q.qty + 1e-6 < it.qty || q.reserved > q.qty - it.qty + 1e-6) {
      return fail(s, T, `Stock from ${md.id} has already been moved, reserved or consumed.`, 'Reverse follow-on documents first, or correct the stock via physical inventory.');
    }
  }
  const po = md.refs.map((r) => s.docs[r]).find((d) => d?.type === 'PO');
  const ibd = md.refs.map((r) => s.docs[r]).find((d) => d?.type === 'IBD');
  const items: MatDocItem[] = [];
  for (const it of md.items) {
    const q = s.quants[it.quant!];
    // cancel the put-away task if the forklift has not started
    for (const d of Object.values(s.docs)) {
      if (d.type === 'WT' && d.quant === q.id && d.status === 'CREATED') {
        d.status = 'CANCELLED';
        hist(s, d, 'Cancelled', `GR reversed`);
      }
    }
    const physLeft = Math.max(0, q.physical - it.qty);
    q.qty = round(q.qty - it.qty);
    q.physical = round(physLeft);
    if (q.qty <= 1e-6) {
      // nothing left in the book: whatever is physically there stays as an unknown overage
      q.physical = round(q.physical);
    }
    cleanupQuant(s, q);
    if (po && po.type === 'PO') {
      const p = po.items.find((x) => x.material === it.material);
      if (p) p.received = round(Math.max(0, p.received - it.qty));
    }
    items.push({ ...it, toBin: undefined, fromBin: q.bin });
  }
  const rev = postMatDoc(s, '102', items, [md.id], 'Reversal of goods receipt');
  rev.reverses = md.id;
  md.reversedBy = rev.id;
  md.status = 'CANCELLED';
  hist(s, md, 'Reversed', rev.id);
  if (po && po.type === 'PO') {
    po.status = 'IN_PROGRESS';
    po.delivered = false;
    hist(s, po, 'GR reversed', rev.id);
  }
  if (ibd && ibd.type === 'IBD') {
    ibd.status = 'IN_PROGRESS';
    ibd.departAt = undefined;
    hist(s, ibd, 'GR reversed — goods back at dock', rev.id);
  }
  s.stats.reversals++;
  return ok(s, T, `Reversal document ${rev.id} posted. You can now post the correct goods receipt.`, [rev.id]);
}

// ------------------------------------------------------------------ batches
export function blockBatch(s: SimState, batchId: string, reason: string): TxResult {
  const T = 'QA_BLOCK';
  const b = s.batches[batchId];
  if (!b) return fail(s, T, `Batch ${batchId} not found.`, 'Select a batch from the stock overview.');
  if (b.status === 'BLOCKED' || b.status === 'REJECTED') return fail(s, T, `Batch ${batchId} is already blocked.`, 'No action needed.');
  if (!reason.trim()) return fail(s, T, 'A reason is required to block a batch.', 'Describe the defect (e.g. "e-coat thickness below 15 µm").');
  const items: MatDocItem[] = [];
  for (const q of Object.values(s.quants)) {
    if (q.batch !== batchId || q.stockType !== 'UNR') continue;
    if (q.reserved > 0) cancelPicksForQuant(s, q.id);
    q.stockType = 'BLK';
    q.reserved = 0;
    items.push({ material: q.material, qty: q.qty, batch: q.batch, fromBin: q.bin, stockType: 'UNR', toStockType: 'BLK', quant: q.id });
  }
  b.status = 'BLOCKED';
  const docs: string[] = [];
  if (items.length) docs.push(postMatDoc(s, '344', items, [], 'Batch blocked by quality').id);
  const qn = addDoc<QualityNotification>(s, { ...baseDoc(s, 'QN'), type: 'QN', kind: 'Q3', material: b.material, batch: b.id, defect: reason, qty: items.reduce((a, i) => a + i.qty, 0), cost: 0 });
  docs.push(qn.id);
  if (docs[0] && docs[0] !== qn.id) link(s, docs[0], qn.id);
  return ok(s, T, `Batch ${batchId} blocked. It can no longer be picked or shipped.`, docs);
}

export function unblockBatch(s: SimState, batchId: string): TxResult {
  const T = 'QA_BLOCK';
  const b = s.batches[batchId];
  if (!b) return fail(s, T, `Batch ${batchId} not found.`, 'Select a batch.');
  if (b.status !== 'BLOCKED') return fail(s, T, `Batch ${batchId} is not blocked.`, 'Only blocked batches can be released.');
  if (b.latentDefect) {
    s.stats.mistakes.push({ t: s.t, code: 'UNBLOCK_DEFECT', text: `Batch ${batchId} with a known defect was released.`, fix: 'Keep defective batches blocked; scrap them (551) or rework.' });
  }
  const items: MatDocItem[] = [];
  for (const q of Object.values(s.quants)) {
    if (q.batch !== batchId || q.stockType !== 'BLK') continue;
    q.stockType = 'UNR';
    items.push({ material: q.material, qty: q.qty, batch: q.batch, fromBin: q.bin, stockType: 'BLK', toStockType: 'UNR', quant: q.id });
  }
  b.status = 'RELEASED';
  const md = postMatDoc(s, '343', items, [], 'Batch released');
  return ok(s, T, `Batch ${batchId} released to unrestricted stock.`, [md.id]);
}

export function scrapQuant(s: SimState, quantId: string): TxResult {
  const T = 'QA_BLOCK';
  const q = s.quants[quantId];
  if (!q) return fail(s, T, 'Stock not found.', 'Refresh the view.');
  if (q.stockType !== 'BLK') return fail(s, T, 'Only blocked stock can be scrapped.', 'Block the batch first (movement 344), then scrap.');
  const md = postMatDoc(s, '551', [{ material: q.material, qty: q.qty, batch: q.batch, fromBin: q.bin, stockType: 'BLK', quant: q.id }], [], 'Scrapping of blocked stock');
  s.stats.materialCost += q.qty * MATERIALS[q.material].price;
  q.qty = 0;
  q.physical = 0;
  cleanupQuant(s, q);
  return ok(s, T, `Blocked stock scrapped (${md.id}).`, [md.id]);
}

export function returnToVendor(s: SimState, quantId: string): TxResult {
  const T = 'MIGO_GR';
  const q = s.quants[quantId];
  if (!q) return fail(s, T, 'Stock not found.', 'Refresh the view.');
  const b = s.batches[q.batch];
  if (!b || b.origin !== 'SUPPLIER') return fail(s, T, 'Only supplier batches can be returned.', 'Scrap or rework production batches.');
  if (q.stockType === 'UNR') return fail(s, T, 'Unrestricted stock cannot be returned without a quality reason.', 'Reject the inspection lot or block the batch first.');
  const md = postMatDoc(s, '122', [{ material: q.material, qty: q.qty, batch: q.batch, fromBin: q.bin, stockType: q.stockType, quant: q.id }], [], 'Return delivery to vendor');
  const po = Object.values(s.docs).find((d) => d.type === 'PO' && d.supplier === b.supplier && d.items.some((i) => i.material === q.material && i.received > 0));
  if (po && po.type === 'PO') {
    const it = po.items.find((i) => i.material === q.material)!;
    it.received = round(Math.max(0, it.received - q.qty));
    po.status = 'IN_PROGRESS';
    po.delivered = false;
    link(s, md.id, po.id);
    hist(s, po, 'Return delivery', `${md.id}: ${fmtQty(q.qty, MATERIALS[q.material].uom)} returned — open quantity re-opened`);
  }
  q.qty = 0;
  q.physical = 0;
  cleanupQuant(s, q);
  return ok(s, T, `Return delivery ${md.id} posted. The PO quantity is open again for a replacement delivery.`, [md.id]);
}

function cancelPicksForQuant(s: SimState, quantId: string) {
  for (const d of Object.values(s.docs)) {
    if (d.type === 'WT' && d.quant === quantId && d.kind === 'PICK' && d.status === 'CREATED') {
      d.status = 'CANCELLED';
      hist(s, d, 'Cancelled', 'Batch blocked');
      const dlv = getDoc(s, d.ref, 'DLV');
      if (dlv) {
        for (const it of dlv.items) it.picks = it.picks.filter((p) => p.wt !== d.id);
        dlv.pickStatus = 'IN_PROGRESS';
        hist(s, dlv, 'Pick cancelled', `Batch ${d.batch} blocked`);
      }
    }
  }
}

// ------------------------------------------------------------------ helpers for other modules
export function createInspectionLot(
  s: SimState,
  origin: '01' | '03' | '04',
  material: string,
  batch: string,
  qty: number,
  opts: { po?: string; order?: string; defective?: boolean; defectRate?: number },
): InspectionLot {
  const sample = Math.min(qty, origin === '01' ? 3 : Math.max(5, Math.round(Math.sqrt(qty))));
  const defectRate = opts.defectRate ?? (opts.defective ? 0.06 : 0);
  const defects = Math.round(qty * defectRate);
  const lot = addDoc<InspectionLot>(s, {
    ...baseDoc(s, 'IL', 'RELEASED'),
    type: 'IL',
    origin,
    material,
    batch,
    qty,
    sample,
    order: opts.order,
    po: opts.po,
    chars: makeCharacteristics(s, origin, defects > 0 || !!opts.defective),
    defectsFound: defects,
    resultsRecorded: false,
  });
  if (opts.po) link(s, lot.id, opts.po);
  if (opts.order) link(s, lot.id, opts.order);
  return lot;
}

export function freeCapacitySummary(s: SimState, type: string) {
  let free = 0;
  let total = 0;
  for (const b of Object.values(BIN_MAP)) {
    if (b.type !== type) continue;
    total += b.capacity;
    free += binFree(s, b.id);
  }
  return { free, total, used: total - free };
}

export { STORAGE_TYPES };

/** Split a put-away over several bins (one pallet place = perPallet units). */
export function planPutaway(s: SimState, material: string, qty: number, bins: string[]): { bin: string; qty: number }[] | string {
  const m = MATERIALS[material];
  const plan: { bin: string; qty: number }[] = [];
  let left = qty;
  for (const bin of bins) {
    if (left <= 1e-6) break;
    const def = BIN_MAP[bin];
    if (!def) return `Storage bin ${bin} does not exist.`;
    const err = storageCheck(s, material, Math.min(left, m.perPallet), bin);
    if (err) return err;
    const take = Math.min(left, binFree(s, bin) * m.perPallet);
    if (take <= 0) continue;
    plan.push({ bin, qty: round(take) });
    left = round(left - take);
  }
  if (left > 1e-6) {
    const pallets = Math.ceil(qty / m.perPallet);
    return `${fmtQty(qty, m.uom)} need ${pallets} pallet places — the selected bin(s) hold only ${fmtQty(qty - left, m.uom)}. Add more bins.`;
  }
  return plan;
}

/** Bins covering the whole quantity: bins already holding the material first, then empty ones. */
export function proposeBins(s: SimState, material: string, qty: number): string[] {
  const m = MATERIALS[material];
  if (!m) return [];
  const bins = Object.values(BIN_MAP).filter((b) => b.type === m.binType);
  const same = bins.filter((b) => Object.values(s.quants).some((q) => q.bin === b.id && q.material === material));
  const out: string[] = [];
  let left = qty;
  for (const b of [...same, ...bins.filter((x) => !same.includes(x))]) {
    if (left <= 1e-6) break;
    if (out.includes(b.id)) continue;
    if (storageCheck(s, material, Math.min(left, m.perPallet), b.id)) continue;
    const take = Math.min(left, binFree(s, b.id) * m.perPallet);
    if (take <= 0) continue;
    out.push(b.id);
    left -= take;
  }
  return left > 1e-6 ? [] : out;
}
