// Procedural machine models. Every animation reads the engine state each
// frame: no operation running → no motion.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { MACHINES, type MachineDef } from '../engine';
import { useApp } from '../store/store';
import { FONT_MONO, M, STATUS_COLOR, isRunning, machineState, reducedMotion } from './materials';

type V3 = [number, number, number];

export function Box({ s, p = [0, 0, 0], m, r, cast = true }: { s: V3; p?: V3; m: THREE.Material; r?: V3; cast?: boolean }) {
  return (
    <mesh position={p} rotation={r} material={m} castShadow={cast} receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  );
}
export function Cyl({ rt, rb, h, p = [0, 0, 0], m, r, seg = 18, cast = true }: { rt: number; rb?: number; h: number; p?: V3; m: THREE.Material; r?: V3; seg?: number; cast?: boolean }) {
  return (
    <mesh position={p} rotation={r} material={m} castShadow={cast} receiveShadow>
      <cylinderGeometry args={[rt, rb ?? rt, h, seg]} />
    </mesh>
  );
}

const ANIM_SPEED = () => {
  const s = useApp.getState().sim;
  if (!s || s.paused) return 0;
  return reducedMotion ? 0.35 : 1 + Math.log2(Math.max(1, s.speed)) * 0.25;
};

// ------------------------------------------------------------ status beacon
const lampMats = (['STOPPED', 'WARNING', 'RUNNING', 'MAINT'] as const).map(
  (k) => new THREE.MeshStandardMaterial({ color: STATUS_COLOR[k], emissive: STATUS_COLOR[k], emissiveIntensity: 0.05, roughness: 0.4 }),
);
export function StatusBeacon({ id, p }: { id: string; p: V3 }) {
  const mats = useMemo(() => lampMats.map((m) => m.clone()), []);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const st = machineState(id)?.status ?? 'IDLE';
    const idx = st === 'STOPPED' ? 0 : st === 'WARNING' ? 1 : st === 'RUNNING' ? 2 : st === 'MAINT' || st === 'SETUP' ? 3 : -1;
    const blink = st === 'STOPPED' ? (Math.sin(clock.elapsedTime * 7) > 0 ? 1 : 0.15) : 1;
    mats.forEach((m, i) => {
      m.emissiveIntensity = i === idx ? 4.2 * blink : 0.04;
    });
    if (ring.current) {
      const mat = ring.current.material as THREE.MeshBasicMaterial;
      mat.color.set(STATUS_COLOR[st]);
      mat.opacity = st === 'IDLE' ? 0.0 : 0.85 * blink;
    }
  });
  return (
    <group position={p}>
      <Cyl rt={0.04} h={1.2} p={[0, 0.6, 0]} m={M.darkSteel} cast={false} />
      {mats.map((m, i) => (
        <mesh key={i} position={[0, 1.32 + (3 - i) * 0.2, 0]} material={m}>
          <cylinderGeometry args={[0.1, 0.1, 0.18, 14]} />
        </mesh>
      ))}
      <mesh position={[0, 2.08, 0]} material={M.darkSteel}>
        <cylinderGeometry args={[0.1, 0.1, 0.04, 14]} />
      </mesh>
      <mesh ref={ring} position={[0, 2.2, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.16, 0.24, 24]} />
        <meshBasicMaterial transparent toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------ shell: selection, hover, beacon
export function MachineShell({ def, size, beacon, children, label = true }: { def: MachineDef; size: [number, number, number]; beacon: V3; children: ReactNode; label?: boolean }) {
  const select = useApp((s) => s.select);
  const selected = useApp((s) => s.selection?.kind === 'machine' && s.selection.id === def.id);
  const [hover, setHover] = useState(false);
  return (
    <group position={[def.pos[0], 0, def.pos[1]]} rotation-y={def.rot}>
      {children}
      <StatusBeacon id={def.id} p={beacon} />
      {label && (
        <Text font={FONT_MONO} fontSize={0.42} color="#e8edf2" anchorX="center" anchorY="middle" position={[0, 0.03, size[2] / 2 + 0.55]} rotation-x={-Math.PI / 2}>
          {def.id}
        </Text>
      )}
      {/* hit volume */}
      <mesh
        position={[0, size[1] / 2, 0]}
        material={M.hit}
        onClick={(e) => {
          e.stopPropagation();
          select({ kind: 'machine', id: def.id });
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      >
        <boxGeometry args={size} />
      </mesh>
      {(selected || hover) && <SelectFrame w={size[0] + 0.8} d={size[2] + 0.8} strong={selected} />}
    </group>
  );
}

const frameMat = new THREE.MeshBasicMaterial({ color: '#5aa3f0', toneMapped: false, transparent: true, opacity: 0.95 });
const frameMatSoft = new THREE.MeshBasicMaterial({ color: '#a9cdf5', toneMapped: false, transparent: true, opacity: 0.55 });
export function SelectFrame({ w, d, strong }: { w: number; d: number; strong?: boolean }) {
  const mat = strong ? frameMat : frameMatSoft;
  const t = 0.09;
  const L = Math.min(w, d) * 0.28;
  const corners: [number, number, number, number][] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      corners.push([(sx * w) / 2 - (sx * L) / 2, (sz * d) / 2, L, t]);
      corners.push([(sx * w) / 2, (sz * d) / 2 - (sz * L) / 2, t, L]);
    }
  return (
    <group position={[0, 0.03, 0]}>
      {corners.map(([x, z, a, b], i) => (
        <mesh key={i} position={[x, 0, z]} rotation-x={-Math.PI / 2} material={mat}>
          <planeGeometry args={[a, b]} />
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------ conveyor with moving parts
export function Conveyor({ id, from, to, y = 0.9, width = 1.1, item = [0.6, 0.12, 0.45], itemMat = M.partGrey, count = 6 }: { id: string; from: V3; to: V3; y?: number; width?: number; item?: V3; itemMat?: THREE.Material; count?: number }) {
  const dir = new THREE.Vector3(to[0] - from[0], 0, to[2] - from[2]);
  const len = dir.length();
  const ang = Math.atan2(-dir.z, dir.x);
  const items = useRef<THREE.InstancedMesh>(null);
  const offset = useRef(0);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    if (isRunning(id)) offset.current = (offset.current + dt * 0.9 * ANIM_SPEED()) % 1;
    const im = items.current;
    if (!im) return;
    for (let i = 0; i < count; i++) {
      const f = ((i / count + offset.current) % 1) - 0.5;
      tmp.position.set(f * len, y + 0.12, 0);
      tmp.updateMatrix();
      im.setMatrixAt(i, tmp.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  });
  const mid: V3 = [(from[0] + to[0]) / 2, 0, (from[2] + to[2]) / 2];
  const legs = Math.max(2, Math.round(len / 1.6));
  return (
    <group position={mid} rotation-y={ang}>
      <Box s={[len, 0.12, width]} p={[0, y, 0]} m={M.rubber} />
      <Box s={[len, 0.18, 0.08]} p={[0, y - 0.02, width / 2]} m={M.galvanized} />
      <Box s={[len, 0.18, 0.08]} p={[0, y - 0.02, -width / 2]} m={M.galvanized} />
      {Array.from({ length: legs }, (_, i) => (
        <Box key={i} s={[0.08, y, width * 0.9]} p={[-len / 2 + (i + 0.5) * (len / legs), y / 2, 0]} m={M.galvanized} cast={false} />
      ))}
      <instancedMesh ref={items} args={[undefined, undefined, count]} material={itemMat} castShadow>
        <boxGeometry args={item} />
      </instancedMesh>
    </group>
  );
}

// ------------------------------------------------------------ PRESS
export function Press({ def, color = M.pressBlue, accent = M.safetyYellow }: { def: MachineDef; color?: THREE.Material; accent?: THREE.Material }) {
  const ram = useRef<THREE.Group>(null);
  const transfer = useRef<THREE.Group>(null);
  const phase = useRef(Math.random() * 6);
  useFrame((_, dt) => {
    const run = isRunning(def.id);
    if (run) phase.current += dt * 2.4 * ANIM_SPEED();
    const p = phase.current;
    const stroke = run ? 0.5 + 0.5 * Math.cos(p) : 1;
    if (ram.current) ram.current.position.y += (3.45 + 2.15 * stroke - ram.current.position.y) * (run ? 1 : 0.06);
    if (transfer.current) transfer.current.position.x = run ? Math.sin(p) * 0.45 : 0;
  });
  return (
    <MachineShell def={def} size={[7.5, 9.5, 5.6]} beacon={[3.6, 0, -2.4]}>
      <Box s={[8, 0.06, 6.4]} p={[0, 0.03, 0]} m={M.concreteDark} cast={false} />
      <Box s={[6, 1.3, 4]} p={[0, 0.65, 0]} m={color} />
      <Box s={[4.6, 0.3, 3.2]} p={[0, 1.45, 0]} m={M.darkSteel} />
      <Box s={[3.6, 0.6, 2.4]} p={[0, 1.9, 0]} m={M.steel} />
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => <Box key={`${sx}${sz}`} s={[1, 5.6, 1]} p={[sx * 2.6, 4.1, sz * 1.6]} m={color} />),
      )}
      {/* yellow edge stripes on the uprights */}
      {[-1, 1].map((sx) => (
        <Box key={`st${sx}`} s={[1.02, 0.25, 1.02]} p={[sx * 2.6, 2.1, 1.6]} m={accent} cast={false} />
      ))}
      <Box s={[6.6, 1.8, 4.6]} p={[0, 7.8, 0]} m={color} />
      <Box s={[6.7, 0.18, 4.7]} p={[0, 6.95, 0]} m={accent} cast={false} />
      <Cyl rt={0.7} h={2.2} p={[-1.2, 9.2, 0]} r={[0, 0, Math.PI / 2]} m={M.darkSteel} />
      <Cyl rt={1.25} h={0.45} p={[2.1, 9.15, 0]} r={[0, 0, Math.PI / 2]} m={M.machineGrey} />
      <Box s={[1.2, 0.9, 1.4]} p={[0.6, 9.1, -1.2]} m={M.machineGrey} />
      <group ref={ram} position={[0, 5.6, 0]}>
        <Box s={[4.4, 1.4, 3]} p={[0, 0, 0]} m={M.pressGrey} />
        <Box s={[3.6, 0.5, 2.4]} p={[0, -0.95, 0]} m={M.brightSteel} />
      </group>
      <group ref={transfer}>
        {[-1, 1].map((sz) => (
          <Box key={sz} s={[7.4, 0.12, 0.14]} p={[0, 2.35, sz * 1.0]} m={M.galvanized} cast={false} />
        ))}
      </group>
      {/* light curtain posts */}
      {[-1, 1].map((sx) => (
        <Box key={`lc${sx}`} s={[0.12, 2.0, 0.12]} p={[sx * 2.1, 1.0, 2.6]} m={M.safetyYellow} />
      ))}
      {/* control pendant */}
      <Cyl rt={0.05} h={1.5} p={[3.7, 0.75, 2.4]} m={M.darkSteel} cast={false} />
      <Box s={[0.6, 0.45, 0.2]} p={[3.7, 1.55, 2.4]} m={M.machineWhite} />
      <Box s={[0.46, 0.3, 0.02]} p={[3.7, 1.57, 2.51]} m={M.screen} cast={false} />
      {/* blank destacker */}
      <Box s={[1.2, 0.15, 1.6]} p={[-4.4, 0.08, 0]} m={M.wood} />
      <Box s={[1.1, 0.6, 1.4]} p={[-4.4, 0.45, 0]} m={M.sheetSteel} />
      <Conveyor id={def.id} from={[3.2, 0, 0]} to={[8.2, 0, 0]} y={1.0} item={[0.7, 0.16, 0.5]} />
      <Text font={FONT_MONO} fontSize={0.38} color="#f1f4f7" position={[0, 7.8, 2.31]} anchorX="center" anchorY="middle">
        {def.id}
      </Text>
    </MachineShell>
  );
}

// ------------------------------------------------------------ LASER CELL
const accentBlue = new THREE.MeshStandardMaterial({ color: '#2f6fd1', roughness: 0.45, metalness: 0.2 });
export function LaserCell({ def, blanking }: { def: MachineDef; blanking?: boolean }) {
  const gantry = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);
  const t = useRef(Math.random() * 10);
  useFrame((_, dt) => {
    const run = isRunning(def.id);
    if (run) t.current += dt * ANIM_SPEED();
    const p = t.current;
    if (gantry.current) gantry.current.position.x = run ? Math.sin(p * 0.9) * 1.7 : gantry.current.position.x * 0.97;
    if (head.current) head.current.position.z = run ? Math.sin(p * 2.3) * 1.1 : head.current.position.z * 0.97;
    if (glow.current) {
      glow.current.visible = run;
      const s = 0.8 + Math.random() * 0.5;
      glow.current.scale.setScalar(s);
    }
  });
  return (
    <MachineShell def={def} size={[blanking ? 13 : 7, 4.5, 7.5]} beacon={[2.9, 2.8, -2.2]}>
      <Box s={[5.6, 0.08, 4.4]} p={[0, 0.04, 0]} m={M.concreteDark} cast={false} />
      {/* enclosure walls (open front window) */}
      <Box s={[5.6, 2.8, 0.12]} p={[0, 1.4, -2.1]} m={M.machineWhite} />
      <Box s={[0.12, 2.8, 4.2]} p={[-2.8, 1.4, 0]} m={M.machineWhite} />
      <Box s={[0.12, 2.8, 4.2]} p={[2.8, 1.4, 0]} m={M.machineWhite} />
      <Box s={[5.6, 0.12, 4.2]} p={[0, 2.8, 0]} m={M.machineWhite} />
      <Box s={[5.6, 1.0, 0.12]} p={[0, 0.5, 2.1]} m={M.machineWhite} />
      <Box s={[5.6, 0.5, 0.12]} p={[0, 2.55, 2.1]} m={M.machineWhite} />
      <mesh position={[0, 1.65, 2.1]} material={M.glass}>
        <boxGeometry args={[5.4, 1.3, 0.04]} />
      </mesh>
      <Box s={[5.62, 0.16, 4.22]} p={[0, 2.35, 0]} m={accentBlue} cast={false} />
      {/* bed with slats */}
      <Box s={[4.6, 0.7, 3.2]} p={[0, 0.35, 0]} m={M.darkSteel} />
      <Box s={[3.0, 0.03, 1.5]} p={[0, 0.72, 0]} m={blanking ? M.sheetSteel : M.partGrey} cast={false} />
      {/* gantry + head */}
      <group ref={gantry} position={[0, 0, 0]}>
        <Box s={[0.3, 0.3, 3.8]} p={[0, 2.2, 0]} m={M.machineGrey} />
        <group ref={head} position={[0, 0, 0]}>
          <Box s={[0.32, 0.9, 0.32]} p={[0, 1.65, 0]} m={M.darkSteel} />
          <Cyl rt={0.06} rb={0.1} h={0.35} p={[0, 1.05, 0]} m={M.brightSteel} />
          <mesh ref={glow} position={[0, 0.82, 0]} material={M.laserGlow}>
            <sphereGeometry args={[0.07, 10, 10]} />
          </mesh>
        </group>
      </group>
      {/* extraction duct */}
      <Cyl rt={0.3} h={2.2} p={[-2.0, 3.9, -1.5]} m={M.galvanized} />
      <Cyl rt={0.3} h={3.2} p={[-3.6, 5.0, -1.5]} r={[0, 0, Math.PI / 2]} m={M.galvanized} />
      {/* shuttle table */}
      <Box s={[3.6, 0.85, 2.0]} p={[0, 0.43, 3.4]} m={M.machineGrey} />
      <Box s={[3.0, 0.04, 1.6]} p={[0, 0.87, 3.4]} m={blanking ? M.sheetSteel : M.partGrey} cast={false} />
      {/* control cabinet */}
      <Box s={[0.7, 2.0, 0.6]} p={[3.4, 1.0, 1.2]} m={M.machineGrey} />
      <Box s={[0.02, 0.35, 0.45]} p={[3.76, 1.5, 1.2]} m={M.screen} cast={false} />
      {blanking && (
        <group>
          {/* decoiler + straightener */}
          <Box s={[1.6, 1.0, 2.0]} p={[-5.4, 0.5, 0]} m={M.pressBlue} />
          <Cyl rt={1.0} h={1.4} p={[-5.4, 1.8, 0]} r={[Math.PI / 2, 0, 0]} m={M.sheetSteel} />
          <Cyl rt={0.35} h={1.45} p={[-5.4, 1.8, 0]} r={[Math.PI / 2, 0, 0]} m={M.darkSteel} />
          <Box s={[1.4, 1.3, 1.6]} p={[-3.7, 0.65, 0]} m={M.pressGrey} />
          <Box s={[0.9, 0.04, 1.2]} p={[-3.1, 1.32, 0]} m={M.sheetSteel} cast={false} />
          <Conveyor id={def.id} from={[2.9, 0, 0]} to={[6.2, 0, 0]} y={0.85} item={[0.8, 0.05, 0.7]} itemMat={M.sheetSteel} count={5} />
          <Box s={[1.4, 0.15, 1.2]} p={[6.9, 0.08, 0]} m={M.wood} />
          <Box s={[1.2, 0.5, 1.0]} p={[6.9, 0.4, 0]} m={M.sheetSteel} />
        </group>
      )}
    </MachineShell>
  );
}

// ------------------------------------------------------------ ROBOT + WELD CELL
function Robot({ id, p, rotY, phase }: { id: string; p: V3; rotY: number; phase: number }) {
  const turret = useRef<THREE.Group>(null);
  const shoulder = useRef<THREE.Group>(null);
  const elbow = useRef<THREE.Group>(null);
  const wrist = useRef<THREE.Group>(null);
  const sparks = useRef<THREE.InstancedMesh>(null);
  const t = useRef(phase);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    const run = isRunning(id);
    if (run) t.current += dt * ANIM_SPEED();
    const k = t.current;
    const ease = run ? 1 : 0.05;
    const lerp = (r: THREE.Group | null, axis: 'y' | 'z', target: number) => {
      if (r) r.rotation[axis] += (target - r.rotation[axis]) * ease;
    };
    lerp(turret.current, 'y', run ? 0.45 * Math.sin(k * 0.9) : 0);
    lerp(shoulder.current, 'z', run ? -0.35 + 0.18 * Math.sin(k * 1.4) : 0.1);
    lerp(elbow.current, 'z', run ? -0.75 + 0.22 * Math.sin(k * 1.9 + 1) : -0.3);
    lerp(wrist.current, 'z', run ? -0.7 + 0.35 * Math.sin(k * 2.6) : -1.0);
    const sp = sparks.current;
    if (sp) {
      sp.visible = run && Math.sin(k * 5) > -0.3;
      for (let i = 0; i < 14; i++) {
        tmp.position.set((Math.random() - 0.5) * 0.25, -Math.random() * 0.22, (Math.random() - 0.5) * 0.25);
        tmp.scale.setScalar(0.5 + Math.random());
        tmp.updateMatrix();
        sp.setMatrixAt(i, tmp.matrix);
      }
      sp.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <group position={p} rotation-y={rotY}>
      <Cyl rt={0.42} h={0.18} p={[0, 0.09, 0]} m={M.robotDark} />
      <Cyl rt={0.33} h={0.45} p={[0, 0.4, 0]} m={M.robotDark} />
      <group ref={turret} position={[0, 0.62, 0]}>
        <Cyl rt={0.32} h={0.35} p={[0, 0.17, 0]} m={M.robotOrange} />
        <Box s={[0.5, 0.35, 0.5]} p={[0.05, 0.42, 0]} m={M.robotOrange} />
        <group ref={shoulder} position={[0.1, 0.55, 0]}>
          <Box s={[0.26, 1.15, 0.3]} p={[0, 0.57, 0]} m={M.robotOrange} />
          <Cyl rt={0.17} h={0.38} p={[0, 0, 0]} r={[Math.PI / 2, 0, 0]} m={M.robotDark} />
          <group ref={elbow} position={[0, 1.12, 0]}>
            <Cyl rt={0.15} h={0.36} p={[0, 0, 0]} r={[Math.PI / 2, 0, 0]} m={M.robotDark} />
            <Box s={[0.35, 0.3, 0.28]} p={[-0.18, 0, 0]} m={M.robotOrange} />
            <Box s={[1.0, 0.2, 0.2]} p={[0.5, 0, 0]} m={M.robotOrange} />
            <group ref={wrist} position={[1.02, 0, 0]}>
              <Box s={[0.18, 0.18, 0.2]} p={[0.05, 0, 0]} m={M.robotDark} />
              <Cyl rt={0.045} h={0.42} p={[0.18, -0.17, 0]} r={[0, 0, 0.6]} m={M.brightSteel} />
              <group position={[0.31, -0.36, 0]}>
                <instancedMesh ref={sparks} args={[undefined, undefined, 14]} material={M.sparkGlow}>
                  <boxGeometry args={[0.025, 0.025, 0.025]} />
                </instancedMesh>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

export function WeldCell({ def }: { def: MachineDef }) {
  const table = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!isRunning(def.id)) return;
    t.current += dt * ANIM_SPEED();
    if (table.current) {
      const cycle = (t.current % 9) / 9;
      table.current.rotation.y = cycle > 0.85 ? Math.PI * ((cycle - 0.85) / 0.15) + Math.floor(t.current / 9) * Math.PI : Math.floor(t.current / 9) * Math.PI;
    }
  });
  const W = 7;
  const D = 6;
  const posts: [number, number][] = [];
  for (let i = 0; i <= 4; i++) posts.push([-W / 2 + (i * W) / 4, -D / 2]);
  for (let i = 1; i <= 3; i++) posts.push([-W / 2, -D / 2 + (i * D) / 4], [W / 2, -D / 2 + (i * D) / 4]);
  posts.push([-W / 2, D / 2], [W / 2, D / 2], [-1.6, D / 2], [1.6, D / 2]);
  return (
    <MachineShell def={def} size={[W + 0.4, 3, D + 0.4]} beacon={[W / 2 - 0.3, 2.1, -D / 2 + 0.3]}>
      <Box s={[W, 0.05, D]} p={[0, 0.025, 0]} m={M.concreteDark} cast={false} />
      {posts.map(([x, z], i) => (
        <Box key={i} s={[0.1, 2.2, 0.1]} p={[x, 1.1, z]} m={M.safetyYellow} cast={false} />
      ))}
      {/* mesh fence panels */}
      <mesh position={[0, 1.15, -D / 2]} material={M.mesh}>
        <planeGeometry args={[W, 2.0]} />
      </mesh>
      <mesh position={[-W / 2, 1.15, 0]} rotation-y={Math.PI / 2} material={M.mesh}>
        <planeGeometry args={[D, 2.0]} />
      </mesh>
      <mesh position={[W / 2, 1.15, 0]} rotation-y={Math.PI / 2} material={M.mesh}>
        <planeGeometry args={[D, 2.0]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 + 1.6) / 2, 1.15, D / 2]} material={M.mesh}>
          <planeGeometry args={[W / 2 - 1.6, 2.0]} />
        </mesh>
      ))}
      {/* welding curtain behind the robots */}
      <mesh position={[0, 1.3, -D / 2 + 0.25]} material={M.weldCurtain}>
        <planeGeometry args={[W - 0.6, 2.2]} />
      </mesh>
      {/* turntable fixture */}
      <Cyl rt={1.5} h={0.5} p={[0, 0.25, 0.6]} m={M.darkSteel} />
      <group ref={table} position={[0, 0.5, 0.6]}>
        <Box s={[2.6, 0.12, 0.7]} p={[0, 0.1, 0]} m={M.machineGrey} />
        <Box s={[2.2, 0.22, 0.32]} p={[0, 0.3, -0.12]} m={M.partGrey} />
        <Box s={[2.2, 0.22, 0.32]} p={[0, 0.3, 0.12]} m={M.partGrey} />
        <Box s={[0.12, 0.6, 0.12]} p={[-1.25, 0.3, 0]} m={M.safetyYellow} cast={false} />
        <Box s={[0.12, 0.6, 0.12]} p={[1.25, 0.3, 0]} m={M.safetyYellow} cast={false} />
      </group>
      <Robot id={def.id} p={[-1.9, 0, -1.3]} rotY={-0.6} phase={0} />
      <Robot id={def.id} p={[1.9, 0, -1.3]} rotY={Math.PI + 0.6} phase={1.7} />
      {/* controllers + wire drums outside the fence */}
      <Box s={[0.7, 1.6, 0.6]} p={[-W / 2 - 0.6, 0.8, -1.6]} m={M.robotDark} />
      <Box s={[0.7, 1.6, 0.6]} p={[W / 2 + 0.6, 0.8, -1.6]} m={M.robotDark} />
      <Cyl rt={0.32} h={0.85} p={[-W / 2 - 0.6, 0.43, 0.2]} m={M.drum} />
      <Cyl rt={0.32} h={0.85} p={[W / 2 + 0.6, 0.43, 0.2]} m={M.drum} />
      {/* operator loading station */}
      <Box s={[1.2, 0.9, 0.6]} p={[2.6, 0.45, D / 2 + 0.6]} m={M.machineGrey} />
      <Box s={[0.5, 0.35, 0.03]} p={[2.6, 1.2, D / 2 + 0.6]} m={M.screen} cast={false} />
    </MachineShell>
  );
}

