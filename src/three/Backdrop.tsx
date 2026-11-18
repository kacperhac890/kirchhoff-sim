// Slow cinematic orbit around the plant behind the login and lobby screens.
import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Floor, Walls, Columns } from './Building';
import { MachinesLayer } from './Machines';
import { RackFrames } from './Storage';
import { reducedMotion } from './materials';

function Orbit() {
  const cam = useRef<THREE.PerspectiveCamera>(null);
  useFrame(({ clock }) => {
    const c = cam.current;
    if (!c) return;
    const t = reducedMotion ? 0.6 : clock.elapsedTime * 0.035 + 0.6;
    c.position.set(Math.cos(t) * 92, 44, Math.sin(t) * 70);
    c.lookAt(6, 0, 0);
  });
  return <PerspectiveCamera ref={cam} makeDefault fov={36} near={1} far={900} />;
}

export default function Backdrop() {
  return (
    <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }} onCreated={({ scene }) => (scene.background = new THREE.Color('#15181d'))}>
      <fog attach="fog" args={['#15181d', 90, 260]} />
      <hemisphereLight args={['#dbe6f2', '#3a3f46', 0.7]} />
      <directionalLight position={[70, 120, 55]} intensity={2} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-90} shadow-camera-right={90} shadow-camera-top={70} shadow-camera-bottom={-70} />
      <Environment resolution={128} frames={1}>
        {[-20, 0, 20].map((z) => (
          <Lightformer key={z} form="rect" intensity={1.4} position={[0, 12, z]} rotation-x={Math.PI / 2} scale={[100, 3]} />
        ))}
      </Environment>
      <Orbit />
      <Floor />
      <Walls />
      <Columns />
      <RackFrames />
      <MachinesLayer />
    </Canvas>
  );
}
