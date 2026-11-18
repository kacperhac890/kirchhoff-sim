// KPIs, hourly history and the performance score.
import { BIN_MAP, MACHINES } from './layout';
import { MATERIALS } from './master';
import { docsOf, round, STORAGE_TYPES } from './core';
import { SAFETY_STOCK } from './procurement';
import { availableQty } from './core';
import type { MachineState, SimState } from './types';

export function machineOee(m: MachineState) {
  const planned = m.runMin + m.downMin + m.setupMin;
  if (planned < 1) return null;
  const A = m.runMin / planned;
  const P = m.runMin > 0 ? m.perfMin / m.runMin : 0;
  const Q = m.goodCount + m.scrapCount > 0 ? m.goodCount / (m.goodCount + m.scrapCount) : 1;
  return { A, P, Q, oee: A * P * Q };
}

export function plantOee(s: SimState) {
  let run = 0;
  let down = 0;
  let setup = 0;
  let perf = 0;
  let good = 0;
  let scrap = 0;
  for (const m of Object.values(s.machines)) {
    run += m.runMin;
    down += m.downMin;
    setup += m.setupMin;
    perf += m.perfMin;
    good += m.goodCount;
    scrap += m.scrapCount;
  }
  const planned = run + down + setup;
  if (planned < 1) return { A: 0, P: 0, Q: 0, oee: 0, hasData: false, good, scrap };
  const A = run / planned;
  const P = run > 0 ? perf / run : 0;
  const Q = good + scrap > 0 ? good / (good + scrap) : 1;
  return { A, P, Q, oee: A * P * Q, hasData: true, good, scrap };
}

export function inventoryValue(s: SimState) {
  let v = 0;
  for (const q of Object.values(s.quants)) v += q.qty * (MATERIALS[q.material]?.price ?? 0);
  return round(v, 2);
}

export function inventoryAccuracy(s: SimState) {
  let diff = 0;
  let base = 0;
  for (const q of Object.values(s.quants)) {
    if (!STORAGE_TYPES.has(BIN_MAP[q.bin]?.type ?? '')) continue;
    const price = MATERIALS[q.material].price;
    diff += Math.abs(q.qty - q.physical) * price;
    base += Math.max(q.qty, q.physical) * price;
  }
  return base > 0 ? 1 - diff / base : 1;
}

export function shortages(s: SimState) {
  return Object.keys(SAFETY_STOCK)
    .map((id) => ({ material: id, available: availableQty(s, id), safety: SAFETY_STOCK[id] }))
    .filter((x) => x.available < x.safety);
}

export function utilization(s: SimState) {
  return MACHINES.map((d) => {
    const m = s.machines[d.id];
    const total = m.runMin + m.idleMin + m.downMin + m.setupMin;
    return { id: d.id, group: d.group, util: total > 0 ? m.runMin / total : 0, down: total > 0 ? m.downMin / total : 0, setup: total > 0 ? m.setupMin / total : 0 };
  });
}

export function deliveryPerformance(s: SimState) {
  const n = s.stats.deliveriesOnTime + s.stats.deliveriesLate;
  return n ? s.stats.deliveriesOnTime / n : null;
}

export function orderFulfillment(s: SimState) {
  const sos = docsOf(s, 'SO');
  const total = sos.reduce((a, so) => a + so.items.reduce((x, i) => x + i.qty, 0), 0);
  const delivered = sos.reduce((a, so) => a + so.items.reduce((x, i) => x + i.delivered, 0), 0);
  return { total, delivered, ratio: total ? delivered / total : 0 };
}

