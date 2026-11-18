// Training missions. Each step is a predicate over the simulation state —
// the mission advances only when the ERP really contains the result.
import {
  docsOf,
  getDoc,
  triggerBreakdown,
  breakdownEvent,
  pushEvent,
  type ProductionOrder,
  type RoleId,
  type ScenarioId,
  type SimState,
  type TCode,
} from '../engine';

export interface MissionCtx {
  trail: Set<string>;
  startedAt: number;
}

export interface MissionStep {
  id: string;
  title: string;
  role: RoleId;
  instruction: string;
  why: string; // shown after completion: what happened in the ERP and why it matters
  route: string; // "Show me" target
  focus?: string; // 3D selection or element hint
  tcode?: TCode;
  check: (s: SimState, ctx: MissionCtx) => boolean;
  progress?: (s: SimState) => string;
}

export interface Mission {
  id: ScenarioId;
  code: string;
  title: string;
  subtitle: string;
  department: string;
  rank: RoleId;
  xp: number;
  certification: string;
  brief: string;
  tcodes: TCode[];
  steps: MissionStep[];
  onTick?: (s: SimState, ctx: MissionCtx) => void;
  recommendedSpeed?: number;
}

const ppFor = (s: SimState, product: string, created?: number): ProductionOrder | undefined =>
  docsOf(s, 'PP')
    .filter((p) => p.product === product && p.status !== 'CANCELLED' && (created === undefined || p.createdAt >= created))
    .sort((a, b) => b.qty - a.qty)[0];

const m01Order = (s: SimState) => docsOf(s, 'PP').find((p) => p.product === 'FG-CM-4410' && p.qty === 500 && p.status !== 'CANCELLED');
const m01Lot = (s: SimState) => {
  const pp = m01Order(s);
  const op = pp?.ops.find((o) => o.inspectionLot);
  return op ? getDoc(s, op.inspectionLot, 'IL') : undefined;
};
const so1 = (s: SimState) => docsOf(s, 'SO')[0];
const dlvFor = (s: SimState, so?: string) => docsOf(s, 'DLV').find((d) => d.salesOrder === so && d.status !== 'CANCELLED');

