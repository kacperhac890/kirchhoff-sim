// PM: notifications, maintenance orders, technicians, spare parts.
import { machineDef, MACHINES } from './layout';
import { FAILURES, MATERIALS, SKILL_NAMES } from './master';
import { addDoc, baseDoc, fail, fmtQty, getDoc, hist, link, ok, pick, round, shiftOf, BIN_MAP_TYPES, cleanupQuant } from './core';
import type { MaintOrder, PmNotification, SimState, TxResult } from './types';
import { postMatDoc } from './inventory';

export function createPmNotification(s: SimState, machine: string, kind: 'M1' | 'M2', description: string): TxResult {
  const T = 'IW21';
  if (!s.machines[machine]) return fail(s, T, `Equipment ${machine} not found.`, 'Select a machine.');
  if (description.trim().length < 5) return fail(s, T, 'Describe the problem (at least 5 characters).', 'Example: "Oil leak at main cylinder".');
  const open = Object.values(s.docs).find((d) => d.type === 'PMN' && d.machine === machine && d.status !== 'COMPLETED' && d.status !== 'CANCELLED' && d.kind === kind);
  if (open) return fail(s, T, `Notification ${open.id} is already open for ${machine}.`, 'Process the existing notification instead of creating duplicates.');
  const n = addDoc<PmNotification>(s, { ...baseDoc(s, 'PMN'), type: 'PMN', kind, machine, description });
  return ok(s, T, `Maintenance notification ${n.id} created for ${machine}.`, [n.id]);
}

/** Breakdown triggered by the simulation. */
export function triggerBreakdown(s: SimState, machine: string, forcedCode?: string) {
  const m = s.machines[machine];
  if (!m || m.failure || m.status === 'MAINT') return undefined;
  const def = machineDef(machine);
  const modes = FAILURES[def.group];
  const mode = (forcedCode && modes.find((f) => f.code === forcedCode)) || pick(s, modes);
  m.failure = { code: mode.code, text: mode.text, since: s.t };
  const prev = s.user;
  s.user = 'SYSTEM';
  const n = addDoc<PmNotification>(s, { ...baseDoc(s, 'PMN'), type: 'PMN', kind: 'M2', machine, description: `${mode.text} (${mode.code})` });
  s.user = prev;
  if (m.order) link(s, n.id, m.order);
  return n;
}

export function failureModeFor(s: SimState, machine: string) {
  const m = s.machines[machine];
  const def = machineDef(machine);
  return FAILURES[def.group].find((f) => f.code === m.failure?.code) ?? FAILURES[def.group][0];
}

export interface MoInput {
  machine: string;
  kind: 'PM01' | 'PM02';
  technician: string;
  notification?: string;
  description?: string;
}

