// Simulated plant layout (metres). x runs west→east, z runs north→south.
// This is an invented training layout, not a floor plan of any real plant.
import type { BinDef, BinType, WcGroup, ZoneId } from './types';

export const HALL = { x0: -64, x1: 64, z0: -40, z1: 40, height: 13 };
export const AISLE_Z = -4; // centreline of the main east–west aisle

export interface ZoneDef {
  id: ZoneId;
  name: string;
  short: string;
  rect: [number, number, number, number]; // x0, x1, z0, z1
  sap: string; // the SAP area this zone teaches
}

export const ZONES: ZoneDef[] = [
  { id: 'INBOUND', name: 'Inbound docks', short: 'Inbound', rect: [-63, -55, -38, -11], sap: 'MM · Goods receipt' },
  { id: 'RM', name: 'Raw material warehouse', short: 'Raw materials', rect: [-53, -39, -38, -11], sap: 'EWM · WH01' },
  { id: 'SHEET', name: 'Sheet metal storage', short: 'Sheet metal', rect: [-53, -39, 3, 26], sap: 'EWM · WH02' },
  { id: 'MAINT', name: 'Maintenance workshop', short: 'Maintenance', rect: [-63, -41, 29, 38], sap: 'PM · Workshop' },
  { id: 'LASER', name: 'Laser cutting', short: 'Laser', rect: [-36, -14, -38, -11], sap: 'PP · Blanking & trimming' },
  { id: 'STAMP', name: 'Stamping hall', short: 'Stamping', rect: [-36, -12, 3, 38], sap: 'PP · Press lines' },
  { id: 'HOTFORM', name: 'Hot forming', short: 'Hot forming', rect: [-9, 15, 3, 38], sap: 'PP · Press hardening' },
  { id: 'WELD', name: 'Robotic welding', short: 'Welding', rect: [-11, 19, -38, -11], sap: 'PP · Joining' },
  { id: 'KTL', name: 'Corrosion protection (KTL)', short: 'KTL e-coat', rect: [22, 44, -38, -11], sap: 'PP · Surface' },
  { id: 'MACH', name: 'Machining', short: 'Machining', rect: [18, 32, 3, 22], sap: 'PP · CNC' },
  { id: 'QC', name: 'Quality control', short: 'Quality', rect: [34, 46, 3, 22], sap: 'QM · Inspection' },
  { id: 'FG', name: 'Finished goods warehouse', short: 'Finished goods', rect: [47, 63, -38, -11], sap: 'EWM · WH03' },
  { id: 'SHIP', name: 'Shipping docks', short: 'Shipping', rect: [48, 63, 3, 38], sap: 'SD · TM' },
];

export const zoneById = (id: ZoneId) => ZONES.find((z) => z.id === id)!;

export const INBOUND_DOORS: [number, number][] = [
  [-64, -31],
  [-64, -19],
];
export const OUTBOUND_DOORS: [number, number][] = [
  [64, 10],
  [64, 20],
  [64, 30],
];

export interface MachineDef {
  id: string;
  name: string;
  group: WcGroup;
  zone: ZoneId;
  pos: [number, number];
  rot: number; // radians around Y
  tech: string;
  ratePerHour: number; // machine + labour rate EUR/h
  wearPerHour: number; // health loss per running hour
}

