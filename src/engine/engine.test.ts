import { describe, expect, it } from 'vitest';
import {
  advance,
  availableQty,
  blockBatch,
  completeMaintOrder,
  confirmOperation,
  countInbound,
  countPhysInv,
  createDelivery,
  createMaintOrder,
  createPhysInv,
  createProductionOrder,
  createScenario,
  createShipment,
  docsOf,
  getDoc,
  packDelivery,
  pickDelivery,
  postGoodsIssue,
  postGoodsReceiptPO,
  postOrderGR,
  postPhysInv,
  proposeBin,
  proposeBins,
  recordResults,
  releaseOrder,
  reverseMatDoc,
  stageComponents,
  triggerBreakdown,
  usageDecision,
  binUsage,
  computeScore,
  inventoryAccuracy,
} from './index';
import type { SimState } from './types';

function runUntil(s: SimState, pred: () => boolean, maxMin = 3000) {
  let n = 0;
  while (!pred() && n < maxMin) {
    advance(s, 1);
    n++;
  }
  return pred();
}

describe('Mission 01 end-to-end workflow', () => {
  it('runs from steel receipt to shipment with consistent stock', () => {
    const s = createScenario('M01', 'TRAINEE');
    const ibd = docsOf(s, 'IBD')[0];
    expect(ibd.arrivedAt).toBe(0);

    // releasing before the receipt fails: 600 kg on stock, 1,600 kg needed
    const early = createProductionOrder(s, 'FG-CM-4410', 500);
    expect(early.ok).toBe(true);
    const ppId = early.docs![0];
    expect(ppId).toBe('PP-100025');
    const rel1 = releaseOrder(s, ppId);
    expect(rel1.ok).toBe(false);
    expect(rel1.message).toMatch(/Missing parts/);

    // goods receipt to the wrong storage type is rejected
    const wrong = postGoodsReceiptPO(s, ibd.id, [{ idx: 0, qty: 2000, bin: 'WH03-C-05-1' }]);
    expect(wrong.ok).toBe(false);

    expect(countInbound(s, ibd.id).ok).toBe(true);
    const bin = proposeBin(s, 'RM-S355', 2000)!;
    expect(bin).toMatch(/^WH02-S-/);
    const gr = postGoodsReceiptPO(s, ibd.id, [{ idx: 0, qty: 2000, bin }]);
    expect(gr.ok).toBe(true);
    // stock sits at the dock until the forklift has put it away
    expect(availableQty(s, 'RM-S355')).toBe(600);
    runUntil(s, () => docsOf(s, 'WT').every((w) => w.status === 'COMPLETED'));
    expect(availableQty(s, 'RM-S355')).toBe(2600);

    expect(releaseOrder(s, ppId).ok).toBe(true);
    expect(availableQty(s, 'RM-S355')).toBe(1000);
    expect(stageComponents(s, ppId).ok).toBe(true);
    const pp = getDoc(s, ppId, 'PP')!;
    runUntil(s, () => pp.stagingDone);
    expect(pp.stagingDone).toBe(true);

    // run the production; confirm each operation as soon as it is done
    for (const op of pp.ops) {
      expect(runUntil(s, () => op.status === 'DONE', 1500)).toBe(true);
      if (op.inspectionLot) {
        const lot = getDoc(s, op.inspectionLot, 'IL')!;
        const vals = Object.fromEntries(lot.chars.map((c) => [c.code, c.measured]));
        expect(recordResults(s, lot.id, vals).ok).toBe(true);
        expect(usageDecision(s, lot.id, 'ACCEPT').ok).toBe(true);
        const r = confirmOperation(s, ppId, op.no, op.qtyIn, 0);
        expect(r.ok).toBe(true);
      } else {
        // a wrong confirmation is rejected
        expect(confirmOperation(s, ppId, op.no, op.produced, 0).ok).toBe(op.scrap === 0);
        if (op.status !== 'CONFIRMED') expect(confirmOperation(s, ppId, op.no, op.produced - op.scrap, op.scrap).ok).toBe(true);
      }
    }
    expect(pp.components.every((c) => Math.abs(c.issued - c.required) < 1e-6)).toBe(true);
    const fgBin = proposeBins(s, 'FG-CM-4410', pp.ops[pp.ops.length - 1].qtyIn);
expect(fgBin.length).toBeGreaterThan(1);
    const grFg = postOrderGR(s, ppId, fgBin);
    expect(grFg.ok).toBe(true);
    expect(pp.status).toBe('COMPLETED');
    runUntil(s, () => docsOf(s, 'WT').every((w) => w.status === 'COMPLETED'));
    expect(availableQty(s, 'FG-CM-4410')).toBe(pp.grQty);
    expect(pp.grQty).toBeGreaterThan(470);

    // deliver 450 to the customer
    const so = docsOf(s, 'SO')[0];
    const dl = createDelivery(s, so.id, 450, 0);
    expect(dl.ok).toBe(true);
    const dlvId = dl.docs![0];
    expect(postGoodsIssue(s, dlvId).ok).toBe(false); // nothing picked yet
    expect(pickDelivery(s, dlvId).ok).toBe(true);
    const dlv = getDoc(s, dlvId, 'DLV')!;
    runUntil(s, () => dlv.pickStatus === 'DONE');
    expect(packDelivery(s, dlvId).ok).toBe(true);
    expect(createShipment(s, dlvId, 'CR-02', 'V-21', 15).ok).toBe(true);
    const shp = getDoc(s, dlv.shipment, 'SHP')!;
    runUntil(s, () => shp.loadedAt !== undefined, 600);
    const pgi = postGoodsIssue(s, dlvId);
    expect(pgi.ok).toBe(true);
    expect(availableQty(s, 'FG-CM-4410')).toBe(pp.grQty - 450);
    runUntil(s, () => shp.deliveredAt !== undefined, 600);
    expect(so.items[0].delivered).toBe(450);
    expect(s.stats.deliveriesOnTime + s.stats.deliveriesLate).toBe(1);
    expect(computeScore(s).total).toBeGreaterThan(0);
  });
});

