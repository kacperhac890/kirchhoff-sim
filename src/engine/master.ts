// Master data for the simulated plant "1000 – Gliwice (training)".
// All names, numbers, suppliers, customers and recipes are invented for training.
import type { Material, WcGroup } from './types';

export const PLANT = { id: '1000', name: 'Plant 1000 · Gliwice (training simulation)' };

export const MATERIALS: Record<string, Material> = {
  'RM-S355': { id: 'RM-S355', name: 'Steel sheet S355MC 2.5 mm', type: 'RAW', uom: 'KG', price: 0.98, binType: 'SHEET', perPallet: 1000, description: 'Hot-rolled high-strength micro-alloyed steel for cold-formed structural parts. Stored as 1,000 kg sheet bundles.' },
  'RM-22MNB5': { id: 'RM-22MNB5', name: 'Boron steel 22MnB5 AlSi blanks', type: 'RAW', uom: 'KG', price: 1.35, binType: 'SHEET', perPallet: 1000, qmIncoming: true, description: 'Press-hardening steel with AlSi coating. Reaches ~1,500 MPa after hot forming and quenching. Incoming inspection required.' },
  'RM-WIRE': { id: 'RM-WIRE', name: 'Welding wire G3Si1 Ø1.2 mm', type: 'RAW', uom: 'KG', price: 2.1, binType: 'RACK', perPallet: 250, description: 'Solid MAG welding wire supplied in 250 kg drums.' },
  'RM-KTL': { id: 'RM-KTL', name: 'Cathodic e-coat paint (KTL)', type: 'RAW', uom: 'L', price: 6.4, binType: 'RACK', perPallet: 1000, description: 'Epoxy-based cathodic electrodeposition paint, 1,000 L IBC containers.' },
  'RM-NUT': { id: 'RM-NUT', name: 'Weld nut M10 DIN 929', type: 'RAW', uom: 'PC', price: 0.06, binType: 'RACK', perPallet: 20000, description: 'Hexagon weld nuts, projection welded into crossmembers.' },
  'RM-TUBE': { id: 'RM-TUBE', name: 'Axle tube Ø90 × 6 mm', type: 'RAW', uom: 'PC', price: 11.2, binType: 'RACK', perPallet: 60, description: 'Seamless tube for the axle housing training family.' },
  'FG-CM-4410': { id: 'FG-CM-4410', name: 'Front crossmember CM-4410', type: 'FIN', uom: 'PC', price: 48.5, binType: 'FGRACK', perPallet: 40, description: 'Welded front-axle crossmember, stamped S355MC with weld nuts, KTL coated.' },
  'FG-BR-2207': { id: 'FG-BR-2207', name: 'Suspension bracket BR-2207', type: 'FIN', uom: 'PC', price: 9.8, binType: 'FGRACK', perPallet: 200, description: 'Stamped and trimmed suspension bracket, KTL coated.' },
  'FG-SR-7130': { id: 'FG-SR-7130', name: 'Side rail reinforcement SR-7130', type: 'FIN', uom: 'PC', price: 27.4, binType: 'FGRACK', perPallet: 60, description: 'Press-hardened 22MnB5 reinforcement, laser trimmed and welded.' },
  'FG-AXH-900': { id: 'FG-AXH-900', name: 'Axle housing AXH-900 (training family)', type: 'FIN', uom: 'PC', price: 142, binType: 'FGRACK', perPallet: 12, description: 'Welded and machined axle housing. Separate training product family.' },
  'SP-HYD-SEAL': { id: 'SP-HYD-SEAL', name: 'Hydraulic seal kit, press ram', type: 'SPARE', uom: 'PC', price: 420, binType: 'SPARE', perPallet: 20, description: 'Seal kit for the press main cylinder.' },
  'SP-WELD-TIP': { id: 'SP-WELD-TIP', name: 'MAG torch consumables set', type: 'SPARE', uom: 'PC', price: 38, binType: 'SPARE', perPallet: 100, description: 'Contact tips, nozzles and liners for robot torches.' },
  'SP-LASER-NOZ': { id: 'SP-LASER-NOZ', name: 'Laser nozzle & protective glass', type: 'SPARE', uom: 'PC', price: 95, binType: 'SPARE', perPallet: 50, description: 'Cutting head wear parts.' },
  'SP-SERVO': { id: 'SP-SERVO', name: 'Servo motor 7 kW (robot axis)', type: 'SPARE', uom: 'PC', price: 2850, binType: 'SPARE', perPallet: 4, description: 'Replacement drive for robot axes 2–3.' },
  'SP-BELT': { id: 'SP-BELT', name: 'Conveyor chain section', type: 'SPARE', uom: 'PC', price: 260, binType: 'SPARE', perPallet: 10, description: 'Overhead conveyor chain for the KTL line.' },
  'SP-THERMO': { id: 'SP-THERMO', name: 'Furnace thermocouple type K', type: 'SPARE', uom: 'PC', price: 180, binType: 'SPARE', perPallet: 20, description: 'Zone thermocouple for the roller hearth furnace.' },
};

