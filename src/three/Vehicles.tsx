// Forklifts follow open warehouse tasks; trucks follow inbound deliveries and shipments.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AISLE_Z, BIN_MAP, INBOUND_DOORS, OUTBOUND_DOORS, accessPoint, docsOf, getDoc, type SimState } from '../engine';
import { useApp } from '../store/store';
import { Box, Cyl } from './Machines';
import { M, getSim, simNow } from './materials';
import { Person } from './Workers';

type P2 = [number, number];

export function samplePath(pts: P2[], d: number): { x: number; z: number; heading: number } {
  let left = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const seg = Math.hypot(bx - ax, bz - az);
    if (left <= seg || i === pts.length - 1) {
      const f = seg > 0 ? Math.min(1, left / seg) : 1;
      return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, heading: Math.atan2(bx - ax, bz - az) };
    }
    left -= seg;
  }
  const last = pts[pts.length - 1];
  return { x: last[0], z: last[1], heading: 0 };
}
export function pathLen(pts: P2[]) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return d;
}
function manhattan(a: P2, b: P2): P2[] {
  return [a, [a[0], AISLE_Z], [b[0], AISLE_Z], b];
}

const loadMat: Record<string, THREE.Material> = {};
function loadMaterial(material: string) {
  if (material === 'RM-S355') return M.sheetSteel;
  if (material === 'RM-22MNB5') return M.alsi;
  if (material === 'RM-KTL') return M.ibc;
  if (material === 'RM-WIRE') return M.drum;
  if (material.startsWith('FG-')) return M.ktlBlack;
  return (loadMat[material] ??= M.cardboard);
}

