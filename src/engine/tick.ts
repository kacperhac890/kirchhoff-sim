// The simulation clock. advance() moves time forward in ≤1 minute steps and
// updates machines, operations, forklifts, trucks, maintenance and events.
import { MACHINES, machineDef, INBOUND_DOORS } from './layout';
import { CUSTOMERS, MATERIALS, PRODUCTS } from './master';
import { addDoc, baseDoc, chance, getDoc, hist, randInt, round, shiftOf, fmtTime, fmtQty, docsOf } from './core';
import type { MachineState, ProductionOrder, QualityNotification, SimEvent, SimState, WarehouseTask } from './types';
import { executeWT } from './inventory';
import { confirmOperation, startOperation } from './production';
import { triggerBreakdown } from './maintenance';
import { pushEvent, maybeRandomEvent } from './events';
import { hourlySnapshot } from './kpi';

const FORKLIFT_PRIORITY: Record<string, number> = { STAGING: 0, PICK: 1, FG_PUTAWAY: 2, PUTAWAY: 3, TRANSFER: 4, SPARE: 5 };

export function advance(s: SimState, dtMin: number) {
  let left = dtMin;
  while (left > 1e-9) {
    const step = Math.min(1, left);
    stepSim(s, step);
    left -= step;
  }
}

function stepSim(s: SimState, dt: number) {
  const prevHour = Math.floor(s.t / 60);
  s.t = round(s.t + dt, 6);
  assignOperators(s);
  runOrders(s, dt);
  runMachines(s, dt);
  runForklifts(s);
  runInbound(s);
  runShipments(s);
  runMaintenance(s);
  runDeadlines(s);
  maybeRandomEvent(s);
  const hour = Math.floor(s.t / 60);
  if (hour !== prevHour) hourlySnapshot(s, hour);
}

// ------------------------------------------------------------------ staffing
function assignOperators(s: SimState) {
  const shift = shiftOf(s.t);
  const free = Object.values(s.employees)
    .filter((e) => e.role === 'OPERATOR' && e.shift === shift && !((e.absentUntil ?? -1) > s.t))
    .map((e) => e.id);
  // machines that need someone: active op or setup; urgent orders first
  const need = MACHINES.map((d) => s.machines[d.id])
    .filter((m) => m.order && !m.failure && !m.maintOrder)
    .sort((a, b) => prio(s, b) - prio(s, a));
  for (const m of Object.values(s.machines)) m.operator = undefined;
  for (const m of need) m.operator = free.shift();
}
function prio(s: SimState, m: MachineState) {
  const pp = getDoc(s, m.order, 'PP');
  return pp?.priority === 'URGENT' ? 2 : 1;
}

