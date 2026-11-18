// Roles, career ranks and transaction authorizations (SAP-style).
import type { RoleId, TCode } from '../engine';

export interface TCodeInfo {
  code: TCode;
  sap: string; // the real-world SAP transaction it is modelled on
  name: string;
  module: 'MM' | 'EWM' | 'PP' | 'QM' | 'PM' | 'SD' | 'TM';
}

export const TCODES: Record<TCode, TCodeInfo> = {
  MIGO_GR: { code: 'MIGO_GR', sap: 'MIGO', name: 'Goods receipt for purchase order', module: 'MM' },
  MIGO_TR: { code: 'MIGO_TR', sap: 'MIGO 311', name: 'Transfer posting bin to bin', module: 'EWM' },
  MIGO_GI: { code: 'MIGO_GI', sap: 'MIGO 261', name: 'Goods issue', module: 'MM' },
  MI01: { code: 'MI01', sap: 'MI01 / MI04 / MI07', name: 'Physical inventory', module: 'MM' },
  MB_REV: { code: 'MB_REV', sap: 'MBST', name: 'Reverse material document', module: 'MM' },
  ME51N: { code: 'ME51N', sap: 'ME51N', name: 'Create purchase requisition', module: 'MM' },
  ME21N: { code: 'ME21N', sap: 'ME21N', name: 'Create purchase order', module: 'MM' },
  MD01: { code: 'MD01', sap: 'MD01N', name: 'MRP run', module: 'PP' },
  CO01: { code: 'CO01', sap: 'CO01', name: 'Create production order', module: 'PP' },
  CO02: { code: 'CO02', sap: 'CO02', name: 'Release order / availability check', module: 'PP' },
  CO_STAGE: { code: 'CO_STAGE', sap: '/SCWM/STAGE', name: 'Stage components to the line', module: 'EWM' },
  CO11N: { code: 'CO11N', sap: 'CO11N', name: 'Operation confirmation', module: 'PP' },
  CO_GR: { code: 'CO_GR', sap: 'MIGO 101 (order)', name: 'Goods receipt from production', module: 'PP' },
  CO_TECO: { code: 'CO_TECO', sap: 'CO02 TECO', name: 'Technically complete order', module: 'PP' },
  QA32: { code: 'QA32', sap: 'QA32 / QE51N / QA11', name: 'Results recording & usage decision', module: 'QM' },
  QM01: { code: 'QM01', sap: 'QM01', name: 'Quality notification', module: 'QM' },
  QA_BLOCK: { code: 'QA_BLOCK', sap: 'MIGO 344 / MSC2N', name: 'Block / release batch', module: 'QM' },
  IW21: { code: 'IW21', sap: 'IW21', name: 'Maintenance notification', module: 'PM' },
  IW31: { code: 'IW31', sap: 'IW31', name: 'Create maintenance order', module: 'PM' },
  IW41: { code: 'IW41', sap: 'IW41', name: 'Confirm maintenance order', module: 'PM' },
  VA01: { code: 'VA01', sap: 'VA01', name: 'Create sales order', module: 'SD' },
  VL01N: { code: 'VL01N', sap: 'VL01N', name: 'Create outbound delivery', module: 'SD' },
  VL_PICK: { code: 'VL_PICK', sap: 'VL02N / LT03', name: 'Picking & packing', module: 'EWM' },
  VL_PGI: { code: 'VL_PGI', sap: 'VL02N', name: 'Post goods issue', module: 'SD' },
  VT01N: { code: 'VT01N', sap: 'VT01N', name: 'Create shipment', module: 'TM' },
};

export interface RoleInfo {
  id: RoleId;
  title: string;
  short: string;
  xp: number; // rank threshold (career roles) — 0 for side roles unlocked with a rank
  tcodes: TCode[];
  responsibilities: string[];
  kpis: string[];
  unlockedBy?: RoleId;
}

