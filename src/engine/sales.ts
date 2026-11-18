// SD / TM: sales orders, outbound deliveries, picking, packing,
// shipments, goods issue and delivery tracking.
import { CARRIERS, CUSTOMERS, MATERIALS } from './master';
import { OUTBOUND_DOORS } from './layout';
import {
  addDoc,
  availableQty,
  baseDoc,
  BIN_MAP_TYPES,
  chance,
  cleanupQuant,
  fail,
  fmtEur,
  fmtQty,
  getDoc,
  hist,
  link,
  ok,
  randInt,
  round,
} from './core';
import type { OutboundDelivery, SalesOrder, Shipment, SimState, TxResult } from './types';
import { createWT, postMatDoc } from './inventory';

export function createSalesOrder(s: SimState, customer: string, material: string, qty: number, due: number, priority: 'NORMAL' | 'URGENT' = 'NORMAL'): TxResult {
  const T = 'VA01';
  const c = CUSTOMERS[customer];
  const m = MATERIALS[material];
  if (!c) return fail(s, T, 'Select a customer.', 'Choose the sold-to party.');
  if (!m || m.type !== 'FIN') return fail(s, T, 'Only finished products can be sold.', 'Choose an FG material.');
  if (!Number.isInteger(qty) || qty <= 0) return fail(s, T, 'Quantity must be a whole number > 0.', 'Enter pieces.');
  if (due <= s.t + 60) return fail(s, T, 'Requested delivery date must be at least one hour in the future.', 'Pick a realistic delivery date.');
  const so = addDoc<SalesOrder>(s, {
    ...baseDoc(s, 'SO', 'RELEASED'),
    type: 'SO',
    customer,
    items: [{ material, qty, price: m.price, delivered: 0 }],
    due,
    priority,
    penaltyPerHour: priority === 'URGENT' ? 900 : 350,
  });
  return ok(s, T, `Sales order ${so.id} for ${c.name}: ${qty} × ${m.name}.`, [so.id]);
}

export function openSoQty(so: SalesOrder) {
  return so.items.reduce((a, i) => a + i.qty - i.delivered, 0);
}
export function inDeliveryQty(s: SimState, soId: string) {
  return Object.values(s.docs).reduce((a, d) => a + (d.type === 'DLV' && d.salesOrder === soId && !d.pgi && d.status !== 'CANCELLED' ? d.items.reduce((x, i) => x + i.qty, 0) : 0), 0);
}

/** VL01N — outbound delivery with availability check. */
export function createDelivery(s: SimState, soId: string, qty: number, dock: number): TxResult {
  const T = 'VL01N';
  const so = getDoc(s, soId, 'SO');
  if (!so) return fail(s, T, `Sales order ${soId} not found.`, 'Select a sales order.');
  if (so.status === 'COMPLETED') return fail(s, T, `Sales order ${so.id} is fully delivered.`, 'Nothing left to deliver.');
  const it = so.items[0];
  const open = it.qty - it.delivered - inDeliveryQty(s, so.id);
  if (!Number.isInteger(qty) || qty <= 0) return fail(s, T, 'Delivery quantity must be a whole number > 0.', 'Enter pieces.');
  if (qty > open) return fail(s, T, `Only ${open} pcs are still open on ${so.id}.`, 'Deliver at most the open quantity.');
  const atp = availableQty(s, it.material);
  if (qty > atp) {
    return fail(s, T, `Availability check: only ${fmtQty(atp, 'PC')} of ${MATERIALS[it.material].name} are unrestricted and released in finished goods.`, 'Produce or receive more finished goods first. Blocked or quality-inspection stock can never be delivered.', 'ATP');
  }
  if (dock < 0 || dock >= OUTBOUND_DOORS.length) return fail(s, T, 'Choose an outbound dock door.', 'Doors 1–3 are available.');
  const dlv = addDoc<OutboundDelivery>(s, {
    ...baseDoc(s, 'DLV'),
    type: 'DLV',
    salesOrder: so.id,
    customer: so.customer,
    items: [{ material: it.material, qty, picked: 0, picks: [] }],
    pickStatus: 'NONE',
    packed: false,
    handlingUnits: 0,
    pgi: false,
    dock,
  });
  link(s, so.id, dlv.id);
  so.status = 'IN_PROGRESS';
  hist(s, so, 'Delivery created', dlv.id);
  return ok(s, T, `Outbound delivery ${dlv.id} created for ${qty} pcs, dock ${dock + 1}.`, [dlv.id]);
}