// ------------------------------------------------------------------ forklift
function Forklift({ id }: { id: string }) {
  const root = useRef<THREE.Group>(null);
  const forks = useRef<THREE.Group>(null);
  const load = useRef<THREE.Mesh>(null);
  const pos = useRef<P2 | null>(null);
  const heading = useRef(0);
  const back = useRef<{ pts: P2[]; d: number } | null>(null);
  const select = useApp((s) => s.select);
  useFrame((_, dt) => {
    const s = getSim();
    const g = root.current;
    if (!s || !g) return;
    const f = s.forklifts[id];
    const home: P2 = [f.home[0], f.home[2]];
    if (!pos.current) pos.current = home;
    const wt = f.task ? getDoc(s, f.task, 'WT') : undefined;
    let forkY = 0.1;
    let carrying = false;
    if (wt && wt.startedAt !== undefined) {
      back.current = null;
      const p = Math.min(1, Math.max(0, (simNow() - wt.startedAt) / wt.durationMin));
      const from = accessPoint(wt.fromBin);
      const to = accessPoint(wt.toBin);
      const approach = manhattan(home, from);
      const travel = manhattan(from, to);
      const fromY = BIN_MAP[wt.fromBin]?.pos[1] ?? 0;
      const toY = BIN_MAP[wt.toBin]?.pos[1] ?? 0;
      let q: { x: number; z: number; heading: number };
      if (p < 0.22) {
        q = samplePath(approach, (p / 0.22) * pathLen(approach));
      } else if (p < 0.32) {
        q = samplePath(approach, pathLen(approach));
        const k = (p - 0.22) / 0.1;
        forkY = 0.1 + fromY * Math.sin(k * Math.PI);
        carrying = k > 0.5;
      } else if (p < 0.88) {
        q = samplePath(travel, ((p - 0.32) / 0.56) * pathLen(travel));
        carrying = true;
        forkY = 0.25;
      } else {
        q = samplePath(travel, pathLen(travel));
        const k = (p - 0.88) / 0.12;
        forkY = 0.1 + toY * Math.sin(k * Math.PI);
        carrying = k < 0.5;
      }
      pos.current = [q.x, q.z];
      heading.current = lerpAngle(heading.current, q.heading, 0.25);
      if (load.current) load.current.material = loadMaterial(wt.material);
    } else {
      const cur = pos.current;
      if (Math.hypot(cur[0] - home[0], cur[1] - home[1]) > 0.2) {
        if (!back.current) back.current = { pts: manhattan(cur, home), d: 0 };
        back.current.d += dt * 7 * (s.paused ? 0 : 1);
        const q = samplePath(back.current.pts, back.current.d);
        pos.current = [q.x, q.z];
        heading.current = lerpAngle(heading.current, q.heading, 0.2);
      } else back.current = null;
    }
    g.position.set(pos.current[0], 0, pos.current[1]);
    g.rotation.y = heading.current;
    if (forks.current) forks.current.position.y += (forkY - forks.current.position.y) * 0.3;
    if (load.current) load.current.visible = carrying;
  });
  return (
    <group
      ref={root}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'forklift', id });
      }}
    >
      <Box s={[1.1, 0.55, 1.6]} p={[0, 0.5, -0.2]} m={M.forklift} />
      <Box s={[1.12, 0.7, 0.55]} p={[0, 0.95, -0.9]} m={M.forklift} />
      {[-0.48, 0.48].map((x) => (
        <Box key={x} s={[0.07, 1.4, 0.07]} p={[x, 1.6, -0.45 + (x > 0 ? 0 : 0)]} m={M.darkSteel} />
      ))}
      {[-0.48, 0.48].map((x) => (
        <Box key={`f${x}`} s={[0.07, 1.4, 0.07]} p={[x, 1.6, 0.35]} m={M.darkSteel} />
      ))}
      <Box s={[1.05, 0.06, 0.95]} p={[0, 2.3, -0.05]} m={M.darkSteel} />
      {/* mast */}
      <Box s={[0.08, 2.4, 0.12]} p={[-0.32, 1.2, 0.75]} m={M.darkSteel} />
      <Box s={[0.08, 2.4, 0.12]} p={[0.32, 1.2, 0.75]} m={M.darkSteel} />
      <group ref={forks} position={[0, 0.1, 0]}>
        <Box s={[0.8, 0.5, 0.06]} p={[0, 0.3, 0.85]} m={M.darkSteel} />
        <Box s={[0.1, 0.05, 1.1]} p={[-0.25, 0.05, 1.4]} m={M.steel} />
        <Box s={[0.1, 0.05, 1.1]} p={[0.25, 0.05, 1.4]} m={M.steel} />
        <mesh ref={load} position={[0, 0.45, 1.45]} material={M.cardboard} castShadow>
          <boxGeometry args={[1.0, 0.75, 1.1]} />
        </mesh>
      </group>
      {[-0.5, 0.5].map((x) =>
        [-0.75, 0.4].map((z) => <Cyl key={`${x}${z}`} rt={0.25} h={0.2} p={[x, 0.25, z]} r={[0, 0, Math.PI / 2]} m={M.tyre} />),
      )}
      <Person p={[0, 0.55, -0.35]} seated helmet={M.helmetYellow} />
      <mesh position={[0, 2.38, -0.1]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial color="#ffb020" emissive="#ff9a00" emissiveIntensity={2.5} />
      </mesh>
    </group>
  );
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function Forklifts() {
  const ids = useApp((s) => (s.sim ? Object.keys(s.sim.forklifts).join(',') : ''));
  return (
    <group>
      {ids.split(',').filter(Boolean).map((id) => (
        <Forklift key={id} id={id} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ trucks
function TruckModel({ trailer, box }: { trailer: THREE.Material; box?: boolean }) {
  const len = box ? 7 : 13.6;
  return (
    <group>
      {/* trailer, rear at x=0, extends to -x */}
      <Box s={[len, 2.75, 2.55]} p={[-len / 2, 2.6, 0]} m={trailer} />
      <Box s={[len, 0.25, 2.4]} p={[-len / 2, 1.1, 0]} m={M.darkSteel} />
      <Box s={[0.08, 2.75, 2.55]} p={[-0.02, 2.6, 0]} m={M.door} />
      {(box ? [-1.2, -2.4] : [-1.4, -2.6, -3.8]).map((x) =>
        [-1, 1].map((sz) => <Cyl key={`${x}${sz}`} rt={0.5} h={0.4} p={[x, 0.5, sz * 1.0]} r={[Math.PI / 2, 0, 0]} m={M.tyre} />),
      )}
      {/* tractor */}
      <group position={[-len - (box ? 0.2 : 1.6), 0, 0]}>
        <Box s={[5.8, 0.4, 2.2]} p={[-1.2, 0.9, 0]} m={M.darkSteel} />
        <Box s={[2.3, 2.6, 2.5]} p={[-3.0, 2.3, 0]} m={M.cab} />
        <mesh position={[-4.16, 2.9, 0]} material={M.glass}>
          <boxGeometry args={[0.05, 1.0, 2.2]} />
        </mesh>
        <Box s={[0.2, 0.5, 2.4]} p={[-4.2, 1.3, 0]} m={M.darkSteel} />
        {[-3.4, 0.2, 1.4].map((x) =>
          [-1, 1].map((sz) => <Cyl key={`${x}${sz}`} rt={0.5} h={0.4} p={[x, 0.5, sz * 1.0]} r={[Math.PI / 2, 0, 0]} m={M.tyre} />),
        )}
      </group>
    </group>
  );
}

interface TruckInfo {
  id: string;
  side: 'in' | 'out';
  dock: number;
  arrive: number;
  depart?: number;
  trailer: THREE.Material;
  box?: boolean;
}

function trucks(s: SimState): TruckInfo[] {
  const out: TruckInfo[] = [];
  for (const d of docsOf(s, 'IBD')) {
    if (d.arrivedAt === undefined || d.dock === undefined) continue;
    if (d.departAt !== undefined && s.t > d.departAt + 6) continue;
    out.push({ id: d.id, side: 'in', dock: d.dock, arrive: d.arrivedAt, depart: d.departAt, trailer: d.supplier === 'SUP-1002' ? M.trailerGrey : M.trailerWhite });
  }
  for (const d of docsOf(s, 'SHP')) {
    if (d.arrivedAt === undefined) continue;
    if (d.departedAt !== undefined && s.t > d.departedAt + 6) continue;
    out.push({ id: d.id, side: 'out', dock: d.dock, arrive: d.arrivedAt, depart: d.departedAt, trailer: d.carrier === 'CR-01' ? M.trailerBlue : d.carrier === 'CR-02' ? M.trailerGreen : M.safetyYellow, box: d.carrier === 'CR-03' });
  }
  return out;
}

function Truck({ info }: { info: TruckInfo }) {
  const g = useRef<THREE.Group>(null);
  const select = useApp((s) => s.select);
  const door = info.side === 'in' ? INBOUND_DOORS[info.dock] : OUTBOUND_DOORS[info.dock];
  const dir = info.side === 'in' ? -1 : 1;
  useFrame(() => {
    if (!g.current) return;
    const t = simNow();
    let off = 0;
    const inT = t - info.arrive;
    if (inT < 3) off = (1 - Math.max(0, inT) / 3) ** 2 * 26;
    if (info.depart !== undefined && t > info.depart) off = ((t - info.depart) / 5) ** 2 * 60;
    g.current.position.set(door[0] + dir * (0.6 + off), 0, door[1]);
    g.current.visible = off < 70;
  });
  return (
    <group
      ref={g}
      rotation-y={info.side === 'in' ? 0 : Math.PI}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'truck', id: info.id });
      }}
    >
      <TruckModel trailer={info.trailer} box={info.box} />
    </group>
  );
}

export function Trucks() {
  const key = useApp((s) => (s.sim ? trucks(s.sim).map((t) => `${t.id}:${t.dock}:${t.depart ?? ''}`).join('|') : ''));
  const list = useMemo(() => {
    const s = getSim();
    return s ? trucks(s) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <group>
      {list.map((t) => (
        <Truck key={t.id} info={t} />
      ))}
      {/* parked trailers in the yard for atmosphere */}
      {[-24, -15, 3, 12].map((x, i) => (
        <group key={x} position={[x, 0, 58]} rotation-y={Math.PI / 2}>
          <TruckModel trailer={[M.trailerWhite, M.trailerBlue, M.trailerGrey, M.trailerGreen][i]} />
        </group>
      ))}
    </group>
  );
}

