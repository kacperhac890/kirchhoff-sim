# KIRCHHOFF Factory Simulator

An educational 3D ERP training game for a simulated automotive structural-parts plant
(stamping, press hardening, laser cutting, robotic welding, KTL e-coat, machining).
SAP-inspired workflows — MM, EWM, PP, QM, PM, SD, TM — run on one simulation engine
that also drives the 3D factory.

> Training simulation. Plant layout, machine IDs, recipes, suppliers, customers and SAP
> configuration are invented and are **not** KIRCHHOFF Automotive internal data.

## Run locally

Requires Node.js 20+ (tested with Node 24).

```bash
cd kirchhoff-sim
npm install
npm run dev        # http://localhost:5230
```

Other scripts:

| Script | What it does |
|---|---|
| `npm test` | Engine tests (Mission 01 end-to-end, impossible states, breakdown, inventory count, reversal, 48 h free-play soak) |
| `npm run typecheck` | Strict TypeScript check |
| `npm run build` | Production build into `dist/` (relative paths — works from any sub-folder / GitHub Pages) |
| `npm run preview` | Serve the production build |

## Database setup

None needed. The game is single-player and the whole simulation runs in the browser;
saves and the player profile live in `localStorage` (keys `kfs-save-v3-*`, `kfs-profile-v1`).

Persistence goes through one interface, `SaveAdapter` in `src/store/persist.ts`. To move to
PostgreSQL + Prisma, implement that interface against an API (e.g. a small Next.js or Fastify
service storing the serialized `SimState` per user/slot) — the engine and UI do not change.

## How to play

1. Clock in with a name and an employee ID.
2. Start **Mission 01 — From coil to customer** (16 guided steps): count and receive 2,000 kg of
   steel (MIGO 101), watch the forklift put it away, create and release a production order for
   500 crossmembers (CO01/CO02), stage components, confirm the six operations (CO11N), record
   CMM results and make the usage decision (QA32), receive finished goods into WH03, create the
   delivery, pick, pack, book a truck (VT01N) and post goods issue (VL02N).
3. Missions 02–05 unlock with XP (breakdown repair, incoming inspection, urgent call-off,
   inventory difference). **Free simulation** gives full authorization with random events.

Keys: `Ctrl K` search/T-codes · `Space` pause · `1–4` speed ×1/×2/×5/×10 ·
`W A S D` + drag in 3D explore mode.

## Architecture

```
src/engine/   pure simulation: types, master data, layout, transactions per module,
              tick (clock, machines, forklifts, trucks), events, KPIs, scenarios, tests
src/game/     roles & authorizations, missions (step predicates + explanations),
              progression/achievements, worklist, contextual SAP help
src/store/    zustand store (runs transactions, mission checks, XP, saving) + SaveAdapter
src/three/    React Three Fiber scene: building, machines, racks/loads, forklifts, trucks,
              workers, flow lines, labels, camera rigs
src/features/ ERP modules and screens
src/ui/       design-system kit, charts theme, links
```

Every UI action calls an engine transaction through `useApp().run(tcode, fn)`, which checks
authorization, validates, posts documents and writes the audit log. The 3D scene only reads
engine state, so animations always reflect it.

## Implemented

- **Engine**: simulated clock with pause/×1/×2/×5/×10, three shifts with operator staffing,
  machine wear, breakdown hazard, setup times, scrap, OEE accounting, hourly KPI snapshots,
  deterministic RNG stored in the save.
- **MM/EWM**: inbound deliveries, physical count at the dock, GR 101 with bin validation
  (storage type, capacity, mixed storage, locked bins), quality inspection stock for 22MnB5,
  warehouse tasks executed by four forklifts, transfers 311, physical inventory 701/702,
  GR reversal 102, return to vendor 122, book vs physical stock with pick shortages.
- **PP**: BOM + routing for four products, CO01 with planned cost and schedule, release with
  availability check and FIFO reservations, staging to production supply areas, backflush 261,
  sequential final confirmations with machine-counter validation, auto-confirmation, GR from
  order into several FG bins, cancel, MRP for purchased parts, FG coverage, work-centre schedule.
- **QM**: inspection lots 01/03, results recording validated against instrument readings,
  automatic valuation, usage decision (accept / 100 % sorting / reject), batch block/release,
  scrapping, Q1/Q2/Q3 notifications, latent defects that return as customer complaints.
- **PM**: automatic M2 notifications on breakdowns, PM01/PM02 orders with skill, shift and
  spare-part checks, repair time, IW41 confirmation, spare parts store and reordering.
- **Procurement**: requisitions (manual, MRP, maintenance), quotation comparison, purchase
  orders with hidden supplier delays/short deliveries, supplier evaluation.
- **SD/TM**: sales orders, deliveries with ATP (blocked/QI stock never counts), FIFO picking,
  packing into handling units, carrier/vehicle booking with cost and reliability, truck
  arrival/lateness, loading, PGI 601, tracking map, on-time KPI and contract penalties.
- **Documents**: unified document center, item tables, immutable history, interactive
  document-flow graph, audit log of accepted and rejected transactions.
- **3D**: procedural transfer/progressive presses with moving rams, laser cells with moving
  gantries, weld cells with articulated robots and sparks, press-hardening furnace with glow,
  KTL dip line with moving hangers, CNC, CMM, racks with real loads per bin (clickable),
  forklifts driving real warehouse tasks, trucks docking and leaving, dock doors, workers and
  technicians, status beacons, material-flow lines, overview/top-down map/WASD explore,
  inspector panels, quality switch (shadows + bloom vs performance).
- **Game**: 5 training missions with step-by-step instructions, “Show me” guidance and
  post-step ERP explanations, transaction authorization per mission, career ranks and roles,
  role worklists, XP, achievements, certifications, performance report, plant score (1,000).

## Remaining features (next phases)

- Server persistence (PostgreSQL/Prisma via `SaveAdapter`), real accounts and multiplayer.
- GLB machine models to replace the procedural ones; interior lighting presets.
- Partial confirmations and operation overlap, alternative routings, capacity levelling.
- Billing/invoicing (SD-BIL) and finance postings (FI/CO) for the material documents.
- Rework orders for rejected batches, 8D workflow for Q1 notifications.
- Preventive maintenance plans with automatic call dates.
- More missions (shift handover, carrier selection under cost pressure, MRP-driven week).

## Known limitations

- Single plant, single user, saves per browser (no cloud sync).
- Inbound deliveries have one item; GR posts one bin per item (finished goods may use several).
- MRP plans purchased parts only; finished-goods planning is shown as coverage suggestions.
- Reversal is supported for PO goods receipts (102); other corrections use 311/701/702.
- The simulation pauses when the browser tab is hidden.
- 3D view needs WebGL 2; use the gauge button (performance mode) on slower GPUs.