// ------------------------------------------------------------------ orders
function runOrders(s: SimState, _dt: number) {
  void _dt;
  const orders = docsOf(s, 'PP')
    .filter((p) => (p.status === 'RELEASED' || p.status === 'IN_PROGRESS'))
    .sort((a, b) => (a.priority === b.priority ? a.plannedStart - b.plannedStart : a.priority === 'URGENT' ? -1 : 1));
  for (const pp of orders) {
    if (!pp.stagingDone) {
      pp.stagingDone = pp.components.every((c) => c.staged + c.issued >= c.required - 1e-6);
      if (!pp.stagingDone) {
        const transit = Object.values(s.docs).some((d) => d.type === 'WT' && d.ref === pp.id && d.kind === 'STAGING' && (d.status === 'CREATED' || d.status === 'IN_PROGRESS'));
        pp.waitingReason = transit ? 'Material staging in progress' : 'Waiting for material staging';
        continue;
      }
      hist(s, pp, 'Staging complete', 'All components at the production supply areas');
    }
    if (pp.plannedStart > s.t) {
      pp.waitingReason = `Scheduled start ${fmtTime(pp.plannedStart)}`;
      continue;
    }
    const idx = pp.ops.findIndex((o) => o.status !== 'CONFIRMED');
    if (idx < 0) {
      pp.waitingReason = 'Ready for goods receipt';
      continue;
    }
    const op = pp.ops[idx];
    if (op.status === 'WAITING') {
      if (idx > 0 && pp.ops[idx - 1].status !== 'CONFIRMED') continue;
      if (op.qtyIn <= 0) {
        // everything scrapped upstream
        op.status = 'DONE';
        continue;
      }
      const candidates = MACHINES.filter((d) => d.group === op.wcGroup).map((d) => s.machines[d.id]);
      const freeM = candidates.filter((m) => !m.order && !m.failure && !m.maintOrder).sort((a, b) => b.health - a.health)[0];
      if (!freeM) {
        const down = candidates.every((m) => m.failure || m.maintOrder);
        pp.waitingReason = down ? `All ${op.wcGroup} machines are down or in maintenance` : `Waiting for a free ${op.wcGroup} machine`;
        continue;
      }
      startOperation(s, pp, op, freeM.id);
      pp.waitingReason = undefined;
    } else if (op.status === 'DONE') {
      if (pp.autoConfirm && !op.inspectionLot) {
        const prev = s.user;
        s.user = 'AUTO-CONF';
        confirmOperation(s, pp.id, op.no, op.produced - op.scrap, op.scrap, true);
        s.user = prev;
      } else {
        pp.waitingReason = op.inspectionLot && !getDoc(s, op.inspectionLot, 'IL')?.decision ? `Inspection lot ${op.inspectionLot} awaits usage decision` : `Operation ${op.no} awaits confirmation`;
      }
    } else {
      pp.waitingReason = undefined;
    }
  }
}

// ------------------------------------------------------------------ machines
function runMachines(s: SimState, dt: number) {
  const shiftFactor = [1, 1, 0.97, 0.9][shiftOf(s.t)];
  for (const def of MACHINES) {
    const m = s.machines[def.id];
    if (m.maintOrder) {
      m.status = 'MAINT';
      m.downMin += dt;
      continue;
    }
    if (m.failure) {
      m.status = 'STOPPED';
      m.downMin += dt;
      const pp = getDoc(s, m.order, 'PP');
      const op = pp?.ops.find((o) => o.no === m.op);
      if (op && (op.status === 'RUNNING' || op.status === 'SETUP')) op.status = 'PAUSED';
      continue;
    }
    const pp = getDoc(s, m.order, 'PP');
    const op = pp?.ops.find((o) => o.no === m.op);
    if (!pp || !op || op.status === 'DONE' || op.status === 'CONFIRMED') {
      if (pp && op && (op.status === 'DONE' || op.status === 'CONFIRMED')) {
        m.order = undefined;
        m.op = undefined;
      }
      m.status = 'IDLE';
      m.notice = undefined;
      m.idleMin += dt;
      continue;
    }
    if (op.status === 'PAUSED') op.status = m.setupLeft > 0 ? 'SETUP' : 'RUNNING';
    if (!m.operator) {
      m.status = 'WARNING';
      m.notice = 'No operator available on this shift';
      op.actualMin += dt;
      m.idleMin += dt;
      continue;
    }
    op.actualMin += dt;
    if (m.setupLeft > 0) {
      m.status = 'SETUP';
      m.notice = `Die / program change for ${pp.id}`;
      m.setupLeft = Math.max(0, m.setupLeft - dt);
      m.setupMin += dt;
      op.status = 'SETUP';
      continue;
    }
    op.status = 'RUNNING';
    const perf = shiftFactor * (0.82 + 0.18 * Math.min(1, m.health / 70));
    m.frac += ((dt * 60) / op.cycleSec) * perf;
    m.runMin += dt;
    m.perfMin += dt * perf;
    m.health = Math.max(0, m.health - (def.wearPerHour / 60) * dt);
    const drift = (m.defectBoostUntil ?? -1) > s.t;
    const baseScrap = (machineScrapRate(pp, op.no) + (m.health < 40 ? 0.01 : 0)) * (drift ? 3 : 1);
    while (m.frac >= 1 && op.produced < op.qtyIn) {
      m.frac -= 1;
      op.produced++;
      if (chance(s, baseScrap)) {
        op.scrap++;
        m.scrapCount++;
        s.stats.scrapOutput++;
      } else m.goodCount++;
    }
    m.status = m.health < 35 || drift ? 'WARNING' : 'RUNNING';
    m.notice = m.health < 35 ? 'Wear limit reached — schedule maintenance' : drift ? 'SPC alarm: process drifting' : undefined;
    if (op.produced >= op.qtyIn) {
      op.status = 'DONE';
      op.finishedAt = s.t;
      m.order = undefined;
      m.op = undefined;
      m.frac = 0;
      hist(s, pp, `Operation ${op.no} finished on ${def.id}`, `${op.produced - op.scrap} good, ${op.scrap} scrap`);
    }
    // breakdown hazard grows with wear
    if (s.eventsEnabled) {
      const hazard = 0.00012 * (1 + ((100 - m.health) / 25) ** 2) * dt;
      if (chance(s, hazard)) {
        const n = triggerBreakdown(s, def.id);
        if (n) breakdownEvent(s, def.id, n.id);
      }
    }
  }
}

