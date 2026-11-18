// Industrial events: notifications for the player and random disruptions
// in free simulation mode.
import { BINS, MACHINES } from './layout';
import { CUSTOMERS, MATERIALS } from './master';
import { addDoc, baseDoc, fmtQty, fmtTime, pick, rand, randInt, shiftOf, STORAGE_TYPES } from './core';
import type { SalesOrder, SimEvent, SimState } from './types';
import { triggerBreakdown } from './maintenance';
import { breakdownEvent } from './tick';

export function pushEvent(s: SimState, e: Omit<SimEvent, 'id' | 't' | 'read' | 'resolved'>) {
  const id = `EV${(s.seq['EV'] = (s.seq['EV'] ?? 0) + 1)}`;
  const ev: SimEvent = { ...e, id, t: s.t, read: false, resolved: false };
  s.events.unshift(ev);
  if (s.events.length > 250) s.events.length = 250;
  return ev;
}

type Gen = { w: number; run: (s: SimState) => boolean };

const GENERATORS: Gen[] = [
  {
    w: 3,
    run: (s) => {
      // demand spike — urgent order from an OEM
      const fg = pick(s, ['FG-CM-4410', 'FG-BR-2207', 'FG-SR-7130']);
      const cust = pick(s, Object.keys(CUSTOMERS));
      const qty = fg === 'FG-BR-2207' ? randInt(s, 4, 10) * 100 : randInt(s, 4, 9) * 40;
      const due = s.t + randInt(s, 14, 26) * 60;
      const prev = s.user;
      s.user = 'EDI';
      const so = addDoc<SalesOrder>(s, { ...baseDoc(s, 'SO', 'RELEASED'), type: 'SO', customer: cust, items: [{ material: fg, qty, price: MATERIALS[fg].price * 1.08, delivered: 0 }], due, priority: 'URGENT', penaltyPerHour: 900 });
      s.user = prev;
      pushEvent(s, {
        kind: 'DEMAND',
        title: `Urgent call-off from ${CUSTOMERS[cust].name}`,
        body: `EDI order ${so.id}: ${qty} × ${MATERIALS[fg].name}, due ${fmtTime(due)} (${Math.round((due - s.t) / 60)} h). Late delivery costs €900/h.`,
        severity: 'warning',
        refs: [so.id],
        advice: 'Check finished goods stock. If it is not enough, create and release an URGENT production order (CO01) — urgent orders get machines and operators first.',
      });
      return true;
    },
  },
  {
    w: 2,
    run: (s) => {
      const candidates = MACHINES.filter((d) => s.machines[d.id].order && !s.machines[d.id].failure && !s.machines[d.id].maintOrder);
      if (!candidates.length) return false;
      const d = pick(s, candidates);
      const n = triggerBreakdown(s, d.id);
      if (!n) return false;
      breakdownEvent(s, d.id, n.id);
      return true;
    },
  },
  {
    w: 2,
    run: (s) => {
      const d = pick(s, MACHINES.filter((m) => m.group !== 'QC'));
      const m = s.machines[d.id];
      m.defectBoostUntil = s.t + 300;
      pushEvent(s, {
        kind: 'QUALITY_DRIFT',
        title: `SPC alarm on ${d.id}`,
        body: `${d.name}: three consecutive measurements trend towards the tolerance limit (tool wear suspected). Defect risk is elevated for the next 5 hours.`,
        severity: 'warning',
        refs: [d.id],
        advice: 'Schedule preventive maintenance (PM02) on the machine and check the next inspection lots carefully. Reject or sort lots with out-of-tolerance results.',
      });
      return true;
    },
  },
  {
    w: 1.5,
    run: (s) => {
      // capacity: rack bays locked after impact damage
      const rackBins = BINS.filter((b) => b.type === 'FGRACK' || b.type === 'RACK');
      const bin = pick(s, rackBins);
      const bay = bin.id.split('-').slice(0, 3).join('-');
      const locked = rackBins.filter((b) => b.id.startsWith(bay)).map((b) => b.id);
      for (const id of locked) s.binLocks[id] = s.t + 360;
      pushEvent(s, {
        kind: 'CAPACITY',
        title: `Rack bay ${bay} locked`,
        body: `A forklift hit an upright in ${bay}. ${locked.length} bins are locked for inspection for 6 h. Stock inside stays booked but no new put-aways are possible.`,
        severity: 'warning',
        refs: locked,
        advice: 'Choose other bins for put-away. Watch warehouse capacity in the stock overview before posting goods receipts.',
      });
      return true;
    },
  },
  {
    w: 1.5,
    run: (s) => {
      // hidden damage — physical stock lower than book stock
      const qs = Object.values(s.quants).filter((q) => STORAGE_TYPES.has(BINS.find((b) => b.id === q.bin)?.type ?? '') && q.qty > 50 && MATERIALS[q.material].type === 'RAW');
      if (!qs.length) return false;
      const q = pick(s, qs);
      const loss = Math.round(q.physical * (randInt(s, 4, 10) / 100));
      q.physical = Math.max(0, q.physical - loss);
      pushEvent(s, {
        kind: 'SHORTAGE',
        title: `Damaged material reported in ${q.bin}`,
        body: `The night shift reports damaged ${MATERIALS[q.material].name} in ${q.bin} (approx. ${fmtQty(loss, MATERIALS[q.material].uom)}). The book stock has not been corrected.`,
        severity: 'warning',
        refs: [q.bin],
        advice: 'Run a physical inventory on the bin (MI01) and post the difference (702) before the material is staged for production.',
      });
      return true;
    },
  },
  {
    w: 1,
    run: (s) => {
      const shift = shiftOf(s.t);
      const ops = Object.values(s.employees).filter((e) => e.role === 'OPERATOR' && e.shift === shift && !((e.absentUntil ?? -1) > s.t));
      if (ops.length < 4) return false;
      const n = randInt(s, 2, 3);
      const end = s.t + 480;
      for (let i = 0; i < n; i++) ops[i].absentUntil = end;
      pushEvent(s, {
        kind: 'ABSENCE',
        title: `${n} operators absent on this shift`,
        body: `Sick leave reported. ${ops.length - n} operators are available for ${MACHINES.length} machines. Machines without an operator stop (yellow).`,
        severity: 'info',
        refs: [],
        advice: 'Urgent production orders get operators first. Consider moving non-urgent orders to the next shift.',
      });
      return true;
    },
  },
];

export function maybeRandomEvent(s: SimState) {
  if (!s.eventsEnabled) return;
  if (s.t < s.nextEventAt) return;
  const total = GENERATORS.reduce((a, g) => a + g.w, 0);
  for (let attempt = 0; attempt < 4; attempt++) {
    let r = rand(s) * total;
    for (const g of GENERATORS) {
      r -= g.w;
      if (r <= 0) {
        if (g.run(s)) {
          s.nextEventAt = s.t + randInt(s, 150, 330);
          return;
        }
        break;
      }
    }
  }
  s.nextEventAt = s.t + 60;
}

export function unreadCount(s: SimState) {
  return s.events.filter((e) => !e.read).length;
}