describe('impossible states are rejected', () => {
  it('cannot confirm out of sequence or ship blocked batches', () => {
    const s = createScenario('M04', 'T');
    expect(confirmOperation(s, 'PP-404', '0010', 1, 0).ok).toBe(false);
    const so = docsOf(s, 'SO')[0];
    // block the SR-7130 stock and try to deliver it
    const q = Object.values(s.quants).find((x) => x.material === 'FG-SR-7130')!;
    expect(blockBatch(s, q.batch, 'Coating defect').ok).toBe(true);
    const d = createDelivery(s, so.id, 100, 1);
    expect(d.ok).toBe(false);
    expect(d.message).toMatch(/Availability/);
  });

  it('cannot use a machine under maintenance', () => {
    const s = createScenario('M02', 'T');
    const pp = docsOf(s, 'PP')[0];
    const op = pp.ops[0];
    expect(op.machine).toBe('PRESS-02');
    triggerBreakdown(s, 'PRESS-02', 'P-HYD-LEAK');
    advance(s, 2);
    expect(s.machines['PRESS-02'].status).toBe('STOPPED');
    const before = op.produced;
    advance(s, 20);
    expect(op.produced).toBe(before);
    // wrong skill is rejected
    const elec = Object.values(s.employees).find((e) => e.role === 'TECH' && e.shift === 1 && e.skill === 'ELEC')!;
    expect(createMaintOrder(s, { machine: 'PRESS-02', kind: 'PM01', technician: elec.id }).ok).toBe(false);
    const hyd = Object.values(s.employees).find((e) => e.role === 'TECH' && e.shift === 1 && e.skill === 'HYD')!;
    const mo = createMaintOrder(s, { machine: 'PRESS-02', kind: 'PM01', technician: hyd.id });
    expect(mo.ok).toBe(true);
    expect(completeMaintOrder(s, mo.docs![0]).ok).toBe(false);
    advance(s, 160);
    expect(s.machines['PRESS-02'].status).toBe('MAINT');
    expect(completeMaintOrder(s, mo.docs![0]).ok).toBe(true);
    advance(s, 5);
    expect(op.produced).toBeGreaterThan(before);
  });

  it('wrong goods receipt quantity creates a pick shortage that a count resolves', () => {
    const s = createScenario('M05', 'T');
    const pp = docsOf(s, 'PP')[0];
    expect(releaseOrder(s, pp.id).ok).toBe(true);
    expect(stageComponents(s, pp.id).ok).toBe(true);
    runUntil(s, () => s.events.some((e) => e.kind === 'PICK_SHORTAGE'), 200);
    expect(s.events.some((e) => e.kind === 'PICK_SHORTAGE')).toBe(true);
    expect(inventoryAccuracy(s)).toBeLessThan(1);
    const pi = createPhysInv(s, 'WH02-S-01');
    expect(pi.ok).toBe(true);
    expect(countPhysInv(s, pi.docs![0]).ok).toBe(true);
    expect(postPhysInv(s, pi.docs![0]).ok).toBe(true);
    expect(inventoryAccuracy(s)).toBeCloseTo(1, 5);
    expect(releaseOrder(s, pp.id).ok).toBe(true);
    expect(stageComponents(s, pp.id).ok).toBe(true);
    runUntil(s, () => pp.stagingDone, 300);
    expect(pp.stagingDone).toBe(true);
  });

  it('reverses a goods receipt and re-opens the PO', () => {
    const s = createScenario('M01', 'T');
    const ibd = docsOf(s, 'IBD')[0];
    const bin = proposeBin(s, 'RM-S355', 2000)!;
    const usageBefore = binUsage(s, bin);
    const r = postGoodsReceiptPO(s, ibd.id, [{ idx: 0, qty: 2000, bin }]);
    const md = r.docs![0];
    const rev = reverseMatDoc(s, md);
    expect(rev.ok).toBe(true);
    expect(getDoc(s, ibd.po, 'PO')!.items[0].received).toBe(0);
    expect(binUsage(s, bin)).toBe(usageBefore);
    expect(postGoodsReceiptPO(s, ibd.id, [{ idx: 0, qty: 2000, bin }]).ok).toBe(true);
  });

  it('accepting a nonconforming lot is recorded as a mistake', () => {
    const s = createScenario('M03', 'T');
    const ibd = docsOf(s, 'IBD')[0];
    const bin = proposeBin(s, 'RM-22MNB5', 2000)!;
    expect(postGoodsReceiptPO(s, ibd.id, [{ idx: 0, qty: 2000, bin }]).ok).toBe(true);
    const lot = docsOf(s, 'IL')[0];
    expect(lot.chars.some((c) => c.measured < c.lsl || c.measured > c.usl)).toBe(true);
    // stock in QI is not available for production
    expect(availableQty(s, 'RM-22MNB5')).toBe(900);
    expect(recordResults(s, lot.id, Object.fromEntries(lot.chars.map((c) => [c.code, c.measured]))).ok).toBe(true);
    expect(usageDecision(s, lot.id, 'REJECT').ok).toBe(true);
    runUntil(s, () => docsOf(s, 'WT').every((w) => w.status !== 'CREATED' && w.status !== 'IN_PROGRESS'));
    expect(availableQty(s, 'RM-22MNB5')).toBe(900);
    expect(docsOf(s, 'QN').some((q) => q.kind === 'Q2')).toBe(true);
  });

  it('free mode runs 48 hours without crashing', () => {
    const s = createScenario('FREE', 'T', 7);
    advance(s, 48 * 60);
    expect(s.t).toBeGreaterThanOrEqual(48 * 60);
    expect(s.events.length).toBeGreaterThan(3);
    expect(s.stats.oeeByHour.length).toBeGreaterThan(40);
    for (const q of Object.values(s.quants)) {
      expect(q.qty).toBeGreaterThanOrEqual(-1e-6);
      expect(q.reserved).toBeLessThanOrEqual(q.qty + 1e-6);
    }
  });
});