function machineScrapRate(pp: ProductionOrder, opNo: string) {
  const r = PRODUCT_SCRAP[pp.product]?.[opNo];
  return r ?? 0.004;
}
const PRODUCT_SCRAP: Record<string, Record<string, number>> = Object.fromEntries(
  Object.values(PRODUCTS).map((p) => [p.id, Object.fromEntries(p.routing.map((r) => [r.no, r.scrapRate]))]),
);

export function breakdownEvent(s: SimState, machine: string, notif: string) {
  const def = machineDef(machine);
  const m = s.machines[machine];
  pushEvent(s, {
    kind: 'BREAKDOWN',
    title: `${machine} stopped — ${m.failure?.text}`,
    body: `${def.name} reported a breakdown. Notification ${notif} was created automatically.${m.order ? ` Order ${m.order} is interrupted.` : ''}`,
    severity: 'critical',
    refs: [machine, notif, ...(m.order ? [m.order] : [])],
    advice: 'Create a PM01 maintenance order (IW31), assign a technician with the right skill, withdraw the spare part, then confirm the repair (IW41).',
  });
}

// ------------------------------------------------------------------ forklifts / warehouse tasks
function runForklifts(s: SimState) {
  // finish running tasks
  for (const f of Object.values(s.forklifts)) {
    if (!f.task) continue;
    const wt = s.docs[f.task] as WarehouseTask | undefined;
    if (!wt || wt.status !== 'IN_PROGRESS') {
      f.task = undefined;
      continue;
    }
    if (s.t >= (wt.startedAt ?? s.t) + wt.durationMin) {
      executeWT(s, wt);
      onWtDone(s, wt);
      f.task = undefined;
    }
  }
  // dispatch open tasks to idle forklifts
  const open = docsOf(s, 'WT')
    .filter((w) => w.status === 'CREATED')
    .sort((a, b) => FORKLIFT_PRIORITY[a.kind] - FORKLIFT_PRIORITY[b.kind] || a.createdAt - b.createdAt);
  if (!open.length) return;
  const idle = Object.values(s.forklifts).filter((f) => !f.task);
  for (const wt of open) {
    const f = idle.shift();
    if (!f) break;
    const q = s.quants[wt.quant];
    if (!q) {
      wt.status = 'CANCELLED';
      continue;
    }
    // the operator arrives at the bin and finds less than the system says
    const fromStorage = wt.kind === 'STAGING' || wt.kind === 'PICK' || wt.kind === 'TRANSFER';
    if (fromStorage && q.physical + 1e-6 < wt.qty) {
      wt.status = 'CANCELLED';
      hist(s, wt, 'Cancelled — pick shortage', `Found ${fmtQty(q.physical)} instead of ${fmtQty(wt.qty)}`);
      onPickShortage(s, wt, q.physical);
      continue;
    }
    wt.status = 'IN_PROGRESS';
    wt.startedAt = s.t;
    wt.forklift = f.id;
    f.task = wt.id;
    hist(s, wt, 'Started', `Forklift ${f.id}`);
  }
}