export const mat = (id: string) => MATERIALS[id];

export interface RoutingOp {
  no: string;
  name: string;
  group: WcGroup;
  setupMin: number;
  cycleSec: number;
  scrapRate: number;
}
export interface BomItem {
  material: string;
  qtyPer: number;
  op: string; // operation that consumes it
}
export interface Product {
  id: string;
  family: string;
  bom: BomItem[];
  routing: RoutingOp[];
}

export const PRODUCTS: Record<string, Product> = {
  'FG-CM-4410': {
    id: 'FG-CM-4410',
    family: 'Crossmembers',
    bom: [
      { material: 'RM-S355', qtyPer: 3.2, op: '0010' },
      { material: 'RM-NUT', qtyPer: 4, op: '0040' },
      { material: 'RM-WIRE', qtyPer: 0.05, op: '0040' },
      { material: 'RM-KTL', qtyPer: 0.14, op: '0050' },
    ],
    routing: [
      { no: '0010', name: 'Material preparation – laser blanking', group: 'BLANK', setupMin: 20, cycleSec: 5, scrapRate: 0.004 },
      { no: '0020', name: 'Stamping – transfer die', group: 'PRESS', setupMin: 35, cycleSec: 7, scrapRate: 0.006 },
      { no: '0030', name: 'Laser trimming', group: 'TRIM', setupMin: 15, cycleSec: 11, scrapRate: 0.004 },
      { no: '0040', name: 'Robotic welding + weld nuts', group: 'WELD', setupMin: 20, cycleSec: 16, scrapRate: 0.005 },
      { no: '0050', name: 'KTL corrosion protection', group: 'KTL', setupMin: 10, cycleSec: 4, scrapRate: 0.002 },
      { no: '0060', name: 'Final quality inspection', group: 'QC', setupMin: 5, cycleSec: 3, scrapRate: 0 },
    ],
  },
  'FG-BR-2207': {
    id: 'FG-BR-2207',
    family: 'Brackets',
    bom: [
      { material: 'RM-S355', qtyPer: 0.9, op: '0010' },
      { material: 'RM-KTL', qtyPer: 0.04, op: '0030' },
    ],
    routing: [
      { no: '0010', name: 'Stamping – progressive die', group: 'PRESS', setupMin: 30, cycleSec: 3, scrapRate: 0.005 },
      { no: '0020', name: 'Laser trimming', group: 'TRIM', setupMin: 10, cycleSec: 6, scrapRate: 0.003 },
      { no: '0030', name: 'KTL corrosion protection', group: 'KTL', setupMin: 10, cycleSec: 2, scrapRate: 0.002 },
      { no: '0040', name: 'Final quality inspection', group: 'QC', setupMin: 5, cycleSec: 2, scrapRate: 0 },
    ],
  },
  'FG-SR-7130': {
    id: 'FG-SR-7130',
    family: 'Press-hardened reinforcements',
    bom: [
      { material: 'RM-22MNB5', qtyPer: 4.1, op: '0010' },
      { material: 'RM-WIRE', qtyPer: 0.03, op: '0030' },
      { material: 'RM-KTL', qtyPer: 0.1, op: '0040' },
    ],
    routing: [
      { no: '0010', name: 'Hot forming – furnace + quench press', group: 'HOTFORM', setupMin: 45, cycleSec: 14, scrapRate: 0.007 },
      { no: '0020', name: '3D laser trimming', group: 'TRIM', setupMin: 15, cycleSec: 18, scrapRate: 0.004 },
      { no: '0030', name: 'Robotic welding', group: 'WELD', setupMin: 15, cycleSec: 10, scrapRate: 0.004 },
      { no: '0040', name: 'KTL corrosion protection', group: 'KTL', setupMin: 10, cycleSec: 4, scrapRate: 0.002 },
      { no: '0050', name: 'Final quality inspection', group: 'QC', setupMin: 5, cycleSec: 3, scrapRate: 0 },
    ],
  },
  'FG-AXH-900': {
    id: 'FG-AXH-900',
    family: 'Axle housings (training)',
    bom: [
      { material: 'RM-S355', qtyPer: 18.5, op: '0010' },
      { material: 'RM-TUBE', qtyPer: 2, op: '0030' },
      { material: 'RM-WIRE', qtyPer: 0.22, op: '0030' },
      { material: 'RM-KTL', qtyPer: 0.4, op: '0050' },
    ],
    routing: [
      { no: '0010', name: 'Laser blanking', group: 'BLANK', setupMin: 25, cycleSec: 12, scrapRate: 0.004 },
      { no: '0020', name: 'Deep drawing – shells', group: 'PRESS', setupMin: 40, cycleSec: 20, scrapRate: 0.008 },
      { no: '0030', name: 'Robotic welding – shells + tubes', group: 'WELD', setupMin: 25, cycleSec: 45, scrapRate: 0.006 },
      { no: '0040', name: 'Machining – flange faces & bores', group: 'CNC', setupMin: 30, cycleSec: 90, scrapRate: 0.005 },
      { no: '0050', name: 'KTL corrosion protection', group: 'KTL', setupMin: 10, cycleSec: 8, scrapRate: 0.002 },
      { no: '0060', name: 'Final quality inspection', group: 'QC', setupMin: 10, cycleSec: 10, scrapRate: 0 },
    ],
  },
};

