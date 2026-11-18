// Core simulation types. Everything the UI and the 3D scene render is derived
// from a single SimState object that only the engine mutates.

export type MaterialType = 'RAW' | 'SEMI' | 'FIN' | 'SPARE' | 'CONS';
export type UoM = 'KG' | 'PC' | 'L';
export type StockType = 'UNR' | 'QI' | 'BLK';

export type ZoneId =
  | 'RM'
  | 'SHEET'
  | 'STAMP'
  | 'HOTFORM'
  | 'LASER'
  | 'WELD'
  | 'MACH'
  | 'KTL'
  | 'QC'
  | 'FG'
  | 'SHIP'
  | 'MAINT'
  | 'INBOUND';

export type WcGroup = 'BLANK' | 'PRESS' | 'HOTFORM' | 'TRIM' | 'WELD' | 'CNC' | 'KTL' | 'QC';

export type RoleId =
  | 'NEW'
  | 'WAREHOUSE'
  | 'PROD_OP'
  | 'LOGISTICS'
  | 'QUALITY'
  | 'PLANNER'
  | 'MAINTENANCE'
  | 'PROCUREMENT'
  | 'MANAGER';

export type TCode =
  | 'MIGO_GR'
  | 'MIGO_TR'
  | 'MIGO_GI'
  | 'MI01'
  | 'MB_REV'
  | 'ME51N'
  | 'ME21N'
  | 'MD01'
  | 'CO01'
  | 'CO02'
  | 'CO_STAGE'
  | 'CO11N'
  | 'CO_GR'
  | 'CO_TECO'
  | 'QA32'
  | 'QM01'
  | 'QA_BLOCK'
  | 'IW21'
  | 'IW31'
  | 'IW41'
  | 'VA01'
  | 'VL01N'
  | 'VL_PICK'
  | 'VL_PGI'
  | 'VT01N';

export interface Material {
  id: string;
  name: string;
  type: MaterialType;
  uom: UoM;
  price: number; // standard price per unit, EUR
  binType: BinType; // where it may be stored
  perPallet: number; // units per pallet / handling unit
  qmIncoming?: boolean; // incoming inspection required (lot type 01)
  description: string;
}

export type BinType = 'SHEET' | 'RACK' | 'FGRACK' | 'SPARE' | 'PSA' | 'DOCK' | 'QA';

export interface BinDef {
  id: string;
  zone: ZoneId;
  type: BinType;
  capacity: number; // pallet places (or coil cradles)
  pos: [number, number, number]; // 3D world position of the slot
  rack?: string; // rack id for 3D grouping
  level?: number;
}

export interface Quant {
  id: string;
  material: string;
  bin: string;
  batch: string;
  qty: number; // book quantity (what the ERP believes)
  physical: number; // what is really on the shelf
  stockType: StockType;
  reserved: number; // reserved for orders/deliveries
  order?: string; // staged for a specific production / maintenance order
  createdAt: number;
}

export interface Batch {
  id: string;
  material: string;
  origin: 'SUPPLIER' | 'PRODUCTION' | 'INITIAL';
  supplier?: string;
  order?: string;
  createdAt: number;
  status: 'RELEASED' | 'PENDING_QI' | 'BLOCKED' | 'REJECTED';
  latentDefect?: boolean; // defect passed through inspection — causes complaint later
  shippedTo?: string[];
  complaintAt?: number;
  complained?: boolean;
}

export type DocType =
  | 'PR'
  | 'PO'
  | 'IBD'
  | 'MD'
  | 'PP'
  | 'CF'
  | 'IL'
  | 'QN'
  | 'PMN'
  | 'MO'
  | 'SO'
  | 'DLV'
  | 'SHP'
  | 'WT'
  | 'PI'
  | 'RES';

export type DocStatus =
  | 'DRAFT'
  | 'CREATED'
  | 'RELEASED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'BLOCKED';

export interface HistoryEntry {
  t: number;
  user: string;
  action: string;
  detail?: string;
}

export interface DocBase {
  id: string;
  type: DocType;
  status: DocStatus;
  createdAt: number;
  createdBy: string;
  refs: string[]; // related document ids (graph edges)
  history: HistoryEntry[];
  text?: string;
}

export interface PurchaseReq extends DocBase {
  type: 'PR';
  material: string;
  qty: number;
  needBy: number;
  source: 'MRP' | 'MANUAL' | 'MAINT';
}

export interface PoItem {
  material: string;
  qty: number;
  price: number;
  received: number;
}
export interface PurchaseOrder extends DocBase {
  type: 'PO';
  supplier: string;
  items: PoItem[];
  eta: number; // expected arrival at dock
  originalEta: number;
  delivered: boolean;
}

export interface InboundDelivery extends DocBase {
  type: 'IBD';
  po: string;
  supplier: string;
  items: { material: string; qty: number; actualQty: number; batch: string; counted?: number }[];
  eta: number;
  arrivedAt?: number;
  dock?: number; // inbound door index
  departAt?: number;
  carrierPlate: string;
  plannedDelay?: number;
  delayAnnounced?: boolean;
}

