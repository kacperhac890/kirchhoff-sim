// Starting states for training missions and free simulation.
import { FORKLIFT_HOMES, MACHINES } from './layout';
import { makeEmployees } from './master';
import { addDoc, addQuant, baseDoc, newBatchId } from './core';
import type { InboundDelivery, PurchaseOrder, SalesOrder, SimState } from './types';
import { createProductionOrder, releaseOrder, stageComponents } from './production';
import { advance } from './tick';
import { createPO } from './procurement';
import { hourlySnapshot } from './kpi';

export const STATE_VERSION = 3;

export type ScenarioId = 'M01' | 'M02' | 'M03' | 'M04' | 'M05' | 'FREE';

function emptyState(scenario: ScenarioId, seed: number): SimState {
  const s: SimState = {
    version: STATE_VERSION,
    scenario,
    mode: scenario === 'FREE' ? 'FREE' : 'TRAINING',
    t: 0,
    speed: 1,
    paused: true,
    rng: seed >>> 0,
    user: 'SYSTEM',
    quants: {},
    batches: {},
    binLocks: {},
    docs: {},
    seq: {},
    machines: {},
    forklifts: {},
    employees: {},
    events: [],
    audit: [],
    stats: {
      txOk: 0,
      txFailed: 0,
      reversals: 0,
      goodOutput: 0,
      scrapOutput: 0,
      deliveriesOnTime: 0,
      deliveriesLate: 0,
      penalties: 0,
      complaints: 0,
      maintenanceCost: 0,
      transportCost: 0,
      materialCost: 0,
      conversionCost: 0,
      revenue: 0,
      outputByHour: [],
      oeeByHour: [],
      inventoryValueByHour: [],
      mistakes: [],
      snap: { good: 0, scrap: 0, run: 0, down: 0, setup: 0, perf: 0 },
    },
    nextEventAt: 180,
    eventsEnabled: scenario === 'FREE',
    lastHour: 0,
  };
  for (const d of MACHINES) {
    s.machines[d.id] = { id: d.id, status: 'IDLE', health: 86 + ((seed + d.id.length * 7 + d.pos[0]) % 12), runMin: 0, idleMin: 0, downMin: 0, setupMin: 0, goodCount: 0, scrapCount: 0, lastPmAt: -2000, perfMin: 0, setupLeft: 0, frac: 0 };
  }
  for (const [id, home] of Object.entries(FORKLIFT_HOMES)) s.forklifts[id] = { id, home, driver: '' };
  for (const e of makeEmployees()) s.employees[e.id] = { ...e };
  const wh = Object.values(s.employees).filter((e) => e.role === 'WAREHOUSE');
  Object.values(s.forklifts).forEach((f, i) => (f.driver = wh[i % wh.length]?.name ?? 'Driver'));
  return s;
}

function stock(s: SimState, material: string, bin: string, qty: number, ageMin = 600) {
  const batch = newBatchId(s, 'I');
  s.batches[batch] = { id: batch, material, origin: 'INITIAL', createdAt: -ageMin, status: 'RELEASED' };
  const q = addQuant(s, material, bin, batch, qty, 'UNR');
  q.createdAt = -ageMin;
  return q;
}

function baseStock(s: SimState, lowSteel: boolean) {
  stock(s, 'RM-S355', 'WH02-S-01', lowSteel ? 600 : 4000, 2000);
  if (!lowSteel) stock(s, 'RM-S355', 'WH02-S-02', 3000, 1500);
  stock(s, 'RM-22MNB5', 'WH02-S-07', 4000, 1800);
  stock(s, 'RM-WIRE', 'WH01-A-01-1', 500, 1600);
  stock(s, 'RM-KTL', 'WH01-A-02-1', 2000, 1600);
  stock(s, 'RM-NUT', 'WH01-A-03-1', 40000, 3000);
  stock(s, 'RM-TUBE', 'WH01-B-01-1', 120, 2500);
  stock(s, 'SP-HYD-SEAL', 'WH04-M-01-1', 3);
  stock(s, 'SP-WELD-TIP', 'WH04-M-01-2', 24);
  stock(s, 'SP-LASER-NOZ', 'WH04-M-02-1', 6);
  stock(s, 'SP-SERVO', 'WH04-M-02-2', 1);
  stock(s, 'SP-BELT', 'WH04-M-03-1', 2);
  stock(s, 'SP-THERMO', 'WH04-M-03-2', 4);
  stock(s, 'FG-BR-2207', 'WH03-C-01-1', 400, 900);
  stock(s, 'FG-SR-7130', 'WH03-C-02-1', 120, 900);
}

function salesOrder(s: SimState, customer: string, material: string, qty: number, due: number, priority: 'NORMAL' | 'URGENT' = 'NORMAL', price = 0) {
  return addDoc<SalesOrder>(s, {
    ...baseDoc(s, 'SO', 'RELEASED'),
    type: 'SO',
    customer,
    items: [{ material, qty, price: price || 0, delivered: 0 }],
    due,
    priority,
    penaltyPerHour: priority === 'URGENT' ? 900 : 350,
  });
}