function onPickShortage(s: SimState, wt: WarehouseTask, found: number) {
  const m = MATERIALS[wt.material];
  pushEvent(s, {
    kind: 'PICK_SHORTAGE',
    title: `Pick shortage in ${wt.fromBin}`,
    body: `Warehouse task ${wt.id} needs ${fmtQty(wt.qty, m.uom)} of ${m.name}, but only ${fmtQty(found, m.uom)} were physically found in ${wt.fromBin}. The book stock is wrong.`,
    severity: 'critical',
    refs: [wt.fromBin, wt.id, ...(wt.ref ? [wt.ref] : [])],
    advice: 'Run a physical inventory on the bin (MI01 → count → post differences). Then re-check availability (CO02) and stage again.',
  });
  s.stats.mistakes.push({ t: s.t, code: 'BOOK_PHYS', text: `Book stock in ${wt.fromBin} did not match the shelf — line supply was interrupted.`, fix: 'Count deliveries before posting the goods receipt and post exactly what was counted.' });
}

function onWtDone(s: SimState, wt: WarehouseTask) {
  if (wt.kind === 'STAGING') {
    const pp = getDoc(s, wt.ref, 'PP');
    const c = pp?.components.find((x) => x.material === wt.material);
    if (c) c.staged = round(c.staged + wt.qty);
  }
  if (wt.kind === 'PICK') {
    const dlv = getDoc(s, wt.ref, 'DLV');
    if (dlv) {
      const it = dlv.items.find((i) => i.material === wt.material);
      if (it) it.picked = round(it.picked + wt.qty);
      const allDone = dlv.items.every((i) => i.picked >= i.qty - 1e-6);
      if (allDone) {
        dlv.pickStatus = 'DONE';
        hist(s, dlv, 'Picking complete', `Goods staged at dock ${dlv.dock + 1}`);
      }
    }
  }
}

// ------------------------------------------------------------------ trucks inbound
function runInbound(s: SimState) {
  for (const ibd of docsOf(s, 'IBD')) {
    if (ibd.status === 'CANCELLED') continue;
    if ((ibd.arrivedAt === undefined) && ibd.plannedDelay && !ibd.delayAnnounced && s.t >= ibd.eta - 120) {
      ibd.delayAnnounced = true;
      ibd.eta += ibd.plannedDelay;
      const po = getDoc(s, ibd.po, 'PO');
      if (po) {
        po.eta = ibd.eta;
        hist(s, po, 'Supplier delay announced', `New ETA ${fmtTime(ibd.eta)}`);
      }
      pushEvent(s, {
        kind: 'SUPPLIER_DELAY',
        title: `Supplier delay: delivery ${ibd.id} late by ${Math.round(ibd.plannedDelay / 60)} h`,
        body: `${ibd.items.map((i) => `${fmtQty(i.qty, MATERIALS[i.material].uom)} ${MATERIALS[i.material].name}`).join(', ')} will now arrive at ${fmtTime(ibd.eta)}.`,
        severity: 'warning',
        refs: [ibd.id, ibd.po],
        advice: 'Check which production orders depend on this material (MRP / stock overview). If an order is at risk, order from an alternative source or re-sequence production.',
      });
    }
    if ((ibd.arrivedAt === undefined) && s.t >= ibd.eta) {
      const busy = new Set(docsOf(s, 'IBD').filter((d) => d.arrivedAt !== undefined && !(d.departAt !== undefined && s.t >= d.departAt)).map((d) => d.dock));
      const door = INBOUND_DOORS.findIndex((_, i) => !busy.has(i));
      if (door < 0) continue; // yard waiting
      ibd.arrivedAt = s.t;
      ibd.dock = door;
      ibd.status = 'IN_PROGRESS';
      hist(s, ibd, 'Truck arrived', `Inbound door ${door + 1}, truck ${ibd.carrierPlate}`);
      pushEvent(s, {
        kind: 'INFO',
        title: `Truck at inbound door ${door + 1}`,
        body: `Delivery ${ibd.id} (PO ${ibd.po}) has arrived: ${ibd.items.map((i) => `${fmtQty(i.qty, MATERIALS[i.material].uom)} ${MATERIALS[i.material].name}`).join(', ')}.`,
        severity: 'info',
        refs: [ibd.id, ibd.po],
        advice: 'Count the goods, then post the goods receipt (MIGO, movement 101) and assign storage bins.',
      });
    }
  }
}