/** Create picking warehouse tasks (FIFO over released batches). */
export function pickDelivery(s: SimState, id: string): TxResult {
  const T = 'VL_PICK';
  const dlv = getDoc(s, id, 'DLV');
  if (!dlv) return fail(s, T, `Delivery ${id} not found.`, 'Select a delivery.');
  if (dlv.pgi) return fail(s, T, `Goods issue for ${dlv.id} was already posted.`, 'Nothing to pick.');
  const tasks: string[] = [];
  for (const it of dlv.items) {
    const already = it.picks.reduce((a, p) => a + p.qty, 0);
    let need = it.qty - already;
    if (need <= 0) continue;
    const quants = Object.values(s.quants)
      .filter((q) => q.material === it.material && q.stockType === 'UNR' && BIN_MAP_TYPES.storage(q.bin) && s.batches[q.batch]?.status === 'RELEASED')
      .sort((a, b) => a.createdAt - b.createdAt);
    const free = quants.reduce((a, q) => a + q.qty - q.reserved, 0);
    if (free < need) return fail(s, T, `Not enough released stock to pick ${need} pcs (${free} available).`, 'Blocked batches cannot be picked. Wait for put-away or produce more.', 'ATP');
    for (const q of quants) {
      if (need <= 0) break;
      const take = Math.min(q.qty - q.reserved, need);
      if (take <= 0) continue;
      q.reserved = round(q.reserved + take);
      const wt = createWT(s, 'PICK', q.id, take, `DOCK-OUT-${dlv.dock + 1}`, dlv.id);
      it.picks.push({ quant: q.id, bin: q.bin, batch: q.batch, qty: take, wt: wt.id });
      tasks.push(wt.id);
      need -= take;
    }
  }
  if (!tasks.length) return fail(s, T, `Delivery ${dlv.id} is already fully picked.`, 'Continue with packing.');
  dlv.pickStatus = 'IN_PROGRESS';
  dlv.status = 'IN_PROGRESS';
  hist(s, dlv, 'Picking started', `${tasks.length} warehouse task(s)`);
  return ok(s, T, `${tasks.length} picking task(s) created for ${dlv.id}.`, [dlv.id, ...tasks]);
}

export function packDelivery(s: SimState, id: string): TxResult {
  const T = 'VL_PICK';
  const dlv = getDoc(s, id, 'DLV');
  if (!dlv) return fail(s, T, `Delivery ${id} not found.`, 'Select a delivery.');
  if (dlv.pickStatus !== 'DONE') return fail(s, T, `Picking for ${dlv.id} is not complete.`, 'Wait until all picking tasks are confirmed at the dock.');
  if (dlv.packed) return fail(s, T, `${dlv.id} is already packed.`, 'Continue with shipment planning.');
  const per = MATERIALS[dlv.items[0].material].perPallet;
  dlv.handlingUnits = dlv.items.reduce((a, i) => a + Math.ceil(i.qty / per), 0);
  dlv.packed = true;
  hist(s, dlv, 'Packed', `${dlv.handlingUnits} handling unit(s) (pallets)`);
  return ok(s, T, `${dlv.id} packed into ${dlv.handlingUnits} handling unit(s).`, [dlv.id]);
}

export function shipmentCost(customer: string, carrier: string) {
  const c = CUSTOMERS[customer];
  const cr = CARRIERS[carrier];
  return round(Math.max(cr.minCharge, c.km * cr.ratePerKm), 2);
}

export function vehicleBusy(s: SimState, vehicle: string) {
  return Object.values(s.docs).some((d) => d.type === 'SHP' && d.vehicle === vehicle && d.status !== 'COMPLETED' && d.status !== 'CANCELLED' && (d.deliveredAt === undefined || d.deliveredAt > s.t) && !(d.departedAt !== undefined && d.eta !== undefined && s.t > d.eta + 120));
}

/** VT01N — transport planning: carrier, vehicle and loading time. */
export function createShipment(s: SimState, dlvId: string, carrier: string, vehicle: string, loadInMin: number): TxResult {
  const T = 'VT01N';
  const dlv = getDoc(s, dlvId, 'DLV');
  if (!dlv) return fail(s, T, `Delivery ${dlvId} not found.`, 'Select a delivery.');
  if (dlv.shipment) return fail(s, T, `${dlv.id} is already assigned to shipment ${dlv.shipment}.`, 'Open the existing shipment.');
  const cr = CARRIERS[carrier];
  if (!cr) return fail(s, T, 'Select a carrier.', 'Compare carrier rates and reliability.');
  const v = cr.vehicles.find((x) => x.id === vehicle);
  if (!v) return fail(s, T, 'Select a vehicle of this carrier.', 'Each carrier has its own fleet.');
  if (vehicleBusy(s, vehicle)) return fail(s, T, `Vehicle ${v.plate} is already on another shipment.`, 'Choose another vehicle or carrier.');
  const hu = dlv.handlingUnits || Math.ceil(dlv.items[0].qty / MATERIALS[dlv.items[0].material].perPallet);
  if (hu > v.pallets) return fail(s, T, `${hu} pallets do not fit on ${v.type} (${v.pallets} places).`, 'Choose a larger vehicle or split the delivery.');
  if (!(loadInMin >= 15 && loadInMin <= 24 * 60)) return fail(s, T, 'Loading time must be between 15 minutes and 24 hours from now.', 'Plan the truck arrival realistically.');
  const late = !chance(s, cr.reliability);
  const shp = addDoc<Shipment>(s, {
    ...baseDoc(s, 'SHP', 'RELEASED'),
    type: 'SHP',
    deliveries: [dlv.id],
    carrier,
    vehicle,
    route: `Gliwice → ${CUSTOMERS[dlv.customer].city}`,
    dock: dlv.dock,
    plannedLoad: s.t + loadInMin,
    cost: shipmentCost(dlv.customer, carrier),
    delayMin: 0,
    lateBy: late ? randInt(s, 45, 180) : 0,
  });
  dlv.shipment = shp.id;
  link(s, shp.id, dlv.id);
  hist(s, dlv, 'Assigned to shipment', shp.id);
  return ok(s, T, `Shipment ${shp.id} planned with ${cr.name} (${v.plate}), freight ${fmtEur(shp.cost)}.`, [shp.id]);
}

