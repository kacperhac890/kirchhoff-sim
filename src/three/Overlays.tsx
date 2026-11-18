// Production flow lines + the projector that pins DOM labels to 3D positions.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { PSA_FOR_GROUP, BIN_MAP, docsOf, machineDef, type ProductionOrder } from '../engine';
import { useApp } from '../store/store';
import { LABEL_ANCHORS } from './labelAnchors';

const FLOW_COLORS = ['#5aa3f0', '#e9b949', '#56d3b0', '#d98bf2', '#f08a5d'];

function orderPath(pp: ProductionOrder): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const firstGroup = pp.ops[0].wcGroup;
  const psa = PSA_FOR_GROUP[firstGroup];
  if (psa && BIN_MAP[psa]) pts.push([BIN_MAP[psa].pos[0], 0.12, BIN_MAP[psa].pos[2]]);
  for (const op of pp.ops) {
    if (!op.machine) break;
    const d = machineDef(op.machine);
    pts.push([d.pos[0], 0.12, d.pos[1]]);
  }
  // route through the aisle so lines don't cross machines
  const out: [number, number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      const a = pts[i - 1];
      const b = pts[i];
      out.push([a[0], 0.12, -4 + (i % 2) * 0.6], [b[0], 0.12, -4 + (i % 2) * 0.6]);
    }
    out.push(pts[i]);
  }
  return out;
}

function FlowLine({ pp, color }: { pp: ProductionOrder; color: string }) {
  const pts = useMemo(() => orderPath(pp), [pp]);
  const dots = useRef<THREE.InstancedMesh>(null);
  const t = useRef(0);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const curve = useMemo(() => {
    if (pts.length < 2) return null;
    const c = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < pts.length; i++) c.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i - 1]), new THREE.Vector3(...pts[i])));
    return c;
  }, [pts]);
  useFrame((_, dt) => {
    if (!curve || !dots.current) return;
    if (!useApp.getState().sim?.paused) t.current = (t.current + dt * 0.06) % 1;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const p = curve.getPointAt((t.current + i / n) % 1);
      tmp.position.copy(p).setY(0.18);
      tmp.updateMatrix();
      dots.current.setMatrixAt(i, tmp.matrix);
    }
    dots.current.instanceMatrix.needsUpdate = true;
  });
  if (pts.length < 2) return null;
  return (
    <group>
      <Line points={pts} color={color} lineWidth={2} dashed dashSize={0.8} gapSize={0.6} transparent opacity={0.75} />
      <instancedMesh ref={dots} args={[undefined, undefined, 14]}>
        <sphereGeometry args={[0.16, 10, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

export function Flows() {
  const key = useApp((s) =>
    s.sim
      ? docsOf(s.sim, 'PP')
          .filter((p) => p.status === 'IN_PROGRESS')
          .map((p) => `${p.id}:${p.ops.filter((o) => o.machine).length}`)
          .join('|')
      : '',
  );
  const orders = useMemo(() => {
    const s = useApp.getState().sim;
    return s ? docsOf(s, 'PP').filter((p) => p.status === 'IN_PROGRESS') : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <group>
      {orders.map((pp, i) => (
        <FlowLine key={`${pp.id}-${key}`} pp={pp} color={FLOW_COLORS[i % FLOW_COLORS.length]} />
      ))}
    </group>
  );
}

/**
 * Projects every registered DOM label onto the canvas each frame. Labels are plain
 * DOM nodes outside the R3F tree (no extra React roots), positioned by transform.
 */
export function LabelProjector() {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const a of LABEL_ANCHORS.values()) {
      if (!a.el) continue;
      v.set(a.x, a.y, a.z).project(camera);
      const behind = v.z > 1 || v.z < -1;
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      const off = behind || x < -80 || y < -40 || x > size.width + 80 || y > size.height + 40;
      a.el.style.visibility = off ? 'hidden' : 'visible';
      if (!off) a.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  });
  return null;
}
