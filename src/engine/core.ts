// Low-level helpers shared by every transaction: RNG, clock, numbering,
// documents, audit log and stock queries.
import { BIN_MAP } from './layout';
import { MATERIALS } from './master';
import type { AnyDoc, DocOf, DocType, Quant, SimState, StockType, TxResult } from './types';

// ---------------------------------------------------------------- random
export function rand(s: SimState): number {
  // mulberry32 — deterministic, state stored in the save game
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const chance = (s: SimState, p: number) => rand(s) < p;
export const randInt = (s: SimState, a: number, b: number) => a + Math.floor(rand(s) * (b - a + 1));
export const pick = <T,>(s: SimState, arr: T[]): T => arr[Math.floor(rand(s) * arr.length)];
export function gauss(s: SimState, mean: number, sd: number) {
  const u = Math.max(1e-9, rand(s));
  const v = rand(s);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------- clock
// t = simulated minutes since Monday 06:00 (start of the morning shift).
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function clock(t: number) {
  const abs = t + 6 * 60;
  const day = Math.floor(abs / 1440);
  const m = Math.floor(abs - day * 1440);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return { day: day + 1, weekday: DAY_NAMES[day % 7], hh, mm, minuteOfDay: m };
}
export const pad2 = (n: number) => String(n).padStart(2, '0');
export function fmtTime(t: number) {
  const c = clock(t);
  return `${pad2(c.hh)}:${pad2(c.mm)}`;
}
export function fmtDateTime(t: number) {
  const c = clock(t);
  return `${c.weekday} ${pad2(c.hh)}:${pad2(c.mm)}`;
}
export function fmtDuration(min: number) {
  const sign = min < 0 ? '−' : '';
  const m = Math.abs(Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${sign}${r} min`;
  if (h < 48) return `${sign}${h} h ${pad2(r)} min`;
  return `${sign}${Math.floor(h / 24)} d ${h % 24} h`;
}
export function shiftOf(t: number): 1 | 2 | 3 {
  const h = clock(t).hh;
  if (h >= 6 && h < 14) return 1;
  if (h >= 14 && h < 22) return 2;
  return 3;
}
export const SHIFT_NAMES = { 1: 'Morning 06–14', 2: 'Afternoon 14–22', 3: 'Night 22–06' } as const;

// ---------------------------------------------------------------- numbering
const RANGES: Record<DocType, { start: number; fmt: (n: number) => string }> = {
  PR: { start: 10000101, fmt: (n) => String(n) },
  PO: { start: 4500000101, fmt: (n) => String(n) },
  IBD: { start: 180000101, fmt: (n) => String(n) },
  MD: { start: 4900000101, fmt: (n) => String(n) },
  PP: { start: 100025, fmt: (n) => `PP-${n}` },
  CF: { start: 610001, fmt: (n) => `CF-${n}` },
  IL: { start: 300000101, fmt: (n) => `0${n}` },
  QN: { start: 200000101, fmt: (n) => String(n) },
  PMN: { start: 11000101, fmt: (n) => String(n) },
  MO: { start: 4000101, fmt: (n) => String(n) },
  SO: { start: 1200101, fmt: (n) => String(n) },
  DLV: { start: 80000101, fmt: (n) => String(n) },
  SHP: { start: 2000101, fmt: (n) => String(n) },
  WT: { start: 300000501, fmt: (n) => `WT-${n}` },
  PI: { start: 100000101, fmt: (n) => `PI-${n}` },
  RES: { start: 5000101, fmt: (n) => String(n) },
};
export function nextId(s: SimState, type: DocType): string {
  const n = s.seq[type] ?? RANGES[type].start;
  s.seq[type] = n + 1;
  return RANGES[type].fmt(n);
}
let quantCounter = 0;
export function newQuantId(s: SimState) {
  quantCounter = (s.seq['QUANT'] ?? 1) + 1;
  s.seq['QUANT'] = quantCounter;
  return `Q${quantCounter}`;
}
export function newBatchId(s: SimState, prefix: 'S' | 'P' | 'I') {
  const n = (s.seq['BATCH'] ?? 2600100) + 1;
  s.seq['BATCH'] = n;
  return `${prefix}${n}`;
}

// ---------------------------------------------------------------- documents
export const DOC_LABEL: Record<DocType, string> = {
  PR: 'Purchase requisition',
  PO: 'Purchase order',
  IBD: 'Inbound delivery',
  MD: 'Material document',
  PP: 'Production order',
  CF: 'Confirmation',
  IL: 'Inspection lot',
  QN: 'Quality notification',
  PMN: 'Maintenance notification',
  MO: 'Maintenance order',
  SO: 'Sales order',
  DLV: 'Outbound delivery',
  SHP: 'Shipment',
  WT: 'Warehouse task',
  PI: 'Physical inventory doc.',
  RES: 'Reservation',
};

export function addDoc<T extends AnyDoc>(s: SimState, doc: T): T {
  s.docs[doc.id] = doc;
  return doc;
}
export function getDoc<T extends DocType>(s: SimState, id: string | undefined, type: T): DocOf<T> | undefined {
  if (!id) return undefined;
  const d = s.docs[id];
  return d && d.type === type ? (d as DocOf<T>) : undefined;
}
export function docsOf<T extends DocType>(s: SimState, type: T): DocOf<T>[] {
  const out: DocOf<T>[] = [];
  for (const id in s.docs) {
    const d = s.docs[id];
    if (d.type === type) out.push(d as DocOf<T>);
  }
  return out;
}
export function link(s: SimState, a: string, b: string) {
  const da = s.docs[a];
  const db = s.docs[b];
  if (da && !da.refs.includes(b)) da.refs.push(b);
  if (db && !db.refs.includes(a)) db.refs.push(a);
}
export function hist(s: SimState, doc: AnyDoc, action: string, detail?: string) {
  doc.history.push({ t: s.t, user: s.user, action, detail });
}
export function baseDoc<T extends DocType>(s: SimState, type: T, status: AnyDoc['status'] = 'CREATED') {
  return {
    id: nextId(s, type),
    type,
    status,
    createdAt: s.t,
    createdBy: s.user,
    refs: [] as string[],
    history: [{ t: s.t, user: s.user, action: 'Created' }],
  };
}

// ---------------------------------------------------------------- audit
let auditCounter = 0;
export function audit(s: SimState, tcode: string, ok: boolean, message: string, docs: string[] = []) {
  auditCounter = Math.max(auditCounter, s.audit.length ? s.audit[s.audit.length - 1].id : 0) + 1;
  s.audit.push({ id: auditCounter, t: s.t, user: s.user, tcode, ok, message, docs });
  if (s.audit.length > 1500) s.audit.splice(0, s.audit.length - 1500);
}
export function ok(s: SimState, tcode: string, message: string, docs: string[] = []): TxResult {
  s.stats.txOk++;
  audit(s, tcode, true, message, docs);
  return { ok: true, message, docs };
}
export function fail(s: SimState, tcode: string, message: string, fix: string, code = 'VALIDATION'): TxResult {
  s.stats.txFailed++;
  audit(s, tcode, false, message);
  s.stats.mistakes.push({ t: s.t, code, text: message, fix });
  if (s.stats.mistakes.length > 200) s.stats.mistakes.shift();
  return { ok: false, message, fix };
}

// ---------------------------------------------------------------- stock
export const STORAGE_TYPES = new Set(['SHEET', 'RACK', 'FGRACK', 'SPARE']);

export function quantsIn(s: SimState, bin: string): Quant[] {
  return Object.values(s.quants).filter((q) => q.bin === bin);
}
export function palletsOf(q: Pick<Quant, 'material' | 'qty'>) {
  const m = MATERIALS[q.material];
  return Math.max(1, Math.ceil(q.qty / (m?.perPallet || 1)));
}
/** Pallet places used in a bin, including pallets already on their way there. */
export function binUsage(s: SimState, bin: string): number {
  let used = 0;
  for (const q of Object.values(s.quants)) if (q.bin === bin && q.qty > 0) used += palletsOf(q);
  for (const id in s.docs) {
    const d = s.docs[id];
    if (d.type === 'WT' && d.toBin === bin && (d.status === 'CREATED' || d.status === 'IN_PROGRESS')) used += palletsOf(d);
  }
  return used;
}
export function binFree(s: SimState, bin: string) {
  const def = BIN_MAP[bin];
  if (!def) return 0;
  return Math.max(0, def.capacity - binUsage(s, bin));
}
export function binLocked(s: SimState, bin: string) {
  return (s.binLocks[bin] ?? -1) > s.t;
}

/** Can this material be put away into that bin? Returns an error text or null. */
export function storageCheck(s: SimState, material: string, qty: number, bin: string): string | null {
  const def = BIN_MAP[bin];
  const m = MATERIALS[material];
  if (!def) return `Storage bin ${bin} does not exist.`;
  if (!m) return `Material ${material} does not exist.`;
  if (binLocked(s, bin)) return `Bin ${bin} is locked (rack inspection in progress).`;
  if (STORAGE_TYPES.has(def.type) && def.type !== m.binType) {
    const where = { SHEET: 'sheet metal storage (WH02)', RACK: 'raw material racks (WH01)', FGRACK: 'finished goods racks (WH03)', SPARE: 'spare parts store (WH04)' }[m.binType as 'SHEET'];
    return `${m.name} must be stored in ${where}, not in ${bin}.`;
  }
  const need = palletsOf({ material, qty });
  const free = binFree(s, bin);
  if (need > free) return `Bin ${bin} has ${free} free pallet place(s); ${need} needed.`;
  // keep one material per storage bin to make physical counts simple
  const mixed = quantsIn(s, bin).some((q) => q.material !== material && q.qty > 0);
  if (STORAGE_TYPES.has(def.type) && mixed) return `Bin ${bin} already holds a different material (mixed storage is not allowed).`;
  return null;
}

/** Unrestricted, unreserved quantity in storage bins of released batches. */
export function availableQty(s: SimState, material: string): number {
  let sum = 0;
  for (const q of Object.values(s.quants)) {
    if (q.material !== material || q.stockType !== 'UNR') continue;
    const def = BIN_MAP[q.bin];
    if (!def || !STORAGE_TYPES.has(def.type)) continue;
    const b = s.batches[q.batch];
    if (b && b.status !== 'RELEASED') continue;
    sum += Math.max(0, q.qty - q.reserved);
  }
  return round(sum);
}
export function stockTotals(s: SimState, material: string) {
  const r = { UNR: 0, QI: 0, BLK: 0, reserved: 0, psa: 0, transit: 0 };
  for (const q of Object.values(s.quants)) {
    if (q.material !== material) continue;
    const def = BIN_MAP[q.bin];
    if (def && (def.type === 'PSA')) r.psa += q.qty;
    else if (def && (def.type === 'DOCK' || def.type === 'QA')) r.transit += q.qty;
    r[q.stockType] += q.qty;
    r.reserved += q.reserved;
  }
  return r;
}

export function addQuant(
  s: SimState,
  material: string,
  bin: string,
  batch: string,
  qty: number,
  stockType: StockType,
  physical = qty,
  order?: string,
): Quant {
  const existing = Object.values(s.quants).find(
    (q) => q.material === material && q.bin === bin && q.batch === batch && q.stockType === stockType && q.order === order,
  );
  if (existing) {
    existing.qty = round(existing.qty + qty);
    existing.physical = round(existing.physical + physical);
    return existing;
  }
  const q: Quant = { id: newQuantId(s), material, bin, batch, qty: round(qty), physical: round(physical), stockType, reserved: 0, order, createdAt: s.t };
  s.quants[q.id] = q;
  return q;
}
export function cleanupQuant(s: SimState, q: Quant) {
  if (q.qty <= 1e-6 && q.physical <= 1e-6) delete s.quants[q.id];
}

export const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
export const fmtQty = (n: number, uom?: string) => {
  const v = Math.abs(n) >= 100 ? Math.round(n).toLocaleString('en-US') : (Math.round(n * 100) / 100).toLocaleString('en-US');
  return uom ? `${v} ${uom === 'PC' ? 'pc' : uom === 'KG' ? 'kg' : 'L'}` : v;
};
export const fmtEur = (n: number) => `€${Math.round(n).toLocaleString('en-US')}`;
export const qtyIsInt = (material: string) => MATERIALS[material]?.uom === 'PC';

export const BIN_MAP_TYPES = {
  storage: (bin: string) => STORAGE_TYPES.has(BIN_MAP[bin]?.type ?? ''),
};
