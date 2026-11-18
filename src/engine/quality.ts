// QM: characteristics, results recording, usage decisions, notifications.
import { FINAL_CHARS, INCOMING_CHARS, MATERIALS } from './master';
import { addDoc, baseDoc, fail, gauss, getDoc, hist, link, ok, round } from './core';
import type { Characteristic, QualityNotification, SimState, TxResult } from './types';
import { postMatDoc } from './inventory';

export function makeCharacteristics(s: SimState, origin: '01' | '03' | '04', defective: boolean): Characteristic[] {
  const specs = origin === '01' ? INCOMING_CHARS : FINAL_CHARS;
  // one characteristic drifts out of tolerance when the lot is defective
  const bad = defective ? Math.floor(Math.abs(gauss(s, 0, 1)) * 10) % specs.length : -1;
  return specs.map((c, i) => {
    const tol = (c.usl - c.lsl) / 2;
    let v = gauss(s, c.target, tol * 0.22);
    v = Math.min(c.usl - tol * 0.05, Math.max(c.lsl + tol * 0.05, v));
    if (i === bad) {
      const dir = gauss(s, 0, 1) > 0 ? 1 : -1;
      v = dir > 0 ? c.usl + tol * (0.12 + Math.abs(gauss(s, 0, 0.12))) : c.lsl - tol * (0.12 + Math.abs(gauss(s, 0, 0.12)));
    }
    const decimals = c.unit === 'mm' && tol < 1 ? 3 : c.unit === 'mm' ? 2 : 1;
    return { ...c, measured: round(v, decimals) };
  });
}

export const charOk = (c: Characteristic, v = c.recorded ?? c.measured) => v >= c.lsl - 1e-9 && v <= c.usl + 1e-9;

export function recordResults(s: SimState, lotId: string, values: Record<string, number>): TxResult {
  const T = 'QA32';
  const lot = getDoc(s, lotId, 'IL');
  if (!lot) return fail(s, T, `Inspection lot ${lotId} not found.`, 'Open the inspection lot worklist.');
  if (lot.decision) return fail(s, T, `Usage decision already made for lot ${lot.id}.`, 'Results cannot be changed after the usage decision.');
  if (lot.order) {
    const pp = getDoc(s, lot.order, 'PP');
    const op = pp?.ops.find((o) => o.inspectionLot === lot.id);
    if (op && op.status !== 'DONE') return fail(s, T, `Inspection at QC-01 is still running for lot ${lot.id}.`, 'Wait until the CMM station has finished measuring the sample.');
  }
  for (const c of lot.chars) {
    const v = values[c.code];
    if (v === undefined || Number.isNaN(v)) return fail(s, T, `No result entered for characteristic ${c.code} (${c.name}).`, 'Every characteristic needs a result. Copy the measured value from the measuring device.');
    // results must match what the instrument measured (within rounding)
    const tol = Math.max(Math.abs(c.measured) * 0.002, c.unit === 'mm' ? 0.002 : 0.06);
    if (Math.abs(v - c.measured) > tol) {
      return fail(s, T, `Result ${v} ${c.unit} for ${c.code} does not match the measuring device reading.`, 'Transfer the value exactly as the CMM / instrument reports it. Never adjust measurements.', 'QM_RESULT');
    }
  }
  for (const c of lot.chars) c.recorded = values[c.code];
  lot.resultsRecorded = true;
  lot.status = 'IN_PROGRESS';
  const rejected = lot.chars.filter((c) => !charOk(c));
  hist(s, lot, 'Results recorded', rejected.length ? `${rejected.length} characteristic(s) rejected: ${rejected.map((c) => c.code).join(', ')}` : 'All characteristics accepted');
  return ok(s, T, rejected.length ? `Results recorded — ${rejected.length} characteristic(s) out of tolerance.` : 'Results recorded — all characteristics within tolerance.', [lot.id]);
}

export type UsageDecision = 'ACCEPT' | 'REJECT' | 'SORT';

