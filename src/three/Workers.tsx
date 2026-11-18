// Simplified animated people: operators stand at machines that have an
// operator assigned on this shift, technicians appear during maintenance.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MACHINES, type WcGroup } from '../engine';
import { useApp } from '../store/store';
import { M, machineState, reducedMotion } from './materials';

type V3 = [number, number, number];

export function Person({ p = [0, 0, 0], rot = 0, helmet = M.helmetWhite, vest = M.vest, seated, anim = 'idle', phase = 0 }: { p?: V3; rot?: number; helmet?: THREE.Material; vest?: THREE.Material; seated?: boolean; anim?: 'idle' | 'walk' | 'work'; phase?: number }) {
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * (reducedMotion ? 0.3 : 1) + phase;
    if (anim === 'walk') {
      const sw = Math.sin(t * 6) * 0.5;
      if (legL.current) legL.current.rotation.x = sw;
      if (legR.current) legR.current.rotation.x = -sw;
      if (armL.current) armL.current.rotation.x = -sw * 0.8;
      if (armR.current) armR.current.rotation.x = sw * 0.8;
    } else if (anim === 'work') {
      if (armR.current) armR.current.rotation.x = -1.1 + Math.sin(t * 3) * 0.25;
      if (armL.current) armL.current.rotation.x = -0.9 + Math.sin(t * 2.4 + 1) * 0.2;
      if (body.current) body.current.rotation.x = 0.12 + Math.sin(t * 0.8) * 0.04;
    } else if (body.current) {
      body.current.rotation.y = Math.sin(t * 0.4) * 0.15;
    }
  });
  const legH = seated ? 0 : 0.85;
  return (
    <group position={p} rotation-y={rot}>
      {!seated && (
        <>
          <group ref={legL} position={[-0.11, legH, 0]}>
            <mesh position={[0, -0.42, 0]} material={M.trousers} castShadow>
              <boxGeometry args={[0.15, 0.85, 0.18]} />
            </mesh>
          </group>
          <group ref={legR} position={[0.11, legH, 0]}>
            <mesh position={[0, -0.42, 0]} material={M.trousers} castShadow>
              <boxGeometry args={[0.15, 0.85, 0.18]} />
            </mesh>
          </group>
        </>
      )}
      <group ref={body} position={[0, legH, 0]}>
        <mesh position={[0, 0.32, 0]} material={vest} castShadow>
          <boxGeometry args={[0.44, 0.62, 0.26]} />
        </mesh>
        <mesh position={[0, 0.24, 0]} material={M.galvanized}>
          <boxGeometry args={[0.45, 0.04, 0.27]} />
        </mesh>
        <group ref={armL} position={[-0.29, 0.58, 0]}>
          <mesh position={[0, -0.27, 0]} material={vest} castShadow>
            <boxGeometry args={[0.12, 0.56, 0.14]} />
          </mesh>
        </group>
        <group ref={armR} position={[0.29, 0.58, 0]}>
          <mesh position={[0, -0.27, 0]} material={vest} castShadow>
            <boxGeometry args={[0.12, 0.56, 0.14]} />
          </mesh>
        </group>
        <mesh position={[0, 0.8, 0]} material={M.skin} castShadow>
          <sphereGeometry args={[0.13, 12, 10]} />
        </mesh>
        <mesh position={[0, 0.86, 0]} material={helmet}>
          <sphereGeometry args={[0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, 0.86, 0.06]} material={helmet}>
          <cylinderGeometry args={[0.17, 0.17, 0.02, 12]} />
        </mesh>
      </group>
    </group>
  );
}

const STAND: Record<WcGroup, V3> = {
  PRESS: [3.7, 0, 3.0],
  BLANK: [3.4, 0, 2.4],
  TRIM: [3.4, 0, 2.4],
  WELD: [2.6, 0, 4.0],
  HOTFORM: [3.7, 0, 3.0],
  KTL: [-11.2, 0, 2.4],
  CNC: [2.7, 0, 2.2],
  QC: [-1.2, 0, 2.5],
};
const TECH: Record<WcGroup, V3> = {
  PRESS: [-3.4, 0, 2.8],
  BLANK: [-3.2, 0, 2.6],
  TRIM: [-3.2, 0, 2.6],
  WELD: [-2.6, 0, 3.6],
  HOTFORM: [-3.4, 0, 2.8],
  KTL: [-6, 0, 2.6],
  CNC: [-2.6, 0, 2.2],
  QC: [1.8, 0, 1.8],
};

function MachineCrew({ id, group, pos }: { id: string; group: WcGroup; pos: [number, number] }) {
  const op = useRef<THREE.Group>(null);
  const tech = useRef<THREE.Group>(null);
  useFrame(() => {
    const m = machineState(id);
    if (op.current) op.current.visible = !!m?.operator || group === 'QC';
    if (tech.current) tech.current.visible = !!m?.maintOrder;
  });
  const s = STAND[group];
  const t = TECH[group];
  const face = (v: V3) => Math.atan2(-v[0], -v[2]);
  return (
    <group position={[pos[0], 0, pos[1]]}>
      <group ref={op} position={s}>
        <Person rot={face(s)} helmet={group === 'QC' ? M.helmetWhite : M.helmetYellow} vest={group === 'QC' ? M.vestYellow : M.vest} anim="work" phase={pos[0]} />
      </group>
      <group ref={tech} position={t} visible={false}>
        <Person rot={face(t)} helmet={M.helmetBlue} vest={M.vestYellow} anim="work" phase={pos[1]} />
        <mesh position={[0.6, 0.2, 0.3]} material={M.robotOrange} castShadow>
          <boxGeometry args={[0.5, 0.3, 0.25]} />
        </mesh>
      </group>
    </group>
  );
}

function Walker({ z, speed, phase, x0, x1, vest }: { z: number; speed: number; phase: number; x0: number; x1: number; vest: THREE.Material }) {
  const g = useRef<THREE.Group>(null);
  const d = useRef(phase);
  useFrame((_, dt) => {
    const paused = useApp.getState().sim?.paused;
    if (!paused) d.current += dt * speed;
    const span = x1 - x0;
    const k = d.current % (2 * span);
    const forward = k < span;
    const x = forward ? x0 + k : x1 - (k - span);
    if (g.current) {
      g.current.position.set(x, 0, z);
      g.current.rotation.y = forward ? Math.PI / 2 : -Math.PI / 2;
    }
  });
  return (
    <group ref={g}>
      <Person anim="walk" vest={vest} phase={phase} />
    </group>
  );
}

export function Workers() {
  return (
    <group>
      {MACHINES.map((d) => (
        <group key={d.id} rotation-y={d.rot}>
          <MachineCrew id={d.id} group={d.group} pos={d.pos} />
        </group>
      ))}
      <Walker z={1.75} speed={1.3} phase={0} x0={-58} x1={58} vest={M.vest} />
      <Walker z={2.15} speed={1.1} phase={40} x0={-50} x1={40} vest={M.vestYellow} />
      <Walker z={1.95} speed={1.4} phase={90} x0={-30} x1={60} vest={M.vest} />
      <Walker z={1.85} speed={1.2} phase={15} x0={-62} x1={-20} vest={M.vestYellow} />
    </group>
  );
}