// ------------------------------------------------------------ HOT FORMING LINE
export function HotFormLine({ def }: { def: MachineDef }) {
  const glowMat = useMemo(() => M.furnaceGlow.clone(), []);
  const blank = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    const st = machineState(def.id)?.status;
    const hot = st === 'RUNNING' || st === 'WARNING' || st === 'SETUP';
    glowMat.emissiveIntensity += ((hot ? 3.2 : 0.25) - glowMat.emissiveIntensity) * 0.03;
    const run = isRunning(def.id);
    if (run) t.current += dt * ANIM_SPEED() * 0.5;
    if (blank.current) {
      blank.current.visible = run;
      const f = t.current % 1;
      blank.current.position.x = -6.4 + f * 3.4;
      blank.current.position.y = 1.55 + (f > 0.85 ? -(f - 0.85) * 1.6 : 0);
    }
  });
  return (
    <group>
      {/* furnace extends to the west of the press */}
      <group position={[def.pos[0] - 13, 0, def.pos[1]]}>
        <Box s={[15, 0.06, 4.6]} p={[0, 0.03, 0]} m={M.concreteDark} cast={false} />
        {Array.from({ length: 6 }, (_, i) => (
          <Box key={i} s={[0.3, 1.0, 2.8]} p={[-6 + i * 2.4, 0.5, 0]} m={M.darkSteel} />
        ))}
        <Box s={[14, 2.2, 3.0]} p={[0, 2.1, 0]} m={M.claddingDark} />
        <Box s={[14.1, 0.16, 3.1]} p={[0, 2.85, 0]} m={M.safetyYellow} cast={false} />
        <mesh position={[0, 1.45, 1.52]} material={glowMat}>
          <boxGeometry args={[13.2, 0.16, 0.02]} />
        </mesh>
        <mesh position={[0, 1.45, -1.52]} material={glowMat}>
          <boxGeometry args={[13.2, 0.16, 0.02]} />
        </mesh>
        <mesh position={[7.02, 1.6, 0]} material={glowMat}>
          <boxGeometry args={[0.02, 0.5, 2.0]} />
        </mesh>
        {[-4, 0, 4].map((x) => (
          <Cyl key={x} rt={0.28} h={3.2} p={[x, 4.8, 0.6]} m={M.galvanized} />
        ))}
        {/* entry table with blanks */}
        <Box s={[2.2, 0.9, 2.4]} p={[-8.3, 0.45, 0]} m={M.machineGrey} />
        <Box s={[1.6, 0.25, 1.4]} p={[-8.3, 1.05, 0]} m={M.alsi} />
      </group>
      <group position={[def.pos[0], 0, def.pos[1]]}>
        <mesh ref={blank} material={M.hotBlank} castShadow>
          <boxGeometry args={[1.3, 0.05, 1.0]} />
        </mesh>
      </group>
      <Press def={def} color={M.pressGrey} accent={M.robotOrange} />
    </group>
  );
}