export function hourlySnapshot(s: SimState, hour: number) {
  const o = plantOee(s);
  const snap = s.stats.snap;
  const dGood = o.good - snap.good;
  const dScrap = o.scrap - snap.scrap;
  let run = 0;
  let down = 0;
  let setup = 0;
  let perf = 0;
  for (const m of Object.values(s.machines)) {
    run += m.runMin;
    down += m.downMin;
    setup += m.setupMin;
    perf += m.perfMin;
  }
  const dRun = run - snap.run;
  const dPlanned = dRun + (down - snap.down) + (setup - snap.setup);
  const A = dPlanned > 0 ? dRun / dPlanned : 0;
  const P = dRun > 0 ? (perf - snap.perf) / dRun : 0;
  const Q = dGood + dScrap > 0 ? dGood / (dGood + dScrap) : 1;
  s.stats.outputByHour.push({ h: hour, good: dGood, scrap: dScrap });
  s.stats.oeeByHour.push({ h: hour, oee: dPlanned > 0 ? A * P * Q : 0, availability: A, performance: P, quality: Q });
  s.stats.inventoryValueByHour.push({ h: hour, value: inventoryValue(s) });
  for (const arr of [s.stats.outputByHour, s.stats.oeeByHour, s.stats.inventoryValueByHour]) if (arr.length > 96) arr.shift();
  s.stats.snap = { good: o.good, scrap: o.scrap, run, down, setup, perf };
}

export interface ScoreBreakdown {
  total: number;
  parts: { key: string; label: string; value: number; max: number; note: string }[];
}

export function computeScore(s: SimState): ScoreBreakdown {
  const st = s.stats;
  const txN = st.txOk + st.txFailed;
  const tx = txN ? (st.txOk / txN) * 200 : 0;
  const invAcc = inventoryAccuracy(s);
  const inv = Math.max(0, (invAcc - 0.9) / 0.1) * 150;
  const o = plantOee(s);
  const prod = o.hasData ? Math.min(1, o.oee / 0.8) * 150 : 0;
  const udMistakes = st.mistakes.filter((m) => m.code.startsWith('UD_')).length;
  const fpy = o.good + o.scrap > 0 ? o.good / (o.good + o.scrap) : 1;
  const qual = Math.max(0, Math.min(150, (fpy >= 0.97 ? 150 : 150 * Math.max(0, (fpy - 0.85) / 0.12)) - 40 * st.complaints - 25 * udMistakes));
  const dp = deliveryPerformance(s);
  const deliv = dp === null ? 0 : dp * 150;
  const cost = Math.max(0, 100 - st.penalties / 150);
  let docPen = 0;
  for (const pp of docsOf(s, 'PP')) for (const op of pp.ops) if (op.status === 'DONE' && op.finishedAt !== undefined && s.t - op.finishedAt > 90 && !pp.autoConfirm) docPen += 10;
  for (const mo of docsOf(s, 'MO')) if (mo.workDoneAt !== undefined && mo.status !== 'COMPLETED' && s.t - mo.workDoneAt > 60) docPen += 10;
  docPen += 5 * st.mistakes.filter((m) => m.code === 'GR_QTY' || m.code === 'CONF_QTY').length;
  const docu = Math.max(0, 100 - docPen);
  const parts = [
    { key: 'tx', label: 'Correct ERP transactions', value: tx, max: 200, note: txN ? `${st.txOk} of ${txN} postings accepted` : 'No transactions yet' },
    { key: 'inv', label: 'Inventory accuracy', value: inv, max: 150, note: `${(invAcc * 100).toFixed(1)} % book = physical` },
    { key: 'prod', label: 'Production efficiency (OEE)', value: prod, max: 150, note: o.hasData ? `OEE ${(o.oee * 100).toFixed(1)} %` : 'No production yet' },
    { key: 'qual', label: 'Quality performance', value: qual, max: 150, note: `FPY ${(fpy * 100).toFixed(1)} %, ${st.complaints} complaint(s)` },
    { key: 'deliv', label: 'On-time delivery', value: deliv, max: 150, note: dp === null ? 'No deliveries completed yet' : `${st.deliveriesOnTime} on time, ${st.deliveriesLate} late` },
    { key: 'cost', label: 'Cost control', value: cost, max: 100, note: `€${Math.round(st.penalties).toLocaleString('en-US')} penalties & claims` },
    { key: 'docu', label: 'Proper documentation', value: docu, max: 100, note: docPen ? 'Late confirmations or wrong postings found' : 'Documents complete and timely' },
  ];
  return { total: Math.round(parts.reduce((a, p) => a + p.value, 0)), parts: parts.map((p) => ({ ...p, value: Math.round(p.value) })) };
}