export const ROLES: Record<RoleId, RoleInfo> = {
  NEW: { id: 'NEW', title: 'New employee', short: 'Trainee', xp: 0, tcodes: [], responsibilities: ['Complete the onboarding mission', 'Learn the plant layout and the document flow'], kpis: ['Mission score'] },
  WAREHOUSE: { id: 'WAREHOUSE', title: 'Warehouse operator', short: 'Warehouse', xp: 250, tcodes: ['MIGO_GR', 'MIGO_TR', 'MI01', 'MB_REV', 'VL_PICK'], responsibilities: ['Receive and count incoming deliveries', 'Put away into the correct storage bins', 'Stage material for production', 'Keep book stock equal to physical stock'], kpis: ['Inventory accuracy', 'Dock-to-stock time'] },
  PROD_OP: { id: 'PROD_OP', title: 'Production operator', short: 'Production', xp: 700, tcodes: ['CO11N', 'CO_STAGE', 'CO_GR'], responsibilities: ['Run operations on the press, laser and weld lines', 'Confirm yield and scrap exactly as counted', 'Report breakdowns immediately'], kpis: ['OEE', 'Scrap rate', 'Confirmation accuracy'] },
  MAINTENANCE: { id: 'MAINTENANCE', title: 'Maintenance technician', short: 'Maintenance', xp: 700, unlockedBy: 'PROD_OP', tcodes: ['IW21', 'IW31', 'IW41'], responsibilities: ['Repair breakdowns with the right skill and spare parts', 'Plan preventive maintenance before wear limits', 'Confirm work so machines return to production'], kpis: ['Downtime', 'MTTR', 'Maintenance cost'] },
  LOGISTICS: { id: 'LOGISTICS', title: 'Logistics coordinator', short: 'Logistics', xp: 1300, tcodes: ['VA01', 'VL01N', 'VL_PICK', 'VL_PGI', 'VT01N'], responsibilities: ['Create deliveries for due sales orders', 'Choose carriers by cost and reliability', 'Load trucks and post goods issue on time'], kpis: ['On-time delivery', 'Freight cost'] },
  QUALITY: { id: 'QUALITY', title: 'Quality inspector', short: 'Quality', xp: 2000, tcodes: ['QA32', 'QM01', 'QA_BLOCK'], responsibilities: ['Record inspection results exactly as measured', 'Make usage decisions based on the valuation', 'Block nonconforming batches and open notifications'], kpis: ['First pass yield', 'Customer complaints'] },
  PLANNER: { id: 'PLANNER', title: 'Production planner', short: 'Planning', xp: 2900, tcodes: ['CO01', 'CO02', 'MD01', 'CO_TECO'], responsibilities: ['Turn customer demand into production orders', 'Run MRP and secure material in time', 'Sequence urgent orders first'], kpis: ['Schedule adherence', 'Material availability'] },
  PROCUREMENT: { id: 'PROCUREMENT', title: 'Procurement specialist', short: 'Procurement', xp: 2900, unlockedBy: 'PLANNER', tcodes: ['ME51N', 'ME21N'], responsibilities: ['Convert requisitions into purchase orders', 'Compare quotations: price, lead time, reliability', 'Manage supplier delays and rejections'], kpis: ['Supplier on-time rate', 'Purchase price variance'] },
  MANAGER: { id: 'MANAGER', title: 'Factory manager', short: 'Manager', xp: 4000, tcodes: Object.keys(TCODES) as TCode[], responsibilities: ['Balance cost, quality and delivery across all departments', 'React to disruptions before customers notice', 'Keep the plant score above 800'], kpis: ['Plant score', 'OEE', 'On-time delivery', 'Cost'] },
};

export const CAREER: RoleId[] = ['NEW', 'WAREHOUSE', 'PROD_OP', 'LOGISTICS', 'QUALITY', 'PLANNER', 'MANAGER'];

export function rankFor(xp: number): RoleId {
  let r: RoleId = 'NEW';
  for (const id of CAREER) if (xp >= ROLES[id].xp) r = id;
  return r;
}
export function nextRank(xp: number): RoleId | undefined {
  return CAREER.find((id) => ROLES[id].xp > xp);
}
export function unlockedRoles(xp: number): RoleId[] {
  return (Object.keys(ROLES) as RoleId[]).filter((id) => xp >= ROLES[id].xp);
}

export function roleForTcode(code: TCode): RoleId {
  const order: RoleId[] = ['WAREHOUSE', 'PROD_OP', 'MAINTENANCE', 'LOGISTICS', 'QUALITY', 'PLANNER', 'PROCUREMENT'];
  return order.find((r) => ROLES[r].tcodes.includes(code)) ?? 'MANAGER';
}
