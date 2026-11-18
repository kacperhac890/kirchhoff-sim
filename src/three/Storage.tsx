// Racks, sheet stacks, supply areas and docks — loads are rendered from the
// real stock quants, every bin is clickable.
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { BINS, BIN_MAP, RACK_DEFS, palletsOf, type BinDef, type Quant } from '../engine';
import { useApp } from '../store/store';
import { FONT_MONO, M } from './materials';

const tmp = new THREE.Object3D();

function setInst(im: THREE.InstancedMesh | null, list: THREE.Matrix4[]) {
  if (!im) return;
  im.count = list.length;
  list.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true;
}
function mat(p: [number, number, number], s: [number, number, number] = [1, 1, 1], ry = 0) {
  tmp.position.set(...p);
  tmp.rotation.set(0, ry, 0);
  tmp.scale.set(...s);
  tmp.updateMatrix();
  return tmp.matrix.clone();
}

export function RackFrames() {
  const { uprights, beams, labels } = useMemo(() => {
    const u: THREE.Matrix4[] = [];
    const b: THREE.Matrix4[] = [];
    const l: { text: string; p: [number, number, number] }[] = [];
    for (const r of RACK_DEFS) {
      const depth = r.type === 'SPARE' ? 0.7 : 1.1;
      const h = r.levels * r.levelPitch + 0.6;
      for (let i = 0; i <= r.bays; i++) {
        const z = r.zStart - r.bayPitch / 2 + i * r.bayPitch;
        for (const s of [-1, 1]) u.push(mat([r.x + (s * depth) / 2, h / 2, z], [1, h, 1]));
      }
      for (let bay = 0; bay < r.bays; bay++) {
        const z = r.zStart + bay * r.bayPitch;
        for (let lv = 1; lv <= r.levels; lv++) {
          const y = lv * r.levelPitch;
          for (const s of [-1, 1]) b.push(mat([r.x + (s * depth) / 2, y, z], [1, 1, r.bayPitch - 0.1]));
        }
      }
      l.push({ text: `${r.wh}-${r.rack}`, p: [r.x, 0.03, r.zStart - r.bayPitch / 2 - 0.9] });
    }
    return { uprights: u, beams: b, labels: l };
  }, []);
  return (
    <group>
      <instancedMesh ref={(r) => setInst(r, uprights)} args={[undefined, undefined, uprights.length]} material={M.rackBlue} castShadow receiveShadow>
        <boxGeometry args={[0.1, 1, 0.1]} />
      </instancedMesh>
      <instancedMesh ref={(r) => setInst(r, beams)} args={[undefined, undefined, beams.length]} material={M.rackOrange} castShadow>
        <boxGeometry args={[0.08, 0.14, 1]} />
      </instancedMesh>
      {labels.map((l) => (
        <Text key={l.text} font={FONT_MONO} fontSize={0.6} color="#dfe5ea" position={l.p} rotation-x={-Math.PI / 2} anchorX="center">
          {l.text}
        </Text>
      ))}
      {/* sheet storage dunnage rails */}
      {BINS.filter((b) => b.type === 'SHEET').map((b) => (
        <group key={b.id} position={[b.pos[0], 0, b.pos[2]]}>
          {[-0.9, 0, 0.9].map((x) => (
            <mesh key={x} position={[x, 0.06, 0]} material={M.wood} receiveShadow>
              <boxGeometry args={[0.14, 0.12, 1.5]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

type Shape = 'pallet' | 'crate' | 'drum' | 'ibc' | 'fg' | 'sheet' | 'alsi' | 'tube' | 'tagQI' | 'tagBLK';

function shapeFor(material: string): Shape {
  if (material === 'RM-S355') return 'sheet';
  if (material === 'RM-22MNB5') return 'alsi';
  if (material === 'RM-WIRE') return 'drum';
  if (material === 'RM-KTL') return 'ibc';
  if (material === 'RM-TUBE') return 'tube';
  if (material.startsWith('FG-')) return 'fg';
  return 'crate';
}

/** Slot positions for N pallets inside a bin. */
function slots(bin: BinDef, n: number): [number, number, number][] {
  const [x, y, z] = bin.pos;
  if (bin.type === 'RACK' || bin.type === 'FGRACK') return [[x, y, z - 0.85], [x, y, z + 0.85]].slice(0, n) as [number, number, number][];
  if (bin.type === 'SPARE') return [[x, y, z - 0.75], [x, y, z], [x, y, z + 0.75]].slice(0, n) as [number, number, number][];
  if (bin.type === 'SHEET') return Array.from({ length: n }, (_, i) => [x, 0.14 + i * 0.16, z] as [number, number, number]);
  // floor areas: 2 columns
  return Array.from({ length: n }, (_, i) => [x + (i % 2) * 1.5 - 0.75, 0, z + Math.floor(i / 2) * 1.3 - 1.3] as [number, number, number]);
}

export function StockLoads() {
  useApp((s) => s.rev);
  const sim = useApp.getState().sim;
  const refs = useRef<Partial<Record<Shape, THREE.InstancedMesh | null>>>({});
  const lists: Record<Shape, THREE.Matrix4[]> = { pallet: [], crate: [], drum: [], ibc: [], fg: [], sheet: [], alsi: [], tube: [], tagQI: [], tagBLK: [] };
  if (sim) {
    const byBin = new Map<string, Quant[]>();
    for (const q of Object.values(sim.quants)) {
      if (q.qty <= 0 && q.physical <= 0) continue;
      const arr = byBin.get(q.bin) ?? [];
      arr.push(q);
      byBin.set(q.bin, arr);
    }
    for (const [binId, qs] of byBin) {
      const bin = BIN_MAP[binId];
      if (!bin) continue;
      const units: { material: string; stockType: string }[] = [];
      for (const q of qs) {
        const n = palletsOf({ material: q.material, qty: Math.max(q.qty, q.physical) });
        for (let i = 0; i < n; i++) units.push({ material: q.material, stockType: q.stockType });
      }
      const cap = bin.type === 'SHEET' ? 7 : bin.type === 'DOCK' || bin.type === 'PSA' || bin.type === 'QA' ? 8 : bin.capacity;
      const pos = slots(bin, Math.min(units.length, cap));
      pos.forEach((p, i) => {
        const u = units[i];
        const shape = shapeFor(u.material);
        const onFloor = bin.type !== 'SHEET';
        if (onFloor && shape !== 'sheet' && shape !== 'alsi') lists.pallet.push(mat([p[0], p[1] + 0.07, p[2]], [1, 1, 1], bin.type === 'RACK' || bin.type === 'FGRACK' || bin.type === 'SPARE' ? Math.PI / 2 : 0));
        const base = p[1] + (onFloor ? 0.14 : 0);
        const rot = bin.type === 'RACK' || bin.type === 'FGRACK' || bin.type === 'SPARE' ? Math.PI / 2 : 0;
        switch (shape) {
          case 'sheet':
          case 'alsi':
            lists[shape].push(mat([p[0], base + (onFloor ? 0.14 : 0.06), p[2]], [1, 1, 1], onFloor ? rot + Math.PI / 2 : 0));
            break;
          case 'drum':
            lists.drum.push(mat([p[0], base + 0.45, p[2]]));
            break;
          case 'ibc':
            lists.ibc.push(mat([p[0], base + 0.5, p[2]]));
            break;
          case 'tube':
            lists.tube.push(mat([p[0], base + 0.35, p[2]], [1, 1, 1], rot));
            break;
          case 'fg':
            lists.fg.push(mat([p[0], base + 0.42, p[2]], [1, 1, 1], rot));
            break;
          default:
            lists.crate.push(mat([p[0], base + 0.35, p[2]], bin.type === 'SPARE' ? [0.6, 0.6, 0.6] : [1, 1, 1], rot));
        }
        if (u.stockType === 'QI') lists.tagQI.push(mat([p[0], base + 1.0, p[2]]));
        if (u.stockType === 'BLK') lists.tagBLK.push(mat([p[0], base + 1.0, p[2]]));
      });
    }
  }
  const geo = useMemo(
    () => ({
      pallet: new THREE.BoxGeometry(1.2, 0.14, 0.8),
      crate: new THREE.BoxGeometry(1.1, 0.7, 0.75),
      drum: new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16),
      ibc: new THREE.BoxGeometry(1.0, 1.0, 0.8),
      fg: new THREE.BoxGeometry(1.15, 0.84, 0.78),
      sheet: new THREE.BoxGeometry(2.5, 0.13, 1.25),
      alsi: new THREE.BoxGeometry(2.5, 0.13, 1.25),
      tube: new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10),
      tagQI: new THREE.BoxGeometry(0.5, 0.06, 0.5),
      tagBLK: new THREE.BoxGeometry(0.5, 0.06, 0.5),
    }),
    [],
  );
  const mats: Record<Shape, THREE.Material> = useMemo(
    () => ({
      pallet: M.wood,
      crate: M.cardboard,
      drum: M.drum,
      ibc: M.ibc,
      fg: M.ktlBlack,
      sheet: M.sheetSteel,
      alsi: M.alsi,
      tube: M.steel,
      tagQI: new THREE.MeshBasicMaterial({ color: '#ffc93d', toneMapped: false }),
      tagBLK: new THREE.MeshBasicMaterial({ color: '#ff4b3e', toneMapped: false }),
    }),
    [],
  );
  const shapes = Object.keys(lists) as Shape[];
  return (
    <group>
      {shapes.map((k) => (
        <instancedMesh
          key={k}
          ref={(r) => {
            refs.current[k] = r;
            setInst(r, lists[k]);
          }}
          args={[geo[k], mats[k], 400]}
          castShadow={k !== 'tagQI' && k !== 'tagBLK'}
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

/** Invisible hit boxes for every bin + hover/selection highlight. */
export function BinPicker() {
  const select = useApp((s) => s.select);
  const selected = useApp((s) => (s.selection?.kind === 'bin' ? s.selection.id : null));
  const [hover, setHover] = useState<number | null>(null);
  const boxes = useMemo(
    () =>
      BINS.map((b) => {
        const rack = RACK_DEFS.find((r) => `${r.wh}-${r.rack}` === b.rack);
        if (rack) return { b, c: [b.pos[0], b.pos[1] + rack.levelPitch / 2, b.pos[2]] as [number, number, number], s: [rack.type === 'SPARE' ? 0.8 : 1.2, rack.levelPitch * 0.94, rack.bayPitch * 0.94] as [number, number, number] };
        if (b.type === 'SHEET') return { b, c: [b.pos[0], 0.6, b.pos[2]] as [number, number, number], s: [2.8, 1.2, 1.6] as [number, number, number] };
        return { b, c: [b.pos[0], 0.6, b.pos[2] - 0.6] as [number, number, number], s: [3.2, 1.2, 4.2] as [number, number, number] };
      }),
    [],
  );
  const matrices = useMemo(() => boxes.map((x) => mat(x.c, x.s)), [boxes]);
  const sel = boxes.find((x) => x.b.id === selected);
  const hov = hover !== null ? boxes[hover] : undefined;
  return (
    <group>
      <instancedMesh
        ref={(r) => setInst(r, matrices)}
        args={[undefined, undefined, boxes.length]}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) select({ kind: 'bin', id: boxes[e.instanceId].b.id });
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined && e.instanceId !== hover) {
            setHover(e.instanceId);
            document.body.style.cursor = 'pointer';
          }
        }}
        onPointerOut={() => {
          setHover(null);
          document.body.style.cursor = '';
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </instancedMesh>
      {hov && hov !== sel && <Outline c={hov.c} s={hov.s} color="#a9cdf5" />}
      {sel && <Outline c={sel.c} s={sel.s} color="#5aa3f0" />}
    </group>
  );
}

function Outline({ c, s, color }: { c: [number, number, number]; s: [number, number, number]; color: string }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...s)), [s]);
  return (
    <lineSegments position={c} geometry={geo}>
      <lineBasicMaterial color={color} toneMapped={false} />
    </lineSegments>
  );
}

export function binLabel(binId: string) {
  const b = BIN_MAP[binId];
  if (!b) return binId;
  return b.type === 'SHEET' ? 'Sheet stack bay' : b.type === 'PSA' ? 'Production supply area' : b.type === 'DOCK' ? 'Dock staging' : b.type === 'QA' ? 'QC output' : `Rack level ${b.level}`;
}