// ------------------------------------------------------------------ trucks outbound
function runShipments(s: SimState) {
  for (const shp of docsOf(s, 'SHP')) {
    if (shp.status === 'COMPLETED' || shp.status === 'CANCELLED') continue;
    const arrival = shp.plannedLoad + shp.lateBy;
    if ((shp.arrivedAt === undefined) && shp.lateBy > 0 && s.t >= shp.plannedLoad && !shp.history.some((h) => h.action === 'Carrier delay')) {
      hist(s, shp, 'Carrier delay', `Truck late by ${shp.lateBy} min`);
      pushEvent(s, {
        kind: 'TRUCK_LATE',
        title: `Truck for shipment ${shp.id} is late`,
        body: `The carrier reports a delay of about ${Math.round(shp.lateBy)} min. Loading at dock ${shp.dock + 1} will start later.`,
        severity: 'warning',
        refs: [shp.id, ...shp.deliveries],
        advice: 'Inform the customer if the delivery date is at risk. Carrier reliability matters when you choose the next carrier.',
      });
    }
    if ((shp.arrivedAt === undefined) && s.t >= arrival) {
      shp.arrivedAt = s.t;
      hist(s, shp, 'Truck at dock', `Dock ${shp.dock + 1}`);
    }
    if (shp.arrivedAt !== undefined && shp.loadedAt === undefined) {
      const ready = shp.deliveries.every((id) => {
        const d = getDoc(s, id, 'DLV');
        return d && d.pickStatus === 'DONE' && d.packed;
      });
      const start = shp.loadingStart;
      if (ready && start === undefined) {
        shp.loadingStart = s.t;
        hist(s, shp, 'Loading started');
      }
      if (shp.loadingStart !== undefined && s.t >= shp.loadingStart + 30) {
        shp.loadedAt = s.t;
        hist(s, shp, 'Loading complete', 'Ready for goods issue');
        pushEvent(s, {
          kind: 'INFO',
          title: `Shipment ${shp.id} loaded`,
          body: `The truck at dock ${shp.dock + 1} is loaded. Post goods issue to release it.`,
          severity: 'info',
          refs: [shp.id, ...shp.deliveries],
          advice: 'Post goods issue (VL02N) for the delivery. Stock leaves the plant and the truck departs.',
        });
      }
    }
    if (shp.departedAt !== undefined && shp.eta !== undefined && (shp.deliveredAt === undefined) && s.t >= shp.eta) {
      shp.deliveredAt = s.t;
      shp.status = 'COMPLETED';
      const dlv = getDoc(s, shp.deliveries[0], 'DLV');
      const so = getDoc(s, dlv?.salesOrder, 'SO');
      if (so) {
        const lateMin = s.t - so.due;
        if (lateMin > 0) {
          s.stats.deliveriesLate++;
          const pen = Math.round((lateMin / 60) * so.penaltyPerHour);
          s.stats.penalties += pen;
          hist(s, so, 'Delivered late', `${Math.round(lateMin)} min late, penalty €${pen}`);
          pushEvent(s, { kind: 'DEADLINE', title: `Late delivery to ${CUSTOMERS[so.customer].name}`, body: `Shipment ${shp.id} arrived ${Math.round(lateMin)} min after the requested date. Contract penalty: €${pen}.`, severity: 'warning', refs: [so.id, shp.id], advice: 'Plan production backwards from the customer date and leave buffer for transport and loading.' });
        } else {
          s.stats.deliveriesOnTime++;
          hist(s, so, 'Delivered on time', shp.id);
        }
      }
      hist(s, shp, 'Delivered', 'Proof of delivery received');
      // latent defects come back as customer complaints
      if (dlv) {
        for (const it of dlv.items) {
          for (const p of it.picks) {
            const b = s.batches[p.batch];
            if (b?.latentDefect && !b.complaintAt) b.complaintAt = s.t + 180 + randInt(s, 0, 240);
          }
        }
      }
    }
  }
  for (const b of Object.values(s.batches)) {
    if (b.complaintAt && !b.complained && s.t >= b.complaintAt) {
      b.complained = true;
      const prev = s.user;
      s.user = 'CUSTOMER';
      const cost = 4500 + randInt(s, 0, 3000);
      const qn = addDoc<QualityNotification>(s, { ...baseDoc(s, 'QN'), type: 'QN', kind: 'Q1', material: b.material, batch: b.id, defect: 'Customer complaint: dimensional / coating nonconformity found at assembly line', qty: 0, cost });
      s.user = prev;
      s.stats.complaints++;
      s.stats.penalties += cost;
      pushEvent(s, {
        kind: 'COMPLAINT',
        title: `Customer complaint on batch ${b.id}`,
        body: `${MATERIALS[b.material].name} from batch ${b.id} failed at the customer's assembly line. Claim cost €${cost.toLocaleString('en-US')}. This batch passed inspection with out-of-tolerance results.`,
        severity: 'critical',
        refs: [qn.id, b.id],
        advice: 'Block the remaining stock of the batch (QA_BLOCK), process the Q1 notification (8D: containment, root cause, corrective action). Never accept lots whose valuation shows rejected characteristics.',
      });
    }
  }
}