export const MACHINES: MachineDef[] = [
  { id: 'LAS-01', name: 'Laser blanking line', group: 'BLANK', zone: 'LASER', pos: [-29, -29], rot: 0, tech: '6 kW fibre laser, coil-fed blanking', ratePerHour: 145, wearPerHour: 2.2 },
  { id: 'LAS-02', name: '3D laser trimming cell 2', group: 'TRIM', zone: 'LASER', pos: [-17.5, -29], rot: 0, tech: '5-axis 4 kW laser trimming', ratePerHour: 132, wearPerHour: 2.4 },
  { id: 'LAS-03', name: '3D laser trimming cell 3', group: 'TRIM', zone: 'LASER', pos: [-17.5, -18], rot: 0, tech: '5-axis 4 kW laser trimming', ratePerHour: 132, wearPerHour: 2.4 },
  { id: 'PRESS-01', name: 'Transfer press 1,200 t', group: 'PRESS', zone: 'STAMP', pos: [-26, 12], rot: 0, tech: 'Servo-hydraulic transfer press, 1,200 t', ratePerHour: 210, wearPerHour: 2.8 },
  { id: 'PRESS-02', name: 'Progressive press 800 t', group: 'PRESS', zone: 'STAMP', pos: [-22, 28], rot: 0, tech: 'Progressive die press, 800 t', ratePerHour: 185, wearPerHour: 2.6 },
  { id: 'HF-01', name: 'Press hardening line', group: 'HOTFORM', zone: 'HOTFORM', pos: [11, 21], rot: 0, tech: 'Roller hearth furnace 930 °C + 1,000 t quench press', ratePerHour: 260, wearPerHour: 3.0 },
  { id: 'WELD-01', name: 'Robotic weld cell 1', group: 'WELD', zone: 'WELD', pos: [-6, -27], rot: 0, tech: '2 × 6-axis robots, MAG welding', ratePerHour: 118, wearPerHour: 2.5 },
  { id: 'WELD-02', name: 'Robotic weld cell 2', group: 'WELD', zone: 'WELD', pos: [4, -27], rot: 0, tech: '2 × 6-axis robots, MAG welding', ratePerHour: 118, wearPerHour: 2.5 },
  { id: 'WELD-03', name: 'Robotic weld cell 3', group: 'WELD', zone: 'WELD', pos: [14, -27], rot: 0, tech: '2 × 6-axis robots, MAG + stud welding', ratePerHour: 124, wearPerHour: 2.5 },
  { id: 'CNC-01', name: 'Machining centre', group: 'CNC', zone: 'MACH', pos: [25, 13], rot: 0, tech: '5-axis horizontal machining centre', ratePerHour: 128, wearPerHour: 1.8 },
  { id: 'KTL-01', name: 'Cathodic e-coat line', group: 'KTL', zone: 'KTL', pos: [33, -26], rot: 0, tech: 'Pre-treatment, KTL dip tank, curing oven 180 °C', ratePerHour: 240, wearPerHour: 1.6 },
  { id: 'QC-01', name: 'CMM inspection station', group: 'QC', zone: 'QC', pos: [40, 13], rot: 0, tech: 'Bridge CMM + visual inspection', ratePerHour: 74, wearPerHour: 0.8 },
];

export const machineDef = (id: string) => MACHINES.find((m) => m.id === id)!;

export const GROUP_NAMES: Record<WcGroup, string> = {
  BLANK: 'Laser blanking',
  PRESS: 'Stamping',
  HOTFORM: 'Hot forming',
  TRIM: 'Laser trimming',
  WELD: 'Robotic welding',
  CNC: 'Machining',
  KTL: 'KTL coating',
  QC: 'Quality inspection',
};

// Production supply areas: where staged components wait at the line.
export const PSA_FOR_GROUP: Partial<Record<WcGroup, string>> = {
  BLANK: 'PSA-LAS',
  PRESS: 'PSA-PRS',
  HOTFORM: 'PSA-HF',
  WELD: 'PSA-WLD',
  KTL: 'PSA-KTL',
  CNC: 'PSA-CNC',
};

// ---------------------------------------------------------------------------
// Storage bins

interface RackSpec {
  wh: string;
  rack: string;
  zone: ZoneId;
  x: number;
  accessX: number;
  zStart: number;
  bays: number;
  bayPitch: number;
  levels: number;
  levelPitch: number;
  type: BinType;
  capacity: number;
}

const RACKS: RackSpec[] = [
  { wh: 'WH01', rack: 'A', zone: 'RM', x: -49.4, accessX: -46, zStart: -34.5, bays: 6, bayPitch: 3.6, levels: 3, levelPitch: 1.7, type: 'RACK', capacity: 2 },
  { wh: 'WH01', rack: 'B', zone: 'RM', x: -42.6, accessX: -46, zStart: -34.5, bays: 6, bayPitch: 3.6, levels: 3, levelPitch: 1.7, type: 'RACK', capacity: 2 },
  { wh: 'WH03', rack: 'C', zone: 'FG', x: 50, accessX: 53.1, zStart: -34.5, bays: 6, bayPitch: 3.6, levels: 4, levelPitch: 1.6, type: 'FGRACK', capacity: 2 },
  { wh: 'WH03', rack: 'D', zone: 'FG', x: 56.2, accessX: 53.1, zStart: -34.5, bays: 6, bayPitch: 3.6, levels: 4, levelPitch: 1.6, type: 'FGRACK', capacity: 2 },
  { wh: 'WH03', rack: 'E', zone: 'FG', x: 61.6, accessX: 58.9, zStart: -34.5, bays: 6, bayPitch: 3.6, levels: 4, levelPitch: 1.6, type: 'FGRACK', capacity: 2 },
  { wh: 'WH04', rack: 'M', zone: 'MAINT', x: -60, accessX: -57.5, zStart: 30.5, bays: 3, bayPitch: 2.6, levels: 3, levelPitch: 1.2, type: 'SPARE', capacity: 3 },
];