// ------------------------------------------------------------ KTL LINE
const RAIL_X0 = -11;
const RAIL_X1 = 11;
export function KtlLine({ def }: { def: MachineDef }) {
  const hangers = useRef<(THREE.Group | null)[]>([]);
  const parts = useRef<(THREE.Mesh | null)[]>([]);
  const t = useRef(0);
  const N = 9;
  const tanks = [-8.6, -6.2, -3.8, -1.4];
  useFrame((_, dt) => {
    if (isRunning(def.id)) t.current += dt * 0.06 * ANIM_SPEED();
    for (let i = 0; i < N; i++) {
      const g = hangers.current[i];
      if (!g) continue;
      const f = (i / N + t.current) % 1;
      const x = RAIL_X0 + f * (RAIL_X1 - RAIL_X0);
      let dip = 0;
      for (const tx of [...tanks, 2.6]) {
        const half = tx === 2.6 ? 1.9 : 1.0;
        const d = Math.abs(x - tx);
        if (d < half) dip = Math.max(dip, Math.cos((d / half) * Math.PI * 0.5) * 1.5);
      }
      g.position.set(x, 4.45 - dip, 0);
      const pm = parts.current[i];
      if (pm) pm.material = x > 4.6 ? M.ktlBlack : M.partGrey;
    }
  });
  return (
    <MachineShell def={def} size={[23, 5.2, 4]} beacon={[11.4, 0, -2.0]}>
      <Box s={[24, 0.06, 4.6]} p={[0, 0.03, 0]} m={M.concreteDark} cast={false} />
      {tanks.map((x, i) => (
        <group key={x} position={[x, 0, 0]}>
          <Box s={[2.0, 1.5, 2.4]} p={[0, 0.75, 0]} m={M.paintTank} />
          <mesh position={[0, 1.4, 0]} rotation-x={-Math.PI / 2} material={M.liquid}>
            <planeGeometry args={[1.8, 2.2]} />
          </mesh>
          <Text font={FONT_MONO} fontSize={0.22} color="#dfe6ec" position={[0, 1.1, 1.21]}>{['DEGREASE', 'RINSE', 'ZnPO4', 'RINSE DI'][i]}</Text>
        </group>
      ))}
      <Box s={[3.8, 1.9, 2.8]} p={[2.6, 0.95, 0]} m={M.paintTank} />
      <mesh position={[2.6, 1.82, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3.6, 2.6]} />
        <meshStandardMaterial color="#0f1418" roughness={0.04} metalness={0.4} />
      </mesh>
      <Text font={FONT_MONO} fontSize={0.26} color="#dfe6ec" position={[2.6, 1.3, 1.41]}>KTL E-COAT</Text>
      {/* curing oven */}
      <Box s={[4.6, 3.4, 3.4]} p={[7.6, 1.7, 0]} m={M.machineWhite} />
      <Box s={[0.05, 2.4, 1.6]} p={[5.28, 2.4, 0]} m={M.safetyBlack} cast={false} />
      <Cyl rt={0.3} h={2.6} p={[8.6, 4.6, -0.8]} m={M.galvanized} />
      <Text font={FONT_MONO} fontSize={0.26} color="#2b3036" position={[7.6, 2.8, 1.71]}>CURE 180 °C</Text>
      {/* overhead conveyor */}
      <Box s={[RAIL_X1 - RAIL_X0 + 1, 0.28, 0.24]} p={[0, 5.2, 0]} m={M.steelBlue} />
      {[-10, -5, 0, 5, 10].map((x) => (
        <Box key={x} s={[0.22, 5.2, 0.22]} p={[x, 2.6, -1.9]} m={M.steelBlue} />
      ))}
      {[-10, -5, 0, 5, 10].map((x) => (
        <Box key={`a${x}`} s={[0.2, 0.2, 2.0]} p={[x, 5.15, -0.95]} m={M.steelBlue} cast={false} />
      ))}
      {Array.from({ length: N }, (_, i) => (
        <group key={i} ref={(r) => { hangers.current[i] = r; }}>
          <Box s={[0.05, 1.5, 0.05]} p={[0, 0.0, 0]} m={M.darkSteel} cast={false} />
          <Box s={[1.1, 0.06, 0.06]} p={[0, -0.75, 0]} m={M.darkSteel} cast={false} />
          <mesh ref={(r) => { parts.current[i] = r; }} position={[0, -1.15, 0]} material={M.partGrey} castShadow>
            <boxGeometry args={[0.95, 0.65, 0.28]} />
          </mesh>
        </group>
      ))}
    </MachineShell>
  );
}