export interface CharSpec {
  code: string;
  name: string;
  unit: string;
  lsl: number;
  usl: number;
  target: number;
}

export const FINAL_CHARS: CharSpec[] = [
  { code: 'DIM-01', name: 'Mounting hole position (CMM)', unit: 'mm', lsl: -0.5, usl: 0.5, target: 0 },
  { code: 'KTL-02', name: 'E-coat thickness', unit: 'µm', lsl: 15, usl: 30, target: 22 },
  { code: 'WLD-03', name: 'Weld seam length / visual', unit: 'mm', lsl: 38, usl: 46, target: 42 },
];
export const INCOMING_CHARS: CharSpec[] = [
  { code: 'MAT-01', name: 'Tensile strength (certificate check)', unit: 'MPa', lsl: 500, usl: 700, target: 600 },
  { code: 'MAT-02', name: 'Coating mass AlSi', unit: 'g/m²', lsl: 120, usl: 180, target: 150 },
  { code: 'MAT-03', name: 'Thickness', unit: 'mm', lsl: 1.45, usl: 1.55, target: 1.5 },
];

export interface Quote {
  supplier: string;
  material: string;
  price: number;
  leadHours: number;
}
export interface Supplier {
  id: string;
  name: string;
  city: string;
  country: 'PL' | 'DE' | 'CZ';
  reliability: number; // probability of on-time delivery
  quality: number; // probability a batch is defect-free
}

export const SUPPLIERS: Record<string, Supplier> = {
  'SUP-1001': { id: 'SUP-1001', name: 'Śląska Stal Service Centre', city: 'Katowice', country: 'PL', reliability: 0.92, quality: 0.97 },
  'SUP-1002': { id: 'SUP-1002', name: 'Rhein Steel Distribution', city: 'Duisburg', country: 'DE', reliability: 0.8, quality: 0.99 },
  'SUP-1003': { id: 'SUP-1003', name: 'Weldtec Polska', city: 'Gliwice', country: 'PL', reliability: 0.95, quality: 0.99 },
  'SUP-1004': { id: 'SUP-1004', name: 'Coatings Europe', city: 'Ostrava', country: 'CZ', reliability: 0.88, quality: 0.98 },
  'SUP-1005': { id: 'SUP-1005', name: 'Hydraulik Service', city: 'Dresden', country: 'DE', reliability: 0.9, quality: 1 },
  'SUP-1006': { id: 'SUP-1006', name: 'Tube & Profile', city: 'Częstochowa', country: 'PL', reliability: 0.86, quality: 0.97 },
};