export const RACK_DEFS = RACKS;

const pad = (n: number) => String(n).padStart(2, '0');

function buildBins(): BinDef[] {
  const bins: BinDef[] = [];
  for (const r of RACKS) {
    for (let b = 0; b < r.bays; b++) {
      for (let l = 0; l < r.levels; l++) {
        const z = r.zStart + b * r.bayPitch;
        bins.push({
          id: `${r.wh}-${r.rack}-${pad(b + 1)}-${l + 1}`,
          zone: r.zone,
          type: r.type,
          capacity: r.capacity,
          pos: [r.x, 0.15 + l * r.levelPitch, z],
          rack: `${r.wh}-${r.rack}`,
          level: l + 1,
        });
      }
    }
  }
  // Sheet metal storage: floor stack bays
  let n = 1;
  for (const x of [-49.5, -42.5]) {
    for (const z of [6.5, 11.5, 16.5, 21.5]) {
      bins.push({ id: `WH02-S-${pad(n)}`, zone: 'SHEET', type: 'SHEET', capacity: 6, pos: [x, 0, z], rack: 'WH02-S', level: 1 });
      n++;
    }
  }
  // Production supply areas
  const psa: [string, ZoneId, number, number][] = [
    ['PSA-LAS', 'LASER', -29, -15],
    ['PSA-PRS', 'STAMP', -24, 6],
    ['PSA-HF', 'HOTFORM', -7, 14.5],
    ['PSA-WLD', 'WELD', 4, -15],
    ['PSA-KTL', 'KTL', 25, -14],
    ['PSA-CNC', 'MACH', 20.5, 6],
  ];
  for (const [id, zone, x, z] of psa) bins.push({ id, zone, type: 'PSA', capacity: 8, pos: [x, 0, z] });
  // Docks and QA output
  INBOUND_DOORS.forEach(([, z], i) => bins.push({ id: `DOCK-IN-${i + 1}`, zone: 'INBOUND', type: 'DOCK', capacity: 40, pos: [-58.5, 0, z] }));
  OUTBOUND_DOORS.forEach(([, z], i) => bins.push({ id: `DOCK-OUT-${i + 1}`, zone: 'SHIP', type: 'DOCK', capacity: 40, pos: [58.5, 0, z] }));
  bins.push({ id: 'QA-OUT', zone: 'QC', type: 'QA', capacity: 30, pos: [44.5, 0, 7] });
  return bins;
}

export const BINS: BinDef[] = buildBins();
export const BIN_MAP: Record<string, BinDef> = Object.fromEntries(BINS.map((b) => [b.id, b]));

/** Point on the floor where a forklift stops to serve a bin. */
export function accessPoint(binId: string): [number, number] {
  const bin = BIN_MAP[binId];
  if (!bin) return [0, AISLE_Z];
  if (bin.rack) {
    const spec = RACKS.find((r) => `${r.wh}-${r.rack}` === bin.rack);
    if (spec) return [spec.accessX, bin.pos[2]];
    if (bin.type === 'SHEET') return [-46, bin.pos[2]];
  }
  return [bin.pos[0], bin.pos[2]];
}

/** Manhattan route through the main aisle, as a list of floor points. */
export function routeBetween(fromBin: string, toBin: string): [number, number][] {
  const a = accessPoint(fromBin);
  const b = accessPoint(toBin);
  const pts: [number, number][] = [a, [a[0], AISLE_Z], [b[0], AISLE_Z], b];
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
}

export function routeLength(pts: [number, number][]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return d;
}

export const FORKLIFT_HOMES: Record<string, [number, number, number]> = {
  'FL-01': [-46, 0, -8],
  'FL-02': [-34, 0, 0],
  'FL-03': [30, 0, -8],
  'FL-04': [53, 0, -8],
};