/** PO whose truck is already standing at the inbound dock. */
function arrivedPO(s: SimState, supplier: string, material: string, qty: number, price: number, actualQty = qty) {
  const po = addDoc<PurchaseOrder>(s, { ...baseDoc(s, 'PO', 'RELEASED'), type: 'PO', supplier, items: [{ material, qty, price, received: 0 }], eta: s.t, originalEta: s.t, delivered: false });
  po.createdAt = s.t - 480;
  po.history[0].t = s.t - 480;
  const ibd = addDoc<InboundDelivery>(s, {
    ...baseDoc(s, 'IBD', 'IN_PROGRESS'),
    type: 'IBD',
    po: po.id,
    supplier,
    items: [{ material, qty, actualQty, batch: newBatchId(s, 'S') }],
    eta: s.t,
    arrivedAt: s.t,
    dock: 0,
    carrierPlate: 'SK 4R719',
  });
  ibd.history.push({ t: s.t, user: 'SYSTEM', action: 'Truck arrived', detail: 'Inbound door 1' });
  po.refs.push(ibd.id);
  ibd.refs.push(po.id);
  return { po, ibd };
}

export function createScenario(id: ScenarioId, user: string, seed = 20261118): SimState {
  const s = emptyState(id, seed);
  switch (id) {
    case 'M01': {
      baseStock(s, true);
      arrivedPO(s, 'SUP-1001', 'RM-S355', 2000, 0.98);
      salesOrder(s, 'C-2001', 'FG-CM-4410', 450, 32 * 60, 'NORMAL', 48.5);
      for (const m of Object.values(s.machines)) m.health = Math.max(m.health, 90);
      break;
    }
    case 'M02': {
      baseStock(s, false);
      createProductionOrder(s, 'FG-BR-2207', 1200, {});
      const pp = Object.values(s.docs).find((d) => d.type === 'PP')!;
      releaseOrder(s, pp.id);
      stageComponents(s, pp.id);
      for (const m of Object.values(s.machines)) m.health = Math.max(m.health, 88);
      // PRESS-02 carries the progressive die for BR-2207
      s.machines['PRESS-01'].health = 72;
      s.machines['PRESS-02'].health = 93;
      advance(s, 45);
      salesOrder(s, 'C-2002', 'FG-BR-2207', 1400, 20 * 60, 'NORMAL', 9.8);
      break;
    }
    case 'M03': {
      baseStock(s, false);
      // 22MnB5 is low — the incoming batch matters
      for (const q of Object.values(s.quants)) if (q.material === 'RM-22MNB5') q.qty = q.physical = 900;
      arrivedPO(s, 'SUP-1001', 'RM-22MNB5', 2000, 1.42);
      break;
    }
    case 'M04': {
      baseStock(s, false);
      salesOrder(s, 'C-2004', 'FG-SR-7130', 300, 16 * 60, 'URGENT', 29.6);
      break;
    }
    case 'M05': {
      baseStock(s, false);
      // the bundle in S-01 was damaged weeks ago, the book stock was never corrected
      const q = Object.values(s.quants).find((x) => x.bin === 'WH02-S-01')!;
      q.physical = 3400;
      createProductionOrder(s, 'FG-CM-4410', 1200, {});
      break;
    }
    case 'FREE': {
      baseStock(s, false);
      salesOrder(s, 'C-2001', 'FG-CM-4410', 600, 26 * 60, 'NORMAL', 48.5);
      salesOrder(s, 'C-2003', 'FG-BR-2207', 800, 12 * 60, 'NORMAL', 9.8);
      salesOrder(s, 'C-2005', 'FG-AXH-900', 40, 44 * 60, 'NORMAL', 142);
      salesOrder(s, 'C-2004', 'FG-SR-7130', 240, 34 * 60, 'NORMAL', 27.4);
      createPO(s, { material: 'RM-S355', qty: 4000, supplier: 'SUP-1002' });
      createPO(s, { material: 'RM-WIRE', qty: 250, supplier: 'SUP-1003' });
      createProductionOrder(s, 'FG-BR-2207', 600, { autoConfirm: true });
      const pp = Object.values(s.docs).find((d) => d.type === 'PP')!;
      releaseOrder(s, pp.id);
      stageComponents(s, pp.id);
      advance(s, 30);
      s.machines['WELD-02'].health = 41;
      s.machines['PRESS-01'].health = 58;
      break;
    }
  }
  // reset counters touched by set-up postings
  s.stats.txOk = 0;
  s.stats.txFailed = 0;
  s.stats.mistakes = [];
  s.audit = [];
  s.events = [];
  hourlySnapshot(s, Math.floor(s.t / 60));
  s.stats.outputByHour = [];
  s.stats.oeeByHour = [];
  s.user = user;
  return s;
}