// ------------------------------------------------------------ CNC
export function CncCenter({ def }: { def: MachineDef }) {
  const spindle = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    const run = isRunning(def.id);
    if (run) t.current += dt * ANIM_SPEED();
    if (spindle.current && run) spindle.current.rotation.y += dt * 30;
    if (head.current) head.current.position.x = run ? Math.sin(t.current * 0.7) * 0.6 : 0;
  });
  return (
    <MachineShell def={def} size={[6, 3.2, 4.4]} beacon={[2.3, 2.75, -1.3]}>
      <Box s={[6, 0.06, 4.4]} p={[0, 0.03, 0]} m={M.concreteDark} cast={false} />
      <Box s={[4.4, 2.8, 0.1]} p={[0, 1.4, -1.5]} m={M.machineWhite} />
      <Box s={[0.1, 2.8, 3.0]} p={[-2.2, 1.4, 0]} m={M.machineWhite} />
      <Box s={[0.1, 2.8, 3.0]} p={[2.2, 1.4, 0]} m={M.machineWhite} />
      <Box s={[4.4, 0.1, 3.0]} p={[0, 2.8, 0]} m={M.machineWhite} />
      <Box s={[4.4, 1.0, 0.1]} p={[0, 0.5, 1.5]} m={M.machineWhite} />
      <mesh position={[0, 1.75, 1.5]} material={M.glass}>
        <boxGeometry args={[2.6, 1.3, 0.04]} />
      </mesh>
      <Box s={[0.9, 1.5, 0.1]} p={[1.75, 1.75, 1.5]} m={M.machineGrey} />
      <Box s={[4.42, 0.14, 3.02]} p={[0, 2.5, 0]} m={accentBlue} cast={false} />
      <Box s={[2.4, 0.9, 1.6]} p={[0, 0.45, 0]} m={M.darkSteel} />
      <Box s={[0.9, 0.5, 0.9]} p={[0, 1.15, 0.1]} m={M.partGrey} />
      <group ref={head}>
        <Box s={[0.6, 1.0, 0.6]} p={[0, 2.1, -0.2]} m={M.machineGrey} />
        <mesh ref={spindle} position={[0, 1.5, -0.2]} material={M.brightSteel}>
          <cylinderGeometry args={[0.08, 0.05, 0.35, 8]} />
        </mesh>
      </group>
      {/* chip conveyor + control arm */}
      <Box s={[0.6, 0.5, 2.4]} p={[-2.7, 0.9, -0.3]} r={[0.35, 0, 0]} m={M.machineGrey} />
      <Box s={[0.7, 0.55, 0.15]} p={[2.7, 1.5, 1.4]} m={M.machineWhite} />
      <Box s={[0.5, 0.35, 0.02]} p={[2.7, 1.52, 1.48]} m={M.screen} cast={false} />
      <Box s={[1.2, 0.15, 1.0]} p={[-0.6, 0.08, 2.8]} m={M.wood} />
      <Box s={[1.1, 0.6, 0.9]} p={[-0.6, 0.45, 2.8]} m={M.partGrey} />
    </MachineShell>
  );
}