export interface MatDocItem {
  material: string;
  qty: number;
  batch: string;
  fromBin?: string;
  toBin?: string;
  stockType?: StockType;
  toStockType?: StockType;
  quant?: string;
}
export type MovementType =
  | '101'
  | '102'
  | '261'
  | '262'
  | '311'
  | '312'
  | '343'
  | '344'
  | '321'
  | '122'
  | '350'
  | '551'
  | '601'
  | '701'
  | '702';
export interface MaterialDoc extends DocBase {
  type: 'MD';
  mvt: MovementType;
  items: MatDocItem[];
  value: number;
  reversedBy?: string;
  reverses?: string;
}

export type OpStatus = 'WAITING' | 'SETUP' | 'RUNNING' | 'PAUSED' | 'DONE' | 'CONFIRMED';
export interface Operation {
  no: string; // 0010, 0020 ...
  name: string;
  wcGroup: WcGroup;
  setupMin: number;
  cycleSec: number;
  qtyIn: number;
  produced: number; // good + scrap processed so far
  scrap: number;
  machine?: string;
  operator?: string;
  status: OpStatus;
  plannedMin: number;
  actualMin: number;
  startedAt?: number;
  finishedAt?: number;
  confirmation?: string;
  inspectionLot?: string;
}
export interface Component {
  material: string;
  qtyPer: number;
  required: number;
  reserved: number;
  staged: number;
  issued: number;
}
export interface ProductionOrder extends DocBase {
  type: 'PP';
  product: string;
  qty: number;
  plannedStart: number;
  plannedEnd: number;
  priority: 'NORMAL' | 'URGENT';
  ops: Operation[];
  components: Component[];
  salesOrder?: string;
  stagingDone: boolean;
  grQty: number;
  scrapTotal: number;
  plannedCost: number;
  actualCost: number;
  autoConfirm: boolean;
  batch?: string;
  waitingReason?: string;
}

export interface Confirmation extends DocBase {
  type: 'CF';
  order: string;
  op: string;
  yield: number;
  scrap: number;
  machine: string;
  durationMin: number;
  final: boolean;
}

export interface Characteristic {
  code: string;
  name: string;
  unit: string;
  lsl: number;
  usl: number;
  target: number;
  measured: number;
  recorded?: number;
}
export interface InspectionLot extends DocBase {
  type: 'IL';
  origin: '01' | '03' | '04';
  material: string;
  batch: string;
  qty: number;
  sample: number;
  order?: string;
  po?: string;
  chars: Characteristic[];
  defectsFound: number; // true defects in the lot (hidden until recorded)
  resultsRecorded: boolean;
  decision?: 'ACCEPT' | 'REJECT';
  acceptedQty?: number;
}

export interface QualityNotification extends DocBase {
  type: 'QN';
  kind: 'Q1' | 'Q2' | 'Q3'; // customer, supplier, internal
  material: string;
  batch?: string;
  defect: string;
  qty: number;
  cost: number;
}

export interface PmNotification extends DocBase {
  type: 'PMN';
  kind: 'M1' | 'M2'; // maintenance request / breakdown
  machine: string;
  description: string;
  order?: string;
}

export interface MaintOrder extends DocBase {
  type: 'MO';
  kind: 'PM01' | 'PM02';
  machine: string;
  description: string;
  durationMin: number;
  technician?: string;
  parts: { material: string; qty: number; issued: number }[];
  startedAt?: number;
  finishedAt?: number;
  cost: number;
  notification?: string;
  workDoneAt?: number;
}

export interface SalesOrder extends DocBase {
  type: 'SO';
  customer: string;
  items: { material: string; qty: number; price: number; delivered: number }[];
  due: number;
  priority: 'NORMAL' | 'URGENT';
  penaltyPerHour: number;
  warned?: boolean;
  overdueWarned?: boolean;
}

export interface DeliveryItem {
  material: string;
  qty: number;
  picked: number;
  batch?: string;
  picks: { quant: string; bin: string; batch: string; qty: number; wt?: string }[];
}
export interface OutboundDelivery extends DocBase {
  type: 'DLV';
  salesOrder: string;
  customer: string;
  items: DeliveryItem[];
  pickStatus: 'NONE' | 'IN_PROGRESS' | 'DONE';
  packed: boolean;
  handlingUnits: number;
  pgi: boolean;
  shipment?: string;
  dock: number;
}

export interface Shipment extends DocBase {
  type: 'SHP';
  deliveries: string[];
  carrier: string;
  vehicle: string;
  route: string;
  dock: number;
  plannedLoad: number;
  loadingStart?: number;
  departedAt?: number;
  eta?: number;
  deliveredAt?: number;
  cost: number;
  delayMin: number;
  lateBy: number;
  arrivedAt?: number;
  loadedAt?: number;
}

