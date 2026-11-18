import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, MapControls, OrbitControls, OrthographicCamera, PerformanceMonitor, PerspectiveCamera } from '@react-three/drei';
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import type { OrbitControls as OrbitImpl, MapControls as MapImpl } from 'three-stdlib';
import { BIN_MAP, HALL, MACHINES, ZONES, machineDef } from '../engine';
import { useApp } from '../store/store';
import { Columns, DockDoors, Floor, Roof, Walls } from './Building';
import { MachinesLayer } from './Machines';
import { BinPicker, RackFrames, StockLoads } from './Storage';
import { Forklifts, Trucks } from './Vehicles';
import { Workers } from './Workers';
import { Flows, LabelProjector } from './Overlays';

export interface Layers {
  labels: boolean;
  flows: boolean;
  workers: boolean;
}

/** Resolve "machine:PRESS-01" style targets into a world point. */
export function targetPoint(target: string): THREE.Vector3 | null {
  const [kind, id] = target.split(':');
  if (kind === 'machine') {
    const d = MACHINES.find((m) => m.id === id);
    return d ? new THREE.Vector3(d.pos[0], 1.5, d.pos[1]) : null;
  }
  if (kind === 'zone') {
    const z = ZONES.find((x) => x.id === id);
    return z ? new THREE.Vector3((z.rect[0] + z.rect[1]) / 2, 0, (z.rect[2] + z.rect[3]) / 2) : null;
  }
  if (kind === 'bin') {
    const b = BIN_MAP[id];
    return b ? new THREE.Vector3(b.pos[0], b.pos[1], b.pos[2]) : null;
  }
  if (kind === 'truck') {
    const s = useApp.getState().sim;
    const d = s?.docs[id];
    if (d?.type === 'IBD') return new THREE.Vector3(-72, 1.5, d.dock === 1 ? -19 : -31);
    if (d?.type === 'SHP') return new THREE.Vector3(72, 1.5, [10, 20, 30][d.dock]);
  }
  return null;
}

const clampTarget = (v: THREE.Vector3) => {
  v.x = THREE.MathUtils.clamp(v.x, HALL.x0 - 20, HALL.x1 + 20);
  v.z = THREE.MathUtils.clamp(v.z, HALL.z0 - 20, HALL.z1 + 20);
  v.y = THREE.MathUtils.clamp(v.y, 0, 6);
};

function OverviewCam() {
  const controls = useRef<OrbitImpl>(null);
  const focus = useApp((s) => s.focusRequest);
  const goal = useRef<{ target: THREE.Vector3; cam: THREE.Vector3 } | null>(null);
  const { camera } = useThree();
  useEffect(() => {
    if (!focus) return;
    const p = targetPoint(focus.target);
    if (!p) return;
    const dist = focus.target.startsWith('zone') ? 46 : 24;
    const dir = new THREE.Vector3(0.55, 0.75, 0.9).normalize();
    // the inspector panel covers the right side: aim a little right of the object so it sits left of centre
    const right = new THREE.Vector3().crossVectors(dir.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
    const target = p.clone().add(right.multiplyScalar(dist * 0.22));
    goal.current = { target, cam: target.clone().add(dir.multiplyScalar(dist)) };
  }, [focus]);
  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    if (goal.current) {
      c.target.lerp(goal.current.target, 0.08);
      camera.position.lerp(goal.current.cam, 0.08);
      if (c.target.distanceTo(goal.current.target) < 0.05 && camera.position.distanceTo(goal.current.cam) < 0.1) goal.current = null;
    }
    clampTarget(c.target);
  });
  return (
    <>
      <PerspectiveCamera makeDefault fov={38} position={[52, 62, 80]} near={0.5} far={1200} />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={1.36}
        minDistance={8}
        maxDistance={200}
        screenSpacePanning={false}
        onStart={() => (goal.current = null)}
      />
    </>
  );
}

function MapCam() {
  const { size } = useThree();
  const controls = useRef<MapImpl>(null);
  const focus = useApp((s) => s.focusRequest);
  const zoom = Math.min(size.width / 150, size.height / 100);
  const goal = useRef<THREE.Vector3 | null>(null);
  const { camera } = useThree();
  useEffect(() => {
    if (!focus) return;
    const p = targetPoint(focus.target);
    if (p) goal.current = new THREE.Vector3(p.x, 0, p.z);
  }, [focus]);
  useFrame(() => {
    const c = controls.current;
    if (!c || !goal.current) return;
    c.target.lerp(goal.current, 0.1);
    camera.position.x = c.target.x;
    camera.position.z = c.target.z + 0.01;
    if (c.target.distanceTo(goal.current) < 0.05) goal.current = null;
  });
  return (
    <>
      <OrthographicCamera makeDefault position={[0, 160, 0.01]} zoom={zoom} near={1} far={500} />
      <MapControls ref={controls} makeDefault enableRotate={false} screenSpacePanning minZoom={zoom * 0.6} maxZoom={zoom * 6} onStart={() => (goal.current = null)} />
    </>
  );
}

const blockers = MACHINES.map((m) => ({ x: m.pos[0], z: m.pos[1], r: m.group === 'KTL' ? 0 : m.group === 'HOTFORM' ? 4 : 3.2 }));

