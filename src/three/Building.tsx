import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { HALL, INBOUND_DOORS, OUTBOUND_DOORS, ZONES, MACHINES, docsOf } from '../engine';
import { FONT, M, getSim, simNow } from './materials';
import { useApp } from '../store/store';

const PX = 16; // texture pixels per metre
const W = HALL.x1 - HALL.x0;
const D = HALL.z1 - HALL.z0;

function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = W * PX;
  c.height = D * PX;
  const g = c.getContext('2d')!;
  const X = (x: number) => (x - HALL.x0) * PX;
  const Z = (z: number) => (z - HALL.z0) * PX;
  g.fillStyle = '#5a5f67';
  g.fillRect(0, 0, c.width, c.height);
  // epoxy speckle
  const rnd = mulberry(7);
  for (let i = 0; i < 26000; i++) {
    const v = 80 + Math.floor(rnd() * 30);
    g.fillStyle = `rgba(${v},${v + 3},${v + 8},0.18)`;
    g.fillRect(rnd() * c.width, rnd() * c.height, 2, 2);
  }
  // concrete slab joints every 8 m
  g.strokeStyle = 'rgba(30,32,36,0.35)';
  g.lineWidth = 1;
  for (let x = HALL.x0; x <= HALL.x1; x += 8) line(g, X(x), 0, X(x), c.height);
  for (let z = HALL.z0; z <= HALL.z1; z += 8) line(g, 0, Z(z), c.width, Z(z));
  // zones: slightly different floor tone + yellow boundary
  for (const zn of ZONES) {
    const [x0, x1, z0, z1] = zn.rect;
    g.fillStyle = zn.id === 'MAINT' ? 'rgba(60,90,120,0.16)' : zn.id === 'QC' ? 'rgba(70,110,90,0.14)' : 'rgba(255,255,255,0.025)';
    g.fillRect(X(x0), Z(z0), (x1 - x0) * PX, (z1 - z0) * PX);
    g.strokeStyle = '#d9b23a';
    g.lineWidth = 2.2;
    g.setLineDash([]);
    g.strokeRect(X(x0) + 1, Z(z0) + 1, (x1 - x0) * PX - 2, (z1 - z0) * PX - 2);
  }
  // main aisle
  g.fillStyle = 'rgba(30,34,40,0.25)';
  g.fillRect(X(-63), Z(-9.4), 126 * PX, 10.6 * PX);
  g.strokeStyle = '#e8c23c';
  g.lineWidth = 3.2;
  line(g, X(-63), Z(-9.4), X(63), Z(-9.4));
  line(g, X(-63), Z(1.2), X(63), Z(1.2));
  // dashed centre line (forklift lanes)
  g.setLineDash([22, 18]);
  g.strokeStyle = 'rgba(240,240,240,0.55)';
  g.lineWidth = 2;
  line(g, X(-62), Z(-4), X(62), Z(-4));
  g.setLineDash([]);
  // pedestrian walkway
  g.fillStyle = '#2f6a50';
  g.fillRect(X(-63), Z(1.4), 126 * PX, 1.3 * PX);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let x = -62; x < 62; x += 2.4) g.fillRect(X(x), Z(1.95), 1.2 * PX, 0.18 * PX);
  // pedestrian crossings (zebra) at the cross aisles
  for (const x of [-46, -14, 20, 53]) {
    for (let i = 0; i < 6; i++) {
      g.fillStyle = 'rgba(240,240,240,0.7)';
      g.fillRect(X(x - 2.2 + i * 0.8), Z(-9.2), 0.42 * PX, 10.2 * PX);
    }
  }
  // hazard hatch around presses and hot forming
  for (const m of MACHINES) {
    if (m.group !== 'PRESS' && m.group !== 'HOTFORM') continue;
    const w = m.group === 'PRESS' ? 9 : 26;
    const d = m.group === 'PRESS' ? 8 : 8;
    const cx = m.group === 'HOTFORM' ? m.pos[0] - 9 : m.pos[0];
    hatch(g, X(cx - w / 2), Z(m.pos[1] - d / 2), w * PX, d * PX);
  }
  // dock aprons
  for (const [, z] of INBOUND_DOORS) hatch(g, X(-63.8), Z(z - 2.2), 3 * PX, 4.4 * PX);
  for (const [, z] of OUTBOUND_DOORS) hatch(g, X(60.8), Z(z - 2.2), 3 * PX, 4.4 * PX);
  // zone names painted on the floor
  g.font = `600 ${2.1 * PX}px "IBM Plex Sans", sans-serif`;
  g.fillStyle = 'rgba(235,238,242,0.3)';
  g.textBaseline = 'top';
  for (const zn of ZONES) {
    const [x0, , z0] = zn.rect;
    g.fillText(zn.short.toUpperCase(), X(x0 + 0.8), Z(z0 + 0.6));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function line(g: CanvasRenderingContext2D, a: number, b: number, c: number, d: number) {
  g.beginPath();
  g.moveTo(a, b);
  g.lineTo(c, d);
  g.stroke();
}
function hatch(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = 'rgba(20,20,20,0.35)';
  g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(232,190,50,0.85)';
  g.lineWidth = 6;
  for (let i = -h; i < w + h; i += 18) line(g, x + i, y, x + i - h, y + h);
  g.restore();
  g.strokeStyle = '#e8be32';
  g.lineWidth = 3;
  g.strokeRect(x, y, w, h);
}
function mulberry(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCladdingTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 32, 0);
  grd.addColorStop(0, '#9aa2ab');
  grd.addColorStop(0.45, '#c4cad1');
  grd.addColorStop(0.55, '#b5bcc4');
  grd.addColorStop(1, '#8f979f');
  for (let x = 0; x < 256; x += 32) {
    g.save();
    g.translate(x, 0);
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 64);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Floor() {
  const tex = useMemo(makeFloorTexture, []);
  const select = useApp((s) => s.select);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow onClick={(e) => { e.stopPropagation(); select(null); }}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={tex} roughness={0.55} metalness={0.05} />
      </mesh>
      {/* yard */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[240, 170]} />
        <primitive object={M.asphalt} attach="material" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.06, 0]}>
        <planeGeometry args={[900, 900]} />
        <primitive object={M.grass} attach="material" />
      </mesh>
      <YardMarkings />
    </group>
  );
}