export const QUOTES: Quote[] = [
  { supplier: 'SUP-1001', material: 'RM-S355', price: 0.98, leadHours: 6 },
  { supplier: 'SUP-1002', material: 'RM-S355', price: 0.93, leadHours: 20 },
  { supplier: 'SUP-1002', material: 'RM-22MNB5', price: 1.31, leadHours: 24 },
  { supplier: 'SUP-1001', material: 'RM-22MNB5', price: 1.42, leadHours: 10 },
  { supplier: 'SUP-1003', material: 'RM-WIRE', price: 2.1, leadHours: 8 },
  { supplier: 'SUP-1003', material: 'RM-NUT', price: 0.06, leadHours: 8 },
  { supplier: 'SUP-1004', material: 'RM-KTL', price: 6.4, leadHours: 12 },
  { supplier: 'SUP-1006', material: 'RM-TUBE', price: 11.2, leadHours: 14 },
  { supplier: 'SUP-1005', material: 'SP-HYD-SEAL', price: 420, leadHours: 10 },
  { supplier: 'SUP-1005', material: 'SP-SERVO', price: 2850, leadHours: 16 },
  { supplier: 'SUP-1003', material: 'SP-WELD-TIP', price: 38, leadHours: 6 },
  { supplier: 'SUP-1005', material: 'SP-LASER-NOZ', price: 95, leadHours: 10 },
  { supplier: 'SUP-1005', material: 'SP-BELT', price: 260, leadHours: 12 },
  { supplier: 'SUP-1005', material: 'SP-THERMO', price: 180, leadHours: 8 },
];

export interface Customer {
  id: string;
  name: string;
  city: string;
  country: 'PL' | 'DE';
  km: number;
  transitHours: number;
}
export const CUSTOMERS: Record<string, Customer> = {
  'C-2001': { id: 'C-2001', name: 'Tychy Vehicle Assembly', city: 'Tychy', country: 'PL', km: 34, transitHours: 1 },
  'C-2002': { id: 'C-2002', name: 'Gliwice Body Works', city: 'Gliwice', country: 'PL', km: 9, transitHours: 0.5 },
  'C-2003': { id: 'C-2003', name: 'Wrocław Chassis Systems', city: 'Wrocław', country: 'PL', km: 176, transitHours: 2.5 },
  'C-2004': { id: 'C-2004', name: 'Zwickau Fahrzeugmontage', city: 'Zwickau', country: 'DE', km: 521, transitHours: 7 },
  'C-2005': { id: 'C-2005', name: 'Ingolstadt Achsmodule', city: 'Ingolstadt', country: 'DE', km: 782, transitHours: 10 },
};

export interface Carrier {
  id: string;
  name: string;
  ratePerKm: number;
  minCharge: number;
  reliability: number;
  vehicles: { id: string; plate: string; type: string; pallets: number }[];
}
export const CARRIERS: Record<string, Carrier> = {
  'CR-01': { id: 'CR-01', name: 'Silesia Trans', ratePerKm: 1.15, minCharge: 180, reliability: 0.9, vehicles: [ { id: 'V-11', plate: 'SG 4K217', type: 'Curtainsider 13.6 m', pallets: 33 }, { id: 'V-12', plate: 'SG 7M402', type: 'Curtainsider 13.6 m', pallets: 33 } ] },
  'CR-02': { id: 'CR-02', name: 'EuroFreight Logistics', ratePerKm: 1.38, minCharge: 240, reliability: 0.97, vehicles: [ { id: 'V-21', plate: 'SK 1EF88', type: 'Mega trailer', pallets: 34 }, { id: 'V-22', plate: 'DD-EF 312', type: 'Curtainsider 13.6 m', pallets: 33 } ] },
  'CR-03': { id: 'CR-03', name: 'Budget Cargo', ratePerKm: 0.94, minCharge: 150, reliability: 0.74, vehicles: [ { id: 'V-31', plate: 'SGL 55021', type: 'Box truck 7.5 t', pallets: 15 } ] },
};