function ExploreCam() {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(-Math.PI / 2);
  const pitch = useRef(-0.05);
  const focus = useApp((s) => s.focusRequest);
  useEffect(() => {
    camera.position.set(-36, 1.7, -4);
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      keys.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const el = gl.domElement;
    const pd = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
    };
    const pm = (e: PointerEvent) => {
      if (!dragging) return;
      yaw.current -= (e.clientX - lx) * 0.004;
      pitch.current = THREE.MathUtils.clamp(pitch.current - (e.clientY - ly) * 0.004, -1.1, 1.0);
      lx = e.clientX;
      ly = e.clientY;
    };
    const pu = () => (dragging = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    el.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      el.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
    };
  }, [camera, gl]);
  useEffect(() => {
    if (!focus) return;
    const p = targetPoint(focus.target);
    if (!p) return;
    camera.position.set(p.x + 6, 1.7, p.z + 8);
    yaw.current = Math.atan2(-(p.x - camera.position.x), -(p.z - camera.position.z));
  }, [focus, camera]);
  useFrame((_, dt) => {
    const k = keys.current;
    const speed = (k.ShiftLeft || k.ShiftRight ? 14 : 6) * dt;
    const fwd = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const mv = new THREE.Vector3();
    if (k.KeyW || k.ArrowUp) mv.add(fwd);
    if (k.KeyS || k.ArrowDown) mv.sub(fwd);
    if (k.KeyD || k.ArrowRight) mv.add(right);
    if (k.KeyA || k.ArrowLeft) mv.sub(right);
    if (mv.lengthSq() > 0) {
      mv.normalize().multiplyScalar(speed);
      const nx = THREE.MathUtils.clamp(camera.position.x + mv.x, HALL.x0 + 0.8, HALL.x1 - 0.8);
      const nz = THREE.MathUtils.clamp(camera.position.z + mv.z, HALL.z0 + 0.8, HALL.z1 - 0.8);
      const hit = blockers.some((b) => b.r > 0 && Math.hypot(nx - b.x, nz - b.z) < b.r);
      if (!hit) camera.position.set(nx, 1.7, nz);
    }
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
  });
  return <PerspectiveCamera makeDefault fov={64} near={0.1} far={600} />;
}

function CameraRig() {
  const mode = useApp((s) => s.camera);
  if (mode === 'map') return <MapCam key="map" />;
  if (mode === 'explore') return <ExploreCam key="explore" />;
  return <OverviewCam key="overview" />;
}

function Lights({ high }: { high: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    cam.left = -95;
    cam.right = 95;
    cam.top = 75;
    cam.bottom = -75;
    cam.near = 10;
    cam.far = 320;
    cam.updateProjectionMatrix();
    l.target.position.set(0, 0, 0);
    l.target.updateMatrixWorld();
  }, [high]);
  return (
    <>
      <hemisphereLight args={['#dbe6f2', '#3a3f46', 0.75]} />
      <directionalLight
        ref={light}
        position={[70, 120, 55]}
        intensity={2.1}
        color="#fff6ea"
        castShadow={high}
        shadow-mapSize-width={high ? 4096 : 1024}
        shadow-mapSize-height={high ? 4096 : 1024}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <directionalLight position={[-60, 50, -40]} intensity={0.45} color="#cfe0ff" />
    </>
  );
}

function Env() {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={['#1a1e24']} />
      {[-30, -10, 10, 30].map((z) => (
        <Lightformer key={z} form="rect" intensity={1.6} color="#fff3e2" position={[0, 12, z]} rotation-x={Math.PI / 2} scale={[110, 3]} />
      ))}
      <Lightformer form="rect" intensity={0.8} color="#b9d4ff" position={[-60, 6, 0]} rotation-y={Math.PI / 2} scale={[80, 6]} />
      <Lightformer form="rect" intensity={0.6} color="#ffe2c4" position={[60, 6, 0]} rotation-y={-Math.PI / 2} scale={[80, 6]} />
    </Environment>
  );
}

export function FactoryCanvas({ layers }: { layers: Layers }) {
  const quality = useApp((s) => s.quality);
  const select = useApp((s) => s.select);
  const high = quality === 'high';
  const [dpr, setDpr] = useState(high ? 1.5 : 1);
  useEffect(() => setDpr(high ? 1.5 : 1), [high]);
  const bg = useMemo(() => new THREE.Color('#15181d'), []);
  return (
    <Canvas
      shadows={high ? 'soft' : false}
      dpr={dpr}
      gl={{ antialias: !high, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
      onPointerMissed={(e) => {
        // HTML labels live inside the canvas wrapper — only clicks on the 3D canvas itself clear the selection
        if ((e.target as HTMLElement | null)?.tagName === 'CANVAS') select(null);
      }}
      onCreated={({ scene }) => {
        scene.background = bg;
      }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(high ? 1.5 : 1)} />
      <fog attach="fog" args={['#15181d', 160, 480]} />
      <Lights high={high} />
      <Env />
      <CameraRig />
      <Floor />
      <Walls />
      <Columns />
      <Roof />
      <DockDoors />
      <RackFrames />
      <StockLoads />
      <BinPicker />
      <MachinesLayer />
      <Forklifts />
      <Trucks />
      {layers.workers && <Workers />}
      {layers.flows && <Flows />}
      <LabelProjector />
      {high && (
        <EffectComposer multisampling={0}>
          <SMAA />
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.75} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette offset={0.28} darkness={0.55} />
        </EffectComposer>
      )}
    </Canvas>
  );
}

export function machineWorld(id: string) {
  const d = machineDef(id);
  return d ? new THREE.Vector3(d.pos[0], 0, d.pos[1]) : null;
}