function YardMarkings() {
  const lines: [number, number, number, number][] = [];
  // truck lanes and parking bays
  for (const [, z] of INBOUND_DOORS) lines.push([-100, z, 34, 0.12]);
  for (const [, z] of OUTBOUND_DOORS) lines.push([100, z, 34, 0.12]);
  for (let i = 0; i < 8; i++) lines.push([-30 + i * 9, 58, 0.15, 14]);
  return (
    <group>
      {lines.map(([x, z, w, d], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x, -0.015, z]}>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color="#d8d8d0" roughness={0.9} />
        </mesh>
      ))}
      {/* perimeter road edge */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.014, 48.5]}>
        <planeGeometry args={[200, 0.2]} />
        <meshStandardMaterial color="#e2c13c" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Walls lower themselves when the camera looks through them (cut-away view). */
export function Walls() {
  const clad = useMemo(makeCladdingTexture, []);
  const { camera } = useThree();
  const camMode = useApp((s) => s.camera);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const walls = useMemo(
    () => [
      { pos: [0, 0, HALL.z0] as const, len: W, rot: 0, normal: new THREE.Vector3(0, 0, -1), doors: [] as number[] },
      { pos: [0, 0, HALL.z1] as const, len: W, rot: 0, normal: new THREE.Vector3(0, 0, 1), doors: [] },
      { pos: [HALL.x0, 0, 0] as const, len: D, rot: Math.PI / 2, normal: new THREE.Vector3(-1, 0, 0), doors: INBOUND_DOORS.map(([, z]) => z) },
      { pos: [HALL.x1, 0, 0] as const, len: D, rot: Math.PI / 2, normal: new THREE.Vector3(1, 0, 0), doors: OUTBOUND_DOORS.map(([, z]) => z) },
    ],
    [],
  );
  const cladMat = useMemo(() => {
    const t = clad.clone();
    t.needsUpdate = true;
    t.repeat.set(W / 1.6, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.5, color: '#cfd5db' });
  }, [clad]);
  useFrame(() => {
    walls.forEach((w, i) => {
      const g = refs.current[i];
      if (!g) return;
      const toCam = new THREE.Vector3(camera.position.x - w.pos[0], 0, camera.position.z - w.pos[2]);
      const outside = toCam.dot(w.normal) > 0;
      const target = camMode === 'explore' ? 1 : camMode === 'map' ? 0.12 : outside ? 0.12 : 1;
      g.scale.y += (target - g.scale.y) * 0.15;
    });
  });
  const H = HALL.height;
  return (
    <group>
      {walls.map((w, i) => (
        <group key={i} ref={(r) => { refs.current[i] = r; }} position={[w.pos[0], 0, w.pos[2]]} rotation-y={w.rot}>
          {segments(w.len, w.doors).map(([a, b], j) => (
            <group key={j}>
              <mesh position={[(a + b) / 2, 1.5, 0]} castShadow receiveShadow material={M.concrete}>
                <boxGeometry args={[b - a, 3, 0.4]} />
              </mesh>
              <mesh position={[(a + b) / 2, 3 + (H - 3) / 2, 0]} material={cladMat} receiveShadow>
                <boxGeometry args={[b - a, H - 3, 0.25]} />
              </mesh>
            </group>
          ))}
          {/* clerestory windows */}
          <mesh position={[0, H - 2.2, 0.14]} material={M.glassLight}>
            <boxGeometry args={[w.len - 2, 1.1, 0.05]} />
          </mesh>
          {/* door headers */}
          {w.doors.map((z) => (
            <mesh key={z} position={[z, (4.8 + H) / 2, 0]} material={cladMat}>
              <boxGeometry args={[4.4, H - 4.8, 0.25]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function segments(len: number, doors: number[]): [number, number][] {
  const half = len / 2;
  const cuts = [...doors].sort((a, b) => a - b);
  const out: [number, number][] = [];
  let start = -half;
  for (const d of cuts) {
    out.push([start, d - 2.2]);
    start = d + 2.2;
  }
  out.push([start, half]);
  return out;
}

export function Columns() {
  const positions = useMemo(() => {
    const p: [number, number][] = [];
    for (let x = -48; x <= 48; x += 16) {
      p.push([x, -10.4], [x, 2.75]);
    }
    return p;
  }, []);
  const camMode = useApp((s) => s.camera);
  const m = new THREE.Matrix4();
  return (
    <instancedMesh
      ref={(r) => {
        if (!r) return;
        const h = camMode === 'explore' ? HALL.height : 3.2;
        positions.forEach(([x, z], i) => {
          m.makeScale(1, h / HALL.height, 1).setPosition(x, h / 2, z);
          r.setMatrixAt(i, m);
        });
        r.instanceMatrix.needsUpdate = true;
      }}
      args={[undefined, undefined, positions.length]}
      castShadow
      visible={camMode !== 'map'}
      material={M.steelBlue}
    >
      <boxGeometry args={[0.45, HALL.height, 0.45]} />
    </instancedMesh>
  );
}

/** Roof trusses and high-bay lights — only visible from inside (explore mode). */
export function Roof() {
  const camMode = useApp((s) => s.camera);
  const xs = useMemo(() => Array.from({ length: 17 }, (_, i) => -64 + i * 8), []);
  if (camMode !== 'explore') {
    return <HallLights high={false} />;
  }
  return (
    <group>
      {xs.map((x) => (
        <group key={x} position={[x, HALL.height - 0.6, 0]}>
          <mesh material={M.steelBlue}>
            <boxGeometry args={[0.3, 0.5, D]} />
          </mesh>
          <mesh material={M.steelBlue} position={[0, -1.4, 0]}>
            <boxGeometry args={[0.2, 0.25, D]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, HALL.height + 0.05, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#3a4048" side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
      <HallLights high />
    </group>
  );
}

function HallLights({ high }: { high: boolean }) {
  const pos = useMemo(() => {
    const p: [number, number][] = [];
    for (let x = -56; x <= 56; x += 8) for (let z = -32; z <= 32; z += 8) p.push([x, z]);
    return p;
  }, []);
  const m = new THREE.Matrix4();
  return (
    <instancedMesh
      args={[undefined, undefined, pos.length]}
      ref={(r) => {
        if (!r) return;
        pos.forEach(([x, z], i) => {
          m.makeTranslation(x, high ? HALL.height - 2.2 : HALL.height - 0.4, z);
          r.setMatrixAt(i, m);
        });
        r.instanceMatrix.needsUpdate = true;
      }}
      material={M.lamp}
      visible={high}
    >
      <cylinderGeometry args={[0.45, 0.6, 0.25, 16]} />
    </instancedMesh>
  );
}

/** Sectional dock doors open while a truck is docked. */
export function DockDoors() {
  const inRefs = useRef<(THREE.Mesh | null)[]>([]);
  const outRefs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const s = getSim();
    if (!s) return;
    const t = simNow();
    const ibds = docsOf(s, 'IBD');
    INBOUND_DOORS.forEach((_, i) => {
      const docked = ibds.some((d) => d.dock === i && d.arrivedAt !== undefined && t >= d.arrivedAt - 0.5 && !(d.departAt !== undefined && t > d.departAt + 1));
      const r = inRefs.current[i];
      if (r) r.position.y += ((docked ? 4.6 : 2.25) - r.position.y) * 0.08;
    });
    const shps = docsOf(s, 'SHP');
    OUTBOUND_DOORS.forEach((_, i) => {
      const docked = shps.some((d) => d.dock === i && d.arrivedAt !== undefined && !(d.departedAt !== undefined && t > d.departedAt + 1));
      const r = outRefs.current[i];
      if (r) r.position.y += ((docked ? 4.6 : 2.25) - r.position.y) * 0.08;
    });
  });
  return (
    <group>
      {INBOUND_DOORS.map(([x, z], i) => (
        <group key={`in${i}`}>
          <mesh ref={(r) => { inRefs.current[i] = r; }} position={[x, 2.25, z]} material={M.door} castShadow>
            <boxGeometry args={[0.12, 4.5, 3.8]} />
          </mesh>
          <DockFrame x={x} z={z} dir={-1} label={`IN ${i + 1}`} />
        </group>
      ))}
      {OUTBOUND_DOORS.map(([x, z], i) => (
        <group key={`out${i}`}>
          <mesh ref={(r) => { outRefs.current[i] = r; }} position={[x, 2.25, z]} material={M.door} castShadow>
            <boxGeometry args={[0.12, 4.5, 3.8]} />
          </mesh>
          <DockFrame x={x} z={z} dir={1} label={`OUT ${i + 1}`} />
        </group>
      ))}
    </group>
  );
}

function DockFrame({ x, z, dir, label }: { x: number; z: number; dir: number; label: string }) {
  return (
    <group position={[x, 0, z]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[dir * 0.35, 1.0, s * 1.75]} material={M.bumper}>
          <boxGeometry args={[0.35, 0.4, 0.25]} />
        </mesh>
      ))}
      <mesh position={[dir * 0.3, 0.02, 0]} rotation-x={-Math.PI / 2} material={M.galvanized}>
        <planeGeometry args={[0.6, 3.2]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`p${s}`} position={[-dir * 0.4, 0.6, s * 2.05]} material={M.safetyYellow}>
          <cylinderGeometry args={[0.1, 0.1, 1.2, 10]} />
        </mesh>
      ))}
      <Text font={FONT} fontSize={0.55} color="#e9edf1" position={[dir * 0.2, 5.2, 0]} rotation-y={dir > 0 ? Math.PI / 2 : -Math.PI / 2} anchorX="center" anchorY="middle">
        {label}
      </Text>
    </group>
  );
}