// ------------------------------------------------------------ CMM
export function CmmStation({ def }: { def: MachineDef }) {
  const bridge = useRef<THREE.Group>(null);
  const carriage = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    const run = isRunning(def.id);
    if (run) t.current += dt * ANIM_SPEED();
    if (bridge.current) bridge.current.position.z = run ? Math.sin(t.current * 0.8) * 0.7 : 0;
    if (carriage.current) carriage.current.position.x = run ? Math.sin(t.current * 1.6) * 0.9 : 0;
  });
  return (
    <MachineShell def={def} size={[5, 3, 4]} beacon={[2.1, 0, -1.7]}>
      <Box s={[5, 0.05, 4]} p={[0, 0.025, 0]} m={M.concreteDark} cast={false} />
      <Box s={[2.6, 0.7, 1.7]} p={[0, 0.35, 0]} m={M.machineGrey} />
      <Box s={[3.2, 0.45, 2.2]} p={[0, 0.92, 0]} m={M.granite} />
      <Box s={[1.4, 0.35, 0.5]} p={[0, 1.32, 0]} m={M.ktlBlack} />
      <group ref={bridge}>
        <Box s={[0.22, 1.35, 0.3]} p={[-1.45, 1.8, 0]} m={M.aluminium} />
        <Box s={[0.22, 1.35, 0.3]} p={[1.45, 1.8, 0]} m={M.aluminium} />
        <Box s={[3.2, 0.32, 0.36]} p={[0, 2.55, 0]} m={M.aluminium} />
        <group ref={carriage}>
          <Box s={[0.4, 0.5, 0.5]} p={[0, 2.55, 0.2]} m={M.machineWhite} />
          <Cyl rt={0.06} h={1.0} p={[0, 1.9, 0.2]} m={M.brightSteel} />
          <mesh position={[0, 1.38, 0.2]}>
            <sphereGeometry args={[0.035, 10, 10]} />
            <meshStandardMaterial color="#d0213a" emissive="#a0102a" emissiveIntensity={0.6} />
          </mesh>
        </group>
      </group>
      {/* inspector desk */}
      <Box s={[1.4, 0.75, 0.7]} p={[-1.2, 0.38, 1.8]} m={M.machineWhite} />
      <Box s={[0.7, 0.42, 0.04]} p={[-1.2, 1.0, 1.6]} m={M.screen} cast={false} />
    </MachineShell>
  );
}

// ------------------------------------------------------------ all machines
export function MachinesLayer() {
  return (
    <group>
      {MACHINES.map((def) => {
        switch (def.group) {
          case 'PRESS':
            return <Press key={def.id} def={def} />;
          case 'BLANK':
            return <LaserCell key={def.id} def={def} blanking />;
          case 'TRIM':
            return <LaserCell key={def.id} def={def} />;
          case 'WELD':
            return <WeldCell key={def.id} def={def} />;
          case 'HOTFORM':
            return <HotFormLine key={def.id} def={def} />;
          case 'KTL':
            return <KtlLine key={def.id} def={def} />;
          case 'CNC':
            return <CncCenter key={def.id} def={def} />;
          case 'QC':
            return <CmmStation key={def.id} def={def} />;
          default:
            return null;
        }
      })}
    </group>
  );
}