export interface FailureMode {
  code: string;
  text: string;
  skill: 'MECH' | 'ELEC' | 'HYD';
  part?: string;
  partQty: number;
  durationMin: number;
}
export const FAILURES: Record<WcGroup, FailureMode[]> = {
  PRESS: [ { code: 'P-HYD-LEAK', text: 'Hydraulic pressure drop – ram seal leak', skill: 'HYD', part: 'SP-HYD-SEAL', partQty: 1, durationMin: 150 } ],
  BLANK: [ { code: 'L-NOZZLE', text: 'Cut quality alarm – nozzle contamination', skill: 'MECH', part: 'SP-LASER-NOZ', partQty: 1, durationMin: 50 } ],
  TRIM: [ { code: 'L-NOZZLE', text: 'Cut quality alarm – nozzle contamination', skill: 'MECH', part: 'SP-LASER-NOZ', partQty: 1, durationMin: 50 } ],
  WELD: [
    { code: 'W-TORCH', text: 'Torch collision / wire feed fault', skill: 'MECH', part: 'SP-WELD-TIP', partQty: 2, durationMin: 60 },
    { code: 'W-SERVO', text: 'Robot axis 3 servo overload', skill: 'ELEC', part: 'SP-SERVO', partQty: 1, durationMin: 180 },
  ],
  HOTFORM: [ { code: 'H-TEMP', text: 'Furnace zone 4 temperature deviation', skill: 'ELEC', part: 'SP-THERMO', partQty: 1, durationMin: 120 } ],
  KTL: [ { code: 'K-CHAIN', text: 'Overhead conveyor chain jam', skill: 'MECH', part: 'SP-BELT', partQty: 1, durationMin: 90 } ],
  CNC: [ { code: 'C-SPINDLE', text: 'Spindle vibration alarm', skill: 'MECH', partQty: 0, durationMin: 90 } ],
  QC: [ { code: 'Q-PROBE', text: 'CMM probe calibration error', skill: 'ELEC', partQty: 0, durationMin: 40 } ],
};

const FIRST = ['Adam', 'Marta', 'Piotr', 'Anna', 'Tomasz', 'Ewa', 'Krzysztof', 'Agnieszka', 'Michał', 'Kasia', 'Paweł', 'Joanna', 'Łukasz', 'Monika', 'Jakub', 'Ola', 'Marek', 'Natalia', 'Bartek', 'Iwona', 'Grzegorz', 'Zofia', 'Rafał', 'Beata', 'Dawid', 'Lena', 'Sebastian', 'Klara', 'Wojciech', 'Julia', 'Kamil', 'Magda', 'Jan', 'Hanna', 'Artur', 'Ilona'];
const LAST = ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski', 'Jankowski', 'Mazur', 'Kwiatkowski', 'Krawczyk', 'Piotrowski', 'Grabowski', 'Pawłowski', 'Michalski', 'Król', 'Wieczorek', 'Jabłoński', 'Majewski', 'Olszewski', 'Stępień', 'Malinowski', 'Jaworski', 'Adamczyk', 'Dudek', 'Nowicki', 'Pawlak', 'Sikora', 'Walczak', 'Baran', 'Rutkowski', 'Michalak'];
/** Polish surnames ending in -ski/-cki/-dzki take the feminine form -ska/-cka/-dzka. */
const surname = (first: string, last: string) => (/a$/.test(first) && /(ski|cki|dzki)$/.test(last) ? last.slice(0, -1) + 'a' : last);

export function makeEmployees() {
  const list: { id: string; name: string; role: 'OPERATOR' | 'TECH' | 'WAREHOUSE' | 'INSPECTOR'; shift: 1 | 2 | 3; skill?: 'MECH' | 'ELEC' | 'HYD' }[] = [];
  let n = 0;
  const add = (role: 'OPERATOR' | 'TECH' | 'WAREHOUSE' | 'INSPECTOR', shift: 1 | 2 | 3, skill?: 'MECH' | 'ELEC' | 'HYD') => {
    list.push({ id: `E-${101 + n}`, name: `${FIRST[n % FIRST.length]} ${surname(FIRST[n % FIRST.length], LAST[(n * 7) % LAST.length])}`, role, shift, skill });
    n++;
  };
  // Operators: 12 on morning, 11 on afternoon, 7 on night shift.
  for (let i = 0; i < 12; i++) add('OPERATOR', 1);
  for (let i = 0; i < 11; i++) add('OPERATOR', 2);
  for (let i = 0; i < 7; i++) add('OPERATOR', 3);
  add('TECH', 1, 'HYD');
  add('TECH', 1, 'ELEC');
  add('TECH', 1, 'MECH');
  add('TECH', 2, 'MECH');
  add('TECH', 2, 'HYD');
  add('TECH', 3, 'ELEC');
  for (const s of [1, 2, 3] as const) add('WAREHOUSE', s);
  for (const s of [1, 2] as const) add('INSPECTOR', s);
  return list;
}

export const SKILL_NAMES = { MECH: 'Mechanical', ELEC: 'Electrical', HYD: 'Hydraulics' } as const;