/** VL02N — post goods issue once the truck is loaded. */
export function postGoodsIssue(s: SimState, dlvId: string): TxResult {
  const T = 'VL_PGI';
  const dlv = getDoc(s, dlvId, 'DLV');
  if (!dlv) return fail(s, T, `Delivery ${dlvId} not found.`, 'Select a delivery.');
  if (dlv.pgi) return fail(s, T, `Goods issue for ${dlv.id} is already posted.`, 'Track the shipment instead.');
  if (dlv.pickStatus !== 'DONE') return fail(s, T, `${dlv.id} is not fully picked.`, 'Picking must be completed first.');
  if (!dlv.packed) return fail(s, T, `${dlv.id} is not packed.`, 'Pack the delivery into handling units.');
  const shp = getDoc(s, dlv.shipment, 'SHP');
  if (!shp) return fail(s, T, `No shipment planned for ${dlv.id}.`, 'Create a shipment (VT01N) with carrier and vehicle.');
  if ((shp.loadedAt === undefined)) return fail(s, T, shp.arrivedAt !== undefined ? `Truck ${CARRIERS[shp.carrier].vehicles.find((v) => v.id === shp.vehicle)?.plate} is still loading.` : 'The truck has not arrived at the dock yet.', 'Post goods issue after loading is complete — goods leave the plant with the truck.');
  // every pick must be on unblocked, existing stock
  const items = [];
  for (const it of dlv.items) {
    for (const p of it.picks) {
      const q = Object.values(s.quants).find((x) => x.bin === `DOCK-OUT-${dlv.dock + 1}` && x.order === dlv.id && x.batch === p.batch);
      const b = s.batches[p.batch];
      if (!q) return fail(s, T, `Picked stock of batch ${p.batch} is missing at the dock.`, 'Check the picking tasks.');
      if (q.stockType !== 'UNR' || (b && b.status !== 'RELEASED')) {
        return fail(s, T, `Batch ${p.batch} is blocked by quality — it cannot leave the plant.`, 'Remove the blocked batch from the delivery and pick a released batch.', 'SHIP_BLOCKED');
      }
    }
  }
  let value = 0;
  for (const it of dlv.items) {
    for (const p of it.picks) {
      const q = Object.values(s.quants).find((x) => x.bin === `DOCK-OUT-${dlv.dock + 1}` && x.order === dlv.id && x.batch === p.batch)!;
      const take = Math.min(q.qty, p.qty);
      q.qty = round(q.qty - take);
      q.physical = round(Math.max(0, q.physical - take));
      q.reserved = round(Math.max(0, q.reserved - take));
      items.push({ material: it.material, qty: take, batch: p.batch, fromBin: q.bin, stockType: 'UNR' as const, quant: q.id });
      const b = s.batches[p.batch];
      if (b) b.shippedTo = [...(b.shippedTo ?? []), dlv.customer];
      cleanupQuant(s, q);
    }
    value += it.qty * MATERIALS[it.material].price;
  }
  const md = postMatDoc(s, '601', items, [dlv.id], 'Goods issue for delivery');
  dlv.pgi = true;
  dlv.status = 'COMPLETED';
  const so = getDoc(s, dlv.salesOrder, 'SO')!;
  for (const it of dlv.items) {
    const si = so.items.find((x) => x.material === it.material);
    if (si) si.delivered += it.qty;
  }
  if (openSoQty(so) <= 0) so.status = 'COMPLETED';
  hist(s, so, 'Goods issued', `${dlv.id} / ${md.id}`);
  s.stats.revenue += value;
  shp.departedAt = s.t;
  shp.status = 'IN_PROGRESS';
  const transit = CUSTOMERS[dlv.customer].transitHours * 60;
  shp.delayMin = shp.lateBy > 0 ? Math.round(shp.lateBy * 0.3) : 0;
  shp.eta = s.t + transit + shp.delayMin;
  s.stats.transportCost += shp.cost;
  hist(s, shp, 'Departed', `ETA ${Math.round(transit + shp.delayMin)} min`);
  link(s, md.id, shp.id);
  return ok(s, T, `Goods issue ${md.id} posted — truck departed to ${CUSTOMERS[dlv.customer].city}.`, [md.id, shp.id]);
}