// ------------------------------------------------------------------ maintenance
function runMaintenance(s: SimState) {
  for (const mo of docsOf(s, 'MO')) {
    if (mo.status !== 'IN_PROGRESS' || mo.workDoneAt !== undefined) continue;
    if (s.t >= (mo.startedAt ?? s.t) + mo.durationMin) {
      mo.workDoneAt = s.t;
      hist(s, mo, 'Work finished by technician', 'Awaiting confirmation (IW41)');
      pushEvent(s, {
        kind: 'INFO',
        title: `${mo.machine}: maintenance work finished`,
        body: `Order ${mo.id} — the technician has finished. Confirm the order to hand the machine back to production.`,
        severity: 'success',
        refs: [mo.id, mo.machine],
        advice: 'Confirm the maintenance order (IW41). Until then the machine stays locked for production.',
      });
    }
  }
}

// ------------------------------------------------------------------ deadlines
function runDeadlines(s: SimState) {
  for (const so of docsOf(s, 'SO')) {
    if (so.status === 'COMPLETED' || so.status === 'CANCELLED') continue;
    const shipped = Object.values(s.docs).some((d) => d.type === 'DLV' && d.salesOrder === so.id && d.pgi);
    if (!so.warned && s.t >= so.due - 240 && !shipped) {
      so.warned = true;
      pushEvent(s, {
        kind: 'DEADLINE',
        title: `4 h to delivery date — sales order ${so.id}`,
        body: `${CUSTOMERS[so.customer].name} expects ${so.items[0].qty} × ${MATERIALS[so.items[0].material].name} at ${fmtTime(so.due)}. Transit takes ${CUSTOMERS[so.customer].transitHours} h.`,
        severity: 'warning',
        refs: [so.id],
        advice: 'Check finished goods stock and the production order. Create the delivery, pick, pack, plan the truck and post goods issue in time.',
      });
    }
    if (!so.overdueWarned && s.t >= so.due) {
      so.overdueWarned = true;
      pushEvent(s, {
        kind: 'DEADLINE',
        title: `Sales order ${so.id} is overdue`,
        body: `The requested delivery date has passed. A penalty of €${so.penaltyPerHour}/h applies from now until delivery.`,
        severity: 'critical',
        refs: [so.id],
        advice: 'Ship as soon as possible — expedite production and choose a fast, reliable carrier.',
      });
    }
  }
}

export type { SimEvent };
