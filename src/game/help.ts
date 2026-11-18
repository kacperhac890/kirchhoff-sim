// Contextual help: what each SAP-inspired module and transaction does, and why.

export interface HelpTopic {
  id: string;
  title: string;
  sap: string;
  summary: string;
  points: { term: string; text: string }[];
  flow?: string[];
}

export const HELP: Record<string, HelpTopic> = {
  dashboard: {
    id: 'dashboard',
    title: 'Plant cockpit',
    sap: 'S/4HANA Fiori launchpad',
    summary: 'The cockpit shows what needs your attention right now. Every number is calculated live from the same simulation that drives the 3D factory.',
    points: [
      { term: 'OEE', text: 'Overall Equipment Effectiveness = Availability × Performance × Quality. World-class stamping plants reach 80–85 %.' },
      { term: 'Worklist', text: 'Open tasks are derived from document status: a delivery at the dock needs a goods receipt, a finished operation needs a confirmation.' },
      { term: 'Shift', text: 'Three shifts run the plant. The night shift has fewer operators — machines without an operator stop.' },
    ],
  },
  factory: {
    id: 'factory',
    title: '3D plant view',
    sap: 'Digital twin',
    summary: 'The factory is a live view of ERP data. Machines move only when the engine has an operation running on them; forklifts drive only when a warehouse task exists.',
    points: [
      { term: 'Green', text: 'Running normally.' },
      { term: 'Yellow', text: 'Warning — no operator, wear limit, or process drift.' },
      { term: 'Red', text: 'Stopped by a breakdown. A maintenance notification exists.' },
      { term: 'Blue', text: 'Setup (die change) or maintenance in progress.' },
    ],
  },
  warehouse: {
    id: 'warehouse',
    title: 'Inventory & warehouse',
    sap: 'MM-IM · EWM',
    summary: 'Inventory Management records every stock change as a material document with a movement type. EWM decides where stock physically sits (storage bins) and moves it with warehouse tasks.',
    points: [
      { term: 'Movement 101', text: 'Goods receipt. Increases stock, updates the purchase order and creates value in finance.' },
      { term: 'Book vs physical', text: 'The system only knows what you post. If you post 2,000 kg but 1,950 kg arrived, the shortage appears later — usually when production needs the material.' },
      { term: 'Stock types', text: 'Unrestricted can be used. Quality inspection (QI) and Blocked stock can never be consumed or shipped.' },
      { term: 'Warehouse task', text: 'An instruction for a forklift: move this pallet from bin A to bin B. Stock changes bin only when the task is confirmed.' },
    ],
    flow: ['Inbound delivery', 'Count', 'Goods receipt 101', 'Put-away task', 'Storage bin'],
  },
  production: {
    id: 'production',
    title: 'Production planning & execution',
    sap: 'PP',
    summary: 'A production order says what to make, how much, with which material (BOM) and in which steps (routing). Release checks material availability and reserves it.',
    points: [
      { term: 'BOM', text: 'Bill of materials — components per piece. 500 crossmembers × 3.2 kg steel = 1,600 kg required.' },
      { term: 'Routing', text: 'The operations and work centres the order passes through: blanking, stamping, trimming, welding, KTL, inspection.' },
      { term: 'Reservation', text: 'Release reserves components so nobody else can use them. Reserved stock is still in the warehouse.' },
      { term: 'Backflush (261)', text: 'Components are consumed automatically when the operation that uses them starts.' },
      { term: 'Confirmation', text: 'CO11N reports yield and scrap. It drives the next operation quantity, costs and OEE — so it must match reality.' },
    ],
    flow: ['CO01 create', 'CO02 release', 'Stage', 'Operations', 'CO11N confirm', 'Final inspection', 'GR 101'],
  },
  quality: {
    id: 'quality',
    title: 'Quality management',
    sap: 'QM',
    summary: 'Inspection lots are created automatically: at goods receipt (type 01) and in production (type 03). Results are recorded per characteristic, then a usage decision moves the stock.',
    points: [
      { term: 'Valuation', text: 'Each result is checked against the tolerance (LSL–USL). One rejected characteristic means the lot is nonconforming.' },
      { term: 'Usage decision', text: 'Accept → unrestricted stock. Reject → blocked stock. 100 % sorting separates the bad parts.' },
      { term: 'Batch', text: 'Every lot is traceable by batch. A blocked batch cannot be picked or shipped.' },
      { term: 'Notification', text: 'Q1 customer complaint, Q2 supplier complaint, Q3 internal problem.' },
    ],
  },
  maintenance: {
    id: 'maintenance',
    title: 'Plant maintenance',
    sap: 'PM',
    summary: 'A notification describes a problem; a maintenance order plans the work, assigns the technician and withdraws spare parts. Confirmation returns the machine to production.',
    points: [
      { term: 'PM01', text: 'Corrective maintenance after a breakdown. Needs the right skill (mechanical, electrical, hydraulic).' },
      { term: 'PM02', text: 'Preventive maintenance. Planned downtime that restores machine health and prevents breakdowns.' },
      { term: 'Wear', text: 'Machines lose health while running. Below 35 % breakdown risk rises sharply and scrap increases.' },
    ],
    flow: ['IW21 notification', 'IW31 order', 'Spare parts 261', 'Repair', 'IW41 confirm'],
  },
  procurement: {
    id: 'procurement',
    title: 'Purchasing',
    sap: 'MM-PUR',
    summary: 'MRP compares requirements with stock and open orders and proposes requisitions. Buyers convert them into purchase orders with an approved supplier.',
    points: [
      { term: 'Requisition', text: 'An internal request — no commitment to a supplier yet.' },
      { term: 'Purchase order', text: 'A legal order to the supplier with price and delivery date.' },
      { term: 'Source', text: 'Only suppliers with a valid quotation may be used. Cheaper is not always better — check lead time and reliability.' },
    ],
    flow: ['MRP', 'Requisition', 'Purchase order', 'Inbound delivery', 'Goods receipt'],
  },
  logistics: {
    id: 'logistics',
    title: 'Sales & transportation',
    sap: 'SD · TM',
    summary: 'A sales order captures customer demand. The outbound delivery checks availability, triggers picking and packing; the shipment books carrier and truck; goods issue reduces stock when the truck leaves.',
    points: [
      { term: 'ATP', text: 'Available-to-promise: only unrestricted, released stock counts.' },
      { term: 'Handling unit', text: 'A packed pallet with its own ID. Determines how many pallet places the truck needs.' },
      { term: 'Movement 601', text: 'Goods issue for delivery — stock and value leave the company.' },
      { term: 'Penalties', text: 'Automotive customers run just-in-time lines. Late deliveries cost contract penalties per hour.' },
    ],
    flow: ['Sales order', 'Delivery', 'Picking', 'Packing', 'Shipment', 'Goods issue 601', 'Proof of delivery'],
  },
  documents: {
    id: 'documents',
    title: 'Document flow',
    sap: 'Document flow / audit trail',
    summary: 'Every business step creates a document that points to its predecessor. Documents are never edited after posting — mistakes are corrected with reversal or correction documents, so the history stays complete.',
    points: [
      { term: 'Immutable', text: 'A posted material document cannot be changed. Movement 102 reverses a 101, 701/702 correct inventory differences.' },
      { term: 'Audit log', text: 'Every transaction — successful or rejected — is recorded with user and time.' },
    ],
  },
  analytics: {
    id: 'analytics',
    title: 'Analytics',
    sap: 'Embedded analytics',
    summary: 'KPIs are snapshotted every simulated hour from the engine state.',
    points: [
      { term: 'Availability', text: 'Running time ÷ (running + setup + breakdown time).' },
      { term: 'Performance', text: 'Actual speed ÷ ideal cycle time — reduced by night shift and machine wear.' },
      { term: 'Quality', text: 'Good parts ÷ all parts processed.' },
    ],
  },
  missions: {
    id: 'missions',
    title: 'Missions & career',
    sap: 'Training',
    summary: 'Training missions teach one process each, step by step. Your career rank unlocks new roles and missions. Free simulation runs the whole plant with random disruptions.',
    points: [
      { term: 'XP', text: 'Earned for correct transactions and completed missions.' },
      { term: 'Certification', text: 'Granted for a mission score of 70 % or higher.' },
    ],
  },
};