export function usageDecision(s: SimState, lotId: string, decision: UsageDecision): TxResult {
  const T = 'QA32';
  const lot = getDoc(s, lotId, 'IL');
  if (!lot) return fail(s, T, `Inspection lot ${lotId} not found.`, 'Open the inspection lot worklist.');
  if (!lot.resultsRecorded) return fail(s, T, `Record the inspection results for lot ${lot.id} before the usage decision.`, 'Enter a result for every characteristic, then decide.');
  if (lot.decision) return fail(s, T, `Usage decision for lot ${lot.id} was already made.`, 'The decision is final — create a quality notification if you found a new problem.');
  const anyBad = lot.chars.some((c) => !charOk(c));
  const b = s.batches[lot.batch];
  const docs: string[] = [lot.id];

  if (decision === 'SORT' && lot.origin === '01') return fail(s, T, 'Sorting is only possible for production lots.', 'Accept or reject the supplier batch.');

  if (decision === 'ACCEPT') {
    lot.acceptedQty = lot.qty;
    if (anyBad) {
      if (b) b.latentDefect = true;
      s.stats.mistakes.push({
        t: s.t,
        code: 'UD_ACCEPT_BAD',
        text: `Lot ${lot.id} accepted although characteristics were out of tolerance.`,
        fix: 'When the valuation shows a rejected characteristic, choose Reject (block) or 100 % sorting. Defects found later by the customer cost far more.',
      });
    }
  } else if (decision === 'REJECT') {
    lot.acceptedQty = 0;
    if (!anyBad) {
      s.stats.mistakes.push({ t: s.t, code: 'UD_REJECT_GOOD', text: `Lot ${lot.id} rejected although every characteristic was within tolerance.`, fix: 'Reject only when the valuation shows a nonconformity — good parts were blocked unnecessarily.' });
    }
  } else {
    // 100 % sorting: defective parts are separated and scrapped
    const bad = anyBad ? Math.max(1, lot.defectsFound) : 0;
    lot.acceptedQty = lot.qty - bad;
    s.stats.conversionCost += lot.qty * 0.35; // sorting labour
    if (b) b.latentDefect = false;
  }
  lot.decision = decision === 'REJECT' ? 'REJECT' : 'ACCEPT';
  lot.status = 'COMPLETED';
  hist(s, lot, 'Usage decision', decision === 'SORT' ? `Accepted after 100 % sorting (${lot.qty - (lot.acceptedQty ?? 0)} pcs sorted out)` : decision === 'ACCEPT' ? 'Accepted' : 'Rejected');

  if (lot.origin === '01') {
    // incoming inspection: move quality stock
    const items = [];
    for (const q of Object.values(s.quants)) {
      if (q.batch !== lot.batch || q.stockType !== 'QI') continue;
      q.stockType = decision === 'ACCEPT' ? 'UNR' : 'BLK';
      items.push({ material: q.material, qty: q.qty, batch: q.batch, fromBin: q.bin, stockType: 'QI' as const, toStockType: q.stockType, quant: q.id });
    }
    if (b) b.status = decision === 'ACCEPT' ? 'RELEASED' : 'REJECTED';
    if (items.length) docs.push(postMatDoc(s, decision === 'ACCEPT' ? '321' : '350', items, [lot.id]).id);
    if (decision === 'REJECT') {
      const qn = addDoc<QualityNotification>(s, { ...baseDoc(s, 'QN'), type: 'QN', kind: 'Q2', material: lot.material, batch: lot.batch, defect: lot.chars.filter((c) => !charOk(c)).map((c) => `${c.name} out of tolerance`).join('; ') || 'Rejected at incoming inspection', qty: lot.qty, cost: 0 });
      link(s, qn.id, lot.id);
      if (lot.po) link(s, qn.id, lot.po);
      docs.push(qn.id);
    }
  } else {
    if (b) b.status = decision === 'REJECT' ? 'BLOCKED' : 'RELEASED';
    if (decision === 'REJECT') {
      const qn = addDoc<QualityNotification>(s, { ...baseDoc(s, 'QN'), type: 'QN', kind: 'Q3', material: lot.material, batch: lot.batch, defect: lot.chars.filter((c) => !charOk(c)).map((c) => `${c.name} out of tolerance`).join('; ') || 'Rejected at final inspection', qty: lot.qty, cost: lot.qty * MATERIALS[lot.material].price * 0.4 });
      link(s, qn.id, lot.id);
      docs.push(qn.id);
    }
  }
  const label = decision === 'SORT' ? 'accepted after sorting' : decision === 'ACCEPT' ? 'accepted' : 'rejected';
  return ok(s, T, `Usage decision posted: lot ${lot.id} ${label}.`, docs);
}

export function createQualityNotification(s: SimState, material: string, batch: string | undefined, defect: string, qty: number): TxResult {
  const T = 'QM01';
  if (!MATERIALS[material]) return fail(s, T, 'Select a material.', 'Choose the affected material.');
  if (defect.trim().length < 5) return fail(s, T, 'Describe the defect (at least 5 characters).', 'Example: "Weld seam porosity on left bracket".');
  if (!(qty > 0)) return fail(s, T, 'Affected quantity must be greater than zero.', 'Enter the number of affected parts.');
  const qn = addDoc<QualityNotification>(s, { ...baseDoc(s, 'QN'), type: 'QN', kind: 'Q3', material, batch, defect, qty, cost: 0 });
  return ok(s, T, `Quality notification ${qn.id} created.`, [qn.id]);
}

export function closeQualityNotification(s: SimState, id: string): TxResult {
  const qn = getDoc(s, id, 'QN');
  if (!qn) return fail(s, 'QM01', 'Notification not found.', 'Select a notification.');
  if (qn.status === 'COMPLETED') return fail(s, 'QM01', `${qn.id} is already closed.`, 'No action needed.');
  if (qn.batch) {
    const b = s.batches[qn.batch];
    const unr = Object.values(s.quants).some((q) => q.batch === qn.batch && q.stockType === 'UNR');
    if (b && (b.status === 'BLOCKED' || b.status === 'REJECTED') && Object.values(s.quants).some((q) => q.batch === qn.batch)) {
      return fail(s, 'QM01', `Batch ${qn.batch} still has blocked stock.`, 'Decide what happens to the blocked stock first: scrap (551) or return to vendor (122).');
    }
    if (b?.latentDefect && unr) return fail(s, 'QM01', `Batch ${qn.batch} still has defective unrestricted stock.`, 'Block the batch first so it cannot be shipped again.');
  }
  qn.status = 'COMPLETED';
  hist(s, qn, 'Notification closed', 'Root cause analysed, containment done');
  return ok(s, 'QM01', `Quality notification ${qn.id} closed.`, [qn.id]);
}