export type WtKind = 'PUTAWAY' | 'STAGING' | 'FG_PUTAWAY' | 'PICK' | 'TRANSFER' | 'SPARE';
export interface WarehouseTask extends DocBase {
  type: 'WT';
  kind: WtKind;
  material: string;
  qty: number;
  batch: string;
  quant: string;
  fromBin: string;
  toBin: string;
  stockType: StockType;
  forklift?: string;
  startedAt?: number;
  durationMin: number;
  finishedAt?: number;
  ref?: string; // business doc that triggered it
}

export interface PhysInvDoc extends DocBase {
  type: 'PI';
  bin: string;
  items: { quant: string; material: string; batch: string; book: number; counted?: number }[];
  posted: boolean;
}

export type AnyDoc =
  | PurchaseReq
  | PurchaseOrder
  | InboundDelivery
  | MaterialDoc
  | ProductionOrder
  | Confirmation
  | InspectionLot
  | QualityNotification
  | PmNotification
  | MaintOrder
  | SalesOrder
  | OutboundDelivery
  | Shipment
  | WarehouseTask
  | PhysInvDoc;

export type DocOf<T extends DocType> = Extract<AnyDoc, { type: T }>;

export type MachineStatus = 'RUNNING' | 'IDLE' | 'WARNING' | 'STOPPED' | 'MAINT' | 'SETUP';

export interface MachineState {
  id: string;
  status: MachineStatus;
  health: number; // 0..100
  runMin: number;
  idleMin: number;
  downMin: number;
  setupMin: number;
  goodCount: number;
  scrapCount: number;
  order?: string;
  op?: string;
  operator?: string;
  failure?: { code: string; text: string; since: number };
  notice?: string; // reason for yellow state
  defectBoostUntil?: number;
  maintOrder?: string;
  lastPmAt: number;
  perfMin: number;
  setupLeft: number;
  frac: number;
}

export interface ForkliftState {
  id: string;
  task?: string;
  home: [number, number, number];
  driver: string;
}

export interface Employee {
  id: string;
  name: string;
  role: 'OPERATOR' | 'TECH' | 'WAREHOUSE' | 'INSPECTOR';
  shift: 1 | 2 | 3;
  skill?: 'MECH' | 'ELEC' | 'HYD';
  absentUntil?: number;
  busyWith?: string;
}

export type Severity = 'info' | 'success' | 'warning' | 'critical';

export interface SimEvent {
  id: string;
  t: number;
  kind:
    | 'SUPPLIER_DELAY'
    | 'BREAKDOWN'
    | 'DEMAND'
    | 'QUALITY_DRIFT'
    | 'CAPACITY'
    | 'TRUCK_LATE'
    | 'SHORTAGE'
    | 'COMPLAINT'
    | 'ABSENCE'
    | 'PICK_SHORTAGE'
    | 'DEADLINE'
    | 'INFO';
  title: string;
  body: string;
  severity: Severity;
  refs: string[];
  read: boolean;
  resolved: boolean;
  advice?: string; // what the player should do (SAP process)
}

export interface AuditEntry {
  id: number;
  t: number;
  user: string;
  tcode: string;
  ok: boolean;
  message: string;
  docs: string[];
}

export interface Stats {
  txOk: number;
  txFailed: number;
  reversals: number;
  goodOutput: number;
  scrapOutput: number;
  deliveriesOnTime: number;
  deliveriesLate: number;
  penalties: number;
  complaints: number;
  maintenanceCost: number;
  transportCost: number;
  materialCost: number;
  conversionCost: number;
  revenue: number;
  outputByHour: { h: number; good: number; scrap: number }[];
  oeeByHour: { h: number; oee: number; availability: number; performance: number; quality: number }[];
  inventoryValueByHour: { h: number; value: number }[];
  mistakes: { t: number; code: string; text: string; fix: string }[];
  snap: { good: number; scrap: number; run: number; down: number; setup: number; perf: number };
}

export interface MissionProgress {
  id: string;
  step: number;
  startedAt: number;
  completedSteps: string[];
  errors: number;
  hintsUsed: number;
  finishedAt?: number;
}

export interface SimState {
  version: number;
  scenario: string;
  mode: 'TRAINING' | 'FREE';
  t: number;
  speed: number;
  paused: boolean;
  rng: number;
  user: string;
  quants: Record<string, Quant>;
  batches: Record<string, Batch>;
  binLocks: Record<string, number>; // bin -> locked until
  docs: Record<string, AnyDoc>;
  seq: Record<string, number>;
  machines: Record<string, MachineState>;
  forklifts: Record<string, ForkliftState>;
  employees: Record<string, Employee>;
  events: SimEvent[];
  audit: AuditEntry[];
  stats: Stats;
  mission?: MissionProgress;
  nextEventAt: number;
  eventsEnabled: boolean;
  lastHour: number;
}

export interface TxResult {
  ok: boolean;
  message: string;
  docs?: string[];
  fix?: string; // how to correct the problem (educational)
}