export const MISSIONS: Mission[] = [
  {
    id: 'M01',
    code: 'MISSION 01',
    title: 'From coil to customer',
    subtitle: 'Receive steel, produce 500 crossmembers, inspect, store and ship',
    department: 'Plant onboarding',
    rank: 'NEW',
    xp: 400,
    certification: 'Plant onboarding — end-to-end flow',
    brief:
      'A truck from Śląska Stal Service Centre is at inbound door 1 with 2,000 kg of S355MC steel sheet. Tychy Vehicle Assembly has ordered 450 front crossmembers CM-4410 for Tuesday 14:00. Take the material all the way from the dock to the customer\'s truck.',
    tcodes: ['MIGO_GR', 'CO01', 'CO02', 'CO_STAGE', 'CO11N', 'QA32', 'CO_GR', 'VL01N', 'VL_PICK', 'VT01N', 'VL_PGI', 'MIGO_TR', 'MI01'],
    recommendedSpeed: 5,
    steps: [
      {
        id: 'open-inbound',
        title: 'Locate the incoming delivery',
        role: 'WAREHOUSE',
        instruction: 'Open Warehouse → Inbound. Find the delivery from Śląska Stal at door 1 and look at its purchase order.',
        why: 'An inbound delivery is the supplier\'s announcement of what is on the truck. It references the purchase order, so the system knows the price, the agreed quantity and who ordered it.',
        route: '#/warehouse/inbound',
        tcode: 'MIGO_GR',
        check: (_s, c) => c.trail.has('warehouse.inbound'),
      },
      {
        id: 'count',
        title: 'Verify the quantity',
        role: 'WAREHOUSE',
        instruction: 'Select the delivery and press “Count at dock”. Compare the counted quantity with the delivery note.',
        why: 'The delivery note is the supplier\'s claim. Only a physical count tells you what really arrived. If you post an unchecked quantity, the ERP stock (book stock) and the shelf (physical stock) drift apart.',
        route: '#/warehouse/inbound',
        tcode: 'MIGO_GR',
        check: (s) => docsOf(s, 'IBD').some((d) => d.items.every((i) => i.counted !== undefined)),
      },
      {
        id: 'gr',
        title: 'Register the goods receipt',
        role: 'WAREHOUSE',
        instruction: 'Post the goods receipt (MIGO, movement 101) with the counted quantity and assign a storage bin in sheet metal storage WH02.',
        why: 'Movement 101 created a material document, increased stock, updated the purchase order history and created a batch for traceability. A warehouse task now tells a forklift where to take the bundles.',
        route: '#/warehouse/inbound',
        tcode: 'MIGO_GR',
        check: (s) => docsOf(s, 'IBD').some((d) => d.status === 'COMPLETED'),
      },
      {
        id: 'putaway',
        title: 'Store the material',
        role: 'WAREHOUSE',
        instruction: 'Watch the forklift move the steel from the dock to the bin you selected (3D view). The put-away is confirmed when it arrives.',
        why: 'Until the warehouse task is confirmed the steel sits at the dock and cannot be reserved. Confirmation moves the stock to its bin — exactly where the next picker will look for it.',
        route: '#/factory',
        focus: 'zone:SHEET',
        check: (s) => docsOf(s, 'WT').some((w) => w.kind === 'PUTAWAY' && w.status === 'COMPLETED'),
      },
      {
        id: 'create-order',
        title: 'Create the production order',
        role: 'PLANNER',
        instruction: 'Production → Create order: 500 pcs of front crossmember FG-CM-4410.',
        why: 'The order copied the bill of materials (steel, weld nuts, wire, e-coat paint) and the 6-step routing from master data, scheduled the operations and calculated planned costs.',
        route: '#/production/create',
        tcode: 'CO01',
        check: (s) => !!m01Order(s),
      },
      {
        id: 'release',
        title: 'Release the order',
        role: 'PLANNER',
        instruction: 'Open the order and press “Release”. The availability check must find 1,600 kg of steel.',
        why: 'Release ran the availability check and created reservations. Reserved steel is still in WH02 but no other order can take it.',
        route: '#/production',
        tcode: 'CO02',
        check: (s) => {
          const pp = m01Order(s);
          return !!pp && pp.status !== 'CREATED';
        },
      },
      {
        id: 'stage',
        title: 'Stage the components to the line',
        role: 'WAREHOUSE',
        instruction: 'Press “Stage components”. Forklifts bring steel to the laser line, nuts and wire to welding, paint to KTL.',
        why: 'Staging moves reserved material to production supply areas next to the machines. Production can start only when every component is there.',
        route: '#/production',
        tcode: 'CO_STAGE',
        check: (s) => !!m01Order(s)?.stagingDone,
        progress: (s) => {
          const pp = m01Order(s);
          if (!pp) return '';
          return `${pp.components.filter((c) => c.staged + c.issued >= c.required - 1e-6).length}/${pp.components.length} components staged`;
        },
      },
      {
        id: 'produce',
        title: 'Run and confirm production',
        role: 'PROD_OP',
        instruction: 'Watch the laser, press, trimming, welding and KTL lines in the 3D view. Confirm each finished operation (CO11N) with the yield and scrap from the machine counter. Speed time up to ×5 or ×10.',
        why: 'Each confirmation reported good parts and scrap. Only the good parts flow to the next operation, and the machine time is charged to the order as conversion cost.',
        route: '#/production',
        focus: 'machine:PRESS-01',
        tcode: 'CO11N',
        check: (s) => {
          const pp = m01Order(s);
          return !!pp && pp.ops.filter((o) => o.wcGroup !== 'QC').every((o) => o.status === 'CONFIRMED');
        },
        progress: (s) => {
          const pp = m01Order(s);
          if (!pp) return '';
          const ops = pp.ops.filter((o) => o.wcGroup !== 'QC');
          return `${ops.filter((o) => o.status === 'CONFIRMED').length}/${ops.length} operations confirmed`;
        },
      },
      {
        id: 'results',
        title: 'Record inspection results',
        role: 'QUALITY',
        instruction: 'Quality → Inspection lots. When the CMM has finished, enter each measured value exactly as the instrument shows it.',
        why: 'The inspection lot was created automatically when the parts reached QC-01. Results are valued against tolerance limits — the system, not the inspector\'s mood, decides whether a characteristic passes.',
        route: '#/quality',
        tcode: 'QA32',
        check: (s) => !!m01Lot(s)?.resultsRecorded,
      },
      {
        id: 'ud',
        title: 'Make the usage decision',
        role: 'QUALITY',
        instruction: 'All characteristics are within tolerance — accept the lot.',
        why: 'The usage decision released the batch. Had you rejected it, the parts would go to blocked stock and could never be shipped.',
        route: '#/quality',
        tcode: 'QA32',
        check: (s) => !!m01Lot(s)?.decision,
      },
      {
        id: 'confirm-qc',
        title: 'Confirm the inspection operation',
        role: 'PROD_OP',
        instruction: 'Back in Production, confirm operation 0060 (final inspection).',
        why: 'All operations are now finally confirmed — the order is ready for goods receipt.',
        route: '#/production',
        tcode: 'CO11N',
        check: (s) => !!m01Order(s)?.ops.every((o) => o.status === 'CONFIRMED'),
      },
      {
        id: 'fg-gr',
        title: 'Receive finished goods',
        role: 'PROD_OP',
        instruction: 'Post the goods receipt for the order into finished goods racks WH03 (the proposal selects enough free bins).',
        why: 'Movement 101 against the production order put the crossmembers into unrestricted stock with batch traceability and closed the order. Actual costs are now final.',
        route: '#/production',
        tcode: 'CO_GR',
        check: (s) => m01Order(s)?.status === 'COMPLETED',
      },
      {
        id: 'delivery',
        title: 'Create the outbound delivery',
        role: 'LOGISTICS',
        instruction: 'Logistics → Sales orders: create a delivery for 450 pcs for Tychy Vehicle Assembly (sales order 1200101).',
        why: 'The delivery checked availability (ATP) and fixed the quantity, dock and date. It is the warehouse\'s work order for picking.',
        route: '#/logistics',
        tcode: 'VL01N',
        check: (s) => !!dlvFor(s, so1(s)?.id),
      },
      {
        id: 'pick',
        title: 'Pick and pack',
        role: 'LOGISTICS',
        instruction: 'Start picking. When all pallets are at the dock, pack the delivery into handling units.',
        why: 'Picking tasks moved the FIFO batches to the outbound dock. Packing created handling units (pallets) — that is what the truck is planned on.',
        route: '#/logistics/deliveries',
        tcode: 'VL_PICK',
        check: (s) => !!dlvFor(s, so1(s)?.id)?.packed,
      },
      {
        id: 'shipment',
        title: 'Plan the shipment',
        role: 'LOGISTICS',
        instruction: 'Create a shipment: choose a carrier and a truck. Compare price and reliability.',
        why: 'The shipment booked the carrier, calculated freight cost and scheduled the truck at your dock.',
        route: '#/logistics/deliveries',
        tcode: 'VT01N',
        check: (s) => !!dlvFor(s, so1(s)?.id)?.shipment,
      },
      {
        id: 'pgi',
        title: 'Post goods issue and dispatch',
        role: 'LOGISTICS',
        instruction: 'When the truck is loaded, post goods issue (movement 601). The truck leaves the plant.',
        why: 'Goods issue reduced stock, recognised the revenue and started delivery tracking. The document flow now connects purchase order → goods receipt → production → inspection → delivery → shipment.',
        route: '#/logistics/deliveries',
        tcode: 'VL_PGI',
        check: (s) => !!dlvFor(s, so1(s)?.id)?.pgi,
      },
    ],
  },
  {
    id: 'M02',
    code: 'MISSION 02',
    title: 'Press down',
    subtitle: 'React to a hydraulic breakdown during a running order',
    department: 'Plant maintenance',
    rank: 'WAREHOUSE',
    xp: 300,
    certification: 'Maintenance response (PM)',
    brief: 'Order PP-100025 for 1,200 suspension brackets is running on progressive press PRESS-02. Gliwice Body Works needs them tonight. Something is about to go wrong.',
    tcodes: ['IW21', 'IW31', 'IW41', 'CO11N', 'CO_GR', 'QA32'],
    recommendedSpeed: 2,
    onTick: (s, c) => {
      if (s.t >= c.startedAt + 4 && !s.machines['PRESS-02'].failure && !docsOf(s, 'MO').length) {
        const n = triggerBreakdown(s, 'PRESS-02', 'P-HYD-LEAK');
        if (n) breakdownEvent(s, 'PRESS-02', n.id);
      }
    },
    steps: [
      {
        id: 'inspect',
        title: 'Inspect the stopped press',
        role: 'PROD_OP',
        instruction: 'A red beacon is flashing. Open the 3D factory and click PRESS-02 to see the fault.',
        why: 'The machine stopped itself and the system created a breakdown notification (M2) automatically. The running operation is paused — not lost.',
        route: '#/factory',
        focus: 'machine:PRESS-02',
        check: (s, c) => !!s.machines['PRESS-02'].failure && c.trail.has('machine:PRESS-02'),
      },
      {
        id: 'order',
        title: 'Create a corrective maintenance order',
        role: 'MAINTENANCE',
        instruction: 'Maintenance → create a PM01 order for PRESS-02 from the notification. Assign a technician with the hydraulics skill who is on shift.',
        why: 'The order planned the repair, withdrew the seal kit from the spare parts store (movement 261) and blocked the machine for production.',
        route: '#/maintenance',
        tcode: 'IW31',
        check: (s) => docsOf(s, 'MO').some((m) => m.machine === 'PRESS-02' && m.kind === 'PM01'),
      },
      {
        id: 'repair',
        title: 'Wait for the repair',
        role: 'MAINTENANCE',
        instruction: 'The technician needs about 2.5 hours. Speed up time and watch the blue status on PRESS-02.',
        why: 'Downtime is the most expensive part of a breakdown. Spare parts in stock and the right skill on shift keep repair time short.',
        route: '#/factory',
        focus: 'machine:PRESS-02',
        check: (s) => docsOf(s, 'MO').some((m) => m.machine === 'PRESS-02' && m.workDoneAt !== undefined),
      },
      {
        id: 'confirm',
        title: 'Confirm the repair',
        role: 'MAINTENANCE',
        instruction: 'Confirm the maintenance order (IW41) to hand the press back to production.',
        why: 'Confirmation recorded labour and parts cost on the order, closed the notification and released the machine. Without it, the press would stay locked.',
        route: '#/maintenance',
        tcode: 'IW41',
        check: (s) => docsOf(s, 'MO').some((m) => m.machine === 'PRESS-02' && m.status === 'COMPLETED'),
      },
      {
        id: 'resume',
        title: 'Finish stamping',
        role: 'PROD_OP',
        instruction: 'The order resumes automatically. Confirm operation 0010 when the press has finished all 1,200 pieces.',
        why: 'The order continued exactly where it stopped. The breakdown shows up as downtime in OEE and as maintenance cost — not as lost parts.',
        route: '#/production',
        tcode: 'CO11N',
        check: (s) => docsOf(s, 'PP').some((p) => p.ops[0].status === 'CONFIRMED'),
      },
    ],
  },
  {
    id: 'M03',
    code: 'MISSION 03',
    title: 'Quality gate',
    subtitle: 'Incoming inspection of press-hardening steel',
    department: 'Quality management',
    rank: 'WAREHOUSE',
    xp: 300,
    certification: 'Incoming inspection (QM)',
    brief: 'A delivery of 22MnB5 boron steel has arrived. This material is inspected before use: a bad coating ruins the hot-forming furnace rollers and the parts crack in crash tests.',
    tcodes: ['MIGO_GR', 'QA32', 'QM01', 'ME21N', 'ME51N'],
    recommendedSpeed: 2,
    steps: [
      { id: 'count', title: 'Count the delivery', role: 'WAREHOUSE', instruction: 'Warehouse → Inbound: count the boron steel at door 1.', why: 'Counting first prevents book/physical differences.', route: '#/warehouse/inbound', tcode: 'MIGO_GR', check: (s) => docsOf(s, 'IBD').some((d) => d.items.every((i) => i.counted !== undefined)) },
      { id: 'gr', title: 'Post the goods receipt', role: 'WAREHOUSE', instruction: 'Post the receipt into sheet metal storage. Notice the stock type.', why: '22MnB5 requires incoming inspection, so movement 101 posted it into quality inspection stock and created inspection lot type 01. It cannot be used until a usage decision is made.', route: '#/warehouse/inbound', tcode: 'MIGO_GR', check: (s) => docsOf(s, 'IBD').some((d) => d.status === 'COMPLETED') },
      { id: 'results', title: 'Record the certificate check', role: 'QUALITY', instruction: 'Quality → Inspection lots: record tensile strength, coating mass and thickness exactly as measured.', why: 'The valuation compares each result with its tolerance. Look at which characteristic failed.', route: '#/quality', tcode: 'QA32', check: (s) => docsOf(s, 'IL').some((l) => l.origin === '01' && l.resultsRecorded) },
      { id: 'reject', title: 'Reject the lot', role: 'QUALITY', instruction: 'The lot is nonconforming. Make the usage decision “Reject”.', why: 'The stock moved to blocked stock (movement 350) and a supplier complaint (Q2 notification) was created automatically.', route: '#/quality', tcode: 'QA32', check: (s) => docsOf(s, 'IL').some((l) => l.origin === '01' && l.decision === 'REJECT') },
      { id: 'return', title: 'Return the batch to the supplier', role: 'WAREHOUSE', instruction: 'Quality → Batches (or the bin in the warehouse): post a return delivery (movement 122) for the blocked batch.', why: 'Movement 122 removed the stock and reopened the purchase order quantity — the supplier still owes you 2,000 kg.', route: '#/quality/batches', tcode: 'MIGO_GR', check: (s) => docsOf(s, 'MD').some((m) => m.mvt === '122') },
      { id: 'reorder', title: 'Secure a replacement', role: 'PROCUREMENT', instruction: 'Procurement: order 2,000 kg of 22MnB5 from an alternative approved supplier.', why: 'Procurement balances price against risk. A supplier with a quality problem gets a lower rating in supplier evaluation.', route: '#/procurement', tcode: 'ME21N', check: (s, c) => docsOf(s, 'PO').some((p) => p.createdAt >= c.startedAt && p.supplier !== 'SUP-1001' && p.items.some((i) => i.material === 'RM-22MNB5')) },
    ],
  },
  {
    id: 'M04',
    code: 'MISSION 04',
    title: 'Urgent call-off',
    subtitle: 'Deliver 300 press-hardened reinforcements to Zwickau in 16 hours',
    department: 'Order to delivery',
    rank: 'PROD_OP',
    xp: 500,
    certification: 'Order-to-delivery (PP · SD · TM)',
    brief: 'Zwickau Fahrzeugmontage has sent an urgent EDI call-off: 300 × SR-7130, due in 16 hours. Transit to Zwickau takes 7 hours. Only 120 pieces are in stock. Penalty: €900 per hour late.',
    tcodes: ['CO01', 'CO02', 'CO_STAGE', 'CO11N', 'QA32', 'CO_GR', 'VL01N', 'VL_PICK', 'VL_PGI', 'VT01N', 'MD01', 'MIGO_TR'],
    recommendedSpeed: 10,
    steps: [
      { id: 'atp', title: 'Check stock', role: 'LOGISTICS', instruction: 'Warehouse → Stock overview: how many SR-7130 are unrestricted?', why: '120 pcs are available. 180 must be produced — plus a little for scrap.', route: '#/warehouse/stock', check: (_s, c) => c.trail.has('warehouse.stock') },
      { id: 'order', title: 'Create an URGENT production order', role: 'PLANNER', instruction: 'Create a production order for at least 180 pcs of SR-7130 with priority URGENT.', why: 'Urgent orders get free machines and operators first.', route: '#/production/create', tcode: 'CO01', check: (s, c) => { const p = ppFor(s, 'FG-SR-7130', c.startedAt); return !!p && p.qty >= 180 && p.priority === 'URGENT'; } },
      { id: 'release', title: 'Release and stage', role: 'PLANNER', instruction: 'Release the order and stage the components.', why: 'Hot forming needs boron steel blanks at the furnace entry.', route: '#/production', tcode: 'CO02', check: (s, c) => !!ppFor(s, 'FG-SR-7130', c.startedAt)?.stagingDone },
      { id: 'produce', title: 'Produce and inspect', role: 'PROD_OP', instruction: 'Confirm operations (or switch on auto-confirmation), record the inspection and make the usage decision.', why: 'Auto-confirmation takes machine counter values directly — fast, but only as good as the machine data.', route: '#/production', tcode: 'CO11N', check: (s, c) => !!ppFor(s, 'FG-SR-7130', c.startedAt)?.ops.every((o) => o.status === 'CONFIRMED') },
      { id: 'gr', title: 'Receive finished goods', role: 'PROD_OP', instruction: 'Post the goods receipt into WH03.', why: 'Now the full 300 pcs are available to promise.', route: '#/production', tcode: 'CO_GR', check: (s, c) => ppFor(s, 'FG-SR-7130', c.startedAt)?.status === 'COMPLETED' },
      { id: 'deliver', title: 'Deliver 300 pcs', role: 'LOGISTICS', instruction: 'Create the delivery, pick, pack and plan a shipment with a reliable carrier.', why: 'A cheap but unreliable carrier can cost more in penalties than it saves in freight.', route: '#/logistics', tcode: 'VL01N', check: (s) => docsOf(s, 'DLV').some((d) => d.items[0].qty >= 300 && !!d.shipment) },
      { id: 'pgi', title: 'Dispatch in time', role: 'LOGISTICS', instruction: 'Post goods issue when the truck is loaded.', why: 'The truck is on its way. Delivery tracking shows whether it arrives before the requested time.', route: '#/logistics/deliveries', tcode: 'VL_PGI', check: (s) => docsOf(s, 'DLV').some((d) => d.items[0].qty >= 300 && d.pgi) },
      { id: 'arrive', title: 'Arrive on time', role: 'LOGISTICS', instruction: 'Track the shipment until proof of delivery.', why: 'On-time delivery is the KPI automotive customers care about most.', route: '#/logistics/shipments', check: (s) => docsOf(s, 'SHP').some((x) => x.deliveredAt !== undefined) },
    ],
  },
  {
    id: 'M05',
    code: 'MISSION 05',
    title: 'Ghost stock',
    subtitle: 'Find and correct an inventory difference that stops production',
    department: 'Inventory control',
    rank: 'WAREHOUSE',
    xp: 300,
    certification: 'Inventory control (MM · EWM)',
    brief: 'Order PP-100025 for 1,200 crossmembers is ready to release. The book stock says there is plenty of steel. The warehouse floor may disagree.',
    tcodes: ['CO02', 'CO_STAGE', 'MI01', 'MIGO_TR', 'MB_REV'],
    recommendedSpeed: 2,
    steps: [
      { id: 'release', title: 'Release the order', role: 'PLANNER', instruction: 'Production: release PP-100025.', why: 'The availability check uses book stock — it found enough.', route: '#/production', tcode: 'CO02', check: (s) => docsOf(s, 'PP').some((p) => p.status !== 'CREATED') },
      { id: 'stage', title: 'Stage the components', role: 'WAREHOUSE', instruction: 'Stage the components and watch the forklift at WH02-S-01.', why: 'The picker drives to the bin the system shows…', route: '#/production', tcode: 'CO_STAGE', check: (s) => s.events.some((e) => e.kind === 'PICK_SHORTAGE') || docsOf(s, 'PP').some((p) => p.stagingDone) },
      { id: 'count', title: 'Count the bin', role: 'WAREHOUSE', instruction: 'A pick shortage! Create a physical inventory document for WH02-S-01 and count it.', why: 'The count found the real quantity. Damaged material was never booked out — the book stock was a ghost.', route: '#/warehouse/count', tcode: 'MI01', check: (s) => docsOf(s, 'PI').some((p) => p.bin === 'WH02-S-01' && p.items.every((i) => i.counted !== undefined)) },
      { id: 'post', title: 'Post the difference', role: 'WAREHOUSE', instruction: 'Post the inventory difference (movement 702).', why: 'Movement 702 reduced the book stock and the inventory value. The reservation of the order was reduced too.', route: '#/warehouse/count', tcode: 'MI01', check: (s) => docsOf(s, 'MD').some((m) => m.mvt === '702') },
      { id: 'recheck', title: 'Re-check availability', role: 'PLANNER', instruction: 'Open the order and run “Check availability” again so it reserves steel from another bin.', why: 'The order now reserves stock that really exists.', route: '#/production', tcode: 'CO02', check: (s) => docsOf(s, 'PP').some((p) => p.components.every((c) => c.reserved + 1e-6 >= c.required) && docsOf(s, 'MD').some((m) => m.mvt === '702')) },
      { id: 'restage', title: 'Stage again', role: 'WAREHOUSE', instruction: 'Stage the remaining components.', why: 'Production can start. Counting bins regularly (cycle counting) prevents this kind of line stop.', route: '#/production', tcode: 'CO_STAGE', check: (s) => docsOf(s, 'PP').some((p) => p.stagingDone) },
    ],
  },
];

export const missionById = (id: string) => MISSIONS.find((m) => m.id === id);

export function scoreMission(errors: number, hints: number) {
  return Math.max(30, 100 - errors * 6 - hints * 2);
}

/** Scripted hint event so the player is not lost when a mission starts. */
export function missionIntroEvent(s: SimState, m: Mission) {
  pushEvent(s, { kind: 'INFO', title: `${m.code} — ${m.title}`, body: m.brief, severity: 'info', refs: [], advice: m.steps[0]?.instruction });
}