/** IW31 create + release in one step: assigns a technician and withdraws spare parts. */
export function createMaintOrder(s: SimState, input: MoInput): TxResult {
  const T = 'IW31';
  const m = s.machines[input.machine];
  if (!m) return fail(s, T, `Equipment ${input.machine} not found.`, 'Select a machine.');
  if (m.maintOrder) return fail(s, T, `Maintenance order ${m.maintOrder} is already running on ${input.machine}.`, 'Finish the open order first.');
  const def = machineDef(input.machine);
  if (input.kind === 'PM01' && !m.failure) return fail(s, T, `${input.machine} has no breakdown — use order type PM02 (preventive).`, 'PM01 is for corrective work after a breakdown; PM02 for planned maintenance.');
  const tech = s.employees[input.technician];
  if (!tech || tech.role !== 'TECH') return fail(s, T, 'Select a maintenance technician.', 'Assign a technician with the right skill.');
  if (tech.busyWith) return fail(s, T, `${tech.name} is busy with order ${tech.busyWith}.`, 'Choose a free technician or wait.');
  if (tech.shift !== shiftOf(s.t)) return fail(s, T, `${tech.name} is not on the current shift.`, 'Assign a technician who is on shift now.');
  const mode = input.kind === 'PM01' ? failureModeFor(s, input.machine) : undefined;
  if (mode && tech.skill !== mode.skill) {
    return fail(s, T, `${tech.name} (${SKILL_NAMES[tech.skill!]}) is not qualified for this repair — ${SKILL_NAMES[mode.skill]} skill needed.`, `Assign a technician with ${SKILL_NAMES[mode.skill]} skill.`, 'WRONG_SKILL');
  }
  const parts: MaintOrder['parts'] = [];
  if (mode?.part) parts.push({ material: mode.part, qty: mode.partQty, issued: 0 });
  if (input.kind === 'PM02') {
    const wear: Record<string, string> = { PRESS: 'SP-HYD-SEAL', WELD: 'SP-WELD-TIP', TRIM: 'SP-LASER-NOZ', BLANK: 'SP-LASER-NOZ', KTL: 'SP-BELT', HOTFORM: 'SP-THERMO' };
    const p = wear[def.group];
    if (p) parts.push({ material: p, qty: 1, issued: 0 });
  }
  // spare part availability (unrestricted, in WH04)
  for (const p of parts) {
    const avail = Object.values(s.quants).filter((q) => q.material === p.material && q.stockType === 'UNR' && BIN_MAP_TYPES.storage(q.bin)).reduce((a, q) => a + q.qty - q.reserved, 0);
    if (avail + 1e-6 < p.qty) return fail(s, T, `Spare part ${MATERIALS[p.material].name} not in stock (${fmtQty(avail, 'PC')} available, ${p.qty} needed).`, 'Create a purchase requisition for the spare part (ME51N) — or use a different repair strategy.', 'NO_SPARE');
  }
  const duration = input.kind === 'PM01' ? mode!.durationMin : 90;
  const mo = addDoc<MaintOrder>(s, {
    ...baseDoc(s, 'MO', 'IN_PROGRESS'),
    type: 'MO',
    kind: input.kind,
    machine: input.machine,
    description: input.description || (mode ? `Repair: ${mode.text}` : `Preventive maintenance ${def.name}`),
    durationMin: duration,
    technician: tech.id,
    parts,
    startedAt: s.t,
    cost: 0,
    notification: input.notification,
  });
  // withdraw spare parts (movement 261 to the maintenance order)
  const items = [];
  for (const p of parts) {
    let need = p.qty;
    for (const q of Object.values(s.quants)) {
      if (need <= 0) break;
      if (q.material !== p.material || q.stockType !== 'UNR' || !BIN_MAP_TYPES.storage(q.bin)) continue;
      const take = Math.min(q.qty - q.reserved, need);
      if (take <= 0) continue;
      q.qty = round(q.qty - take);
      q.physical = round(Math.max(0, q.physical - take));
      need -= take;
      p.issued += take;
      items.push({ material: p.material, qty: take, batch: q.batch, fromBin: q.bin, stockType: q.stockType, quant: q.id });
      cleanupQuant(s, q);
    }
  }
  if (items.length) {
    const md = postMatDoc(s, '261', items, [mo.id], `Spare parts for ${mo.id}`);
    mo.cost += md.value;
  }
  tech.busyWith = mo.id;
  m.maintOrder = mo.id;
  hist(s, mo, 'Released', `Technician ${tech.name}, ${parts.length ? parts.map((p) => `${p.qty}× ${p.material}`).join(', ') : 'no spare parts'}`);
  const notif = getDoc(s, input.notification, 'PMN') ?? Object.values(s.docs).find((d): d is PmNotification => d.type === 'PMN' && d.machine === input.machine && d.status !== 'COMPLETED' && d.status !== 'CANCELLED' && !d.order);
  if (notif) {
    notif.order = mo.id;
    notif.status = 'IN_PROGRESS';
    mo.notification = notif.id;
    link(s, mo.id, notif.id);
    hist(s, notif, 'Order created', mo.id);
  }
  if (m.order) link(s, mo.id, m.order);
  return ok(s, T, `Maintenance order ${mo.id} released — ${tech.name} is working on ${input.machine}.`, [mo.id]);
}

/** IW41 — confirm the work and return the machine to production. */
export function completeMaintOrder(s: SimState, id: string): TxResult {
  const T = 'IW41';
  const mo = getDoc(s, id, 'MO');
  if (!mo) return fail(s, T, `Maintenance order ${id} not found.`, 'Select an order.');
  if (mo.status === 'COMPLETED') return fail(s, T, `${mo.id} is already completed.`, 'No action needed.');
  if ((mo.workDoneAt === undefined)) return fail(s, T, `Work on ${mo.id} is not finished yet (${Math.max(0, Math.round((mo.startedAt ?? s.t) + mo.durationMin - s.t))} min remaining).`, 'Wait until the technician reports the work as done, then confirm.');
  const m = s.machines[mo.machine];
  const tech = mo.technician ? s.employees[mo.technician] : undefined;
  const labour = (mo.durationMin / 60) * 68;
  mo.cost = round(mo.cost + labour, 2);
  s.stats.maintenanceCost += mo.cost;
  mo.status = 'COMPLETED';
  mo.finishedAt = s.t;
  if (tech) tech.busyWith = undefined;
  m.maintOrder = undefined;
  m.failure = undefined;
  m.health = mo.kind === 'PM02' ? 100 : Math.max(m.health, 82);
  m.lastPmAt = s.t;
  m.defectBoostUntil = undefined;
  hist(s, mo, 'Technically completed', `Labour ${Math.round(labour)} €, total ${Math.round(mo.cost)} €`);
  const notif = getDoc(s, mo.notification, 'PMN');
  if (notif) {
    notif.status = 'COMPLETED';
    hist(s, notif, 'Completed', mo.id);
  }
  for (const e of s.events) if ((e.kind === 'BREAKDOWN' || e.kind === 'QUALITY_DRIFT') && e.refs.includes(mo.machine)) e.resolved = true;
  return ok(s, T, `${mo.id} confirmed. ${mo.machine} is back in production (health ${Math.round(m.health)} %).`, [mo.id]);
}

export function techniciansFor(s: SimState, skill?: string) {
  return Object.values(s.employees).filter((e) => e.role === 'TECH' && (!skill || e.skill === skill));
}

export function machinesNeedingPm(s: SimState) {
  return MACHINES.filter((d) => s.machines[d.id].health < 60 && !s.machines[d.id].maintOrder);
}
