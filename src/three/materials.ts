// Shared PBR materials and helpers for the 3D plant. Created once, reused by
// every mesh so the GPU sees few material switches.
import * as THREE from 'three';
import { useApp } from '../store/store';
import type { MachineStatus, SimState } from '../engine';
import fontUrl from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff?url';
import monoUrl from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff?url';

export const FONT = fontUrl;
export const FONT_MONO = monoUrl;

const std = (color: string, roughness = 0.6, metalness = 0.1, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export const M = {
  floor: std('#5b6068', 0.82, 0.05),
  concrete: std('#8a8c8e', 0.92, 0),
  concreteDark: std('#5e6164', 0.95, 0),
  asphalt: std('#2c2f33', 0.95, 0),
  grass: std('#3d4a3a', 1, 0),
  cladding: std('#a9b0b8', 0.55, 0.45),
  claddingDark: std('#4a5560', 0.6, 0.35),
  steelBlue: std('#2e4a68', 0.45, 0.55),
  pressBlue: std('#314f73', 0.42, 0.5),
  pressGrey: std('#6c7682', 0.45, 0.55),
  machineWhite: std('#d9dde1', 0.38, 0.15),
  machineGrey: std('#8d959e', 0.45, 0.4),
  darkSteel: std('#2b2f35', 0.4, 0.7),
  steel: std('#9aa3ad', 0.32, 0.85),
  brightSteel: std('#c4cbd2', 0.22, 0.95),
  galvanized: std('#b7bec4', 0.35, 0.8),
  rackBlue: std('#24589a', 0.5, 0.35),
  rackOrange: std('#e0711d', 0.5, 0.25),
  safetyYellow: std('#f2c12e', 0.55, 0.1),
  safetyBlack: std('#1d1f22', 0.7, 0.1),
  robotOrange: std('#e86a1c', 0.42, 0.25),
  robotDark: std('#2a2c30', 0.5, 0.4),
  rubber: std('#151618', 0.9, 0),
  glass: new THREE.MeshPhysicalMaterial({ color: '#1e2a35', roughness: 0.08, metalness: 0, transmission: 0, transparent: true, opacity: 0.55 }),
  glassLight: new THREE.MeshStandardMaterial({ color: '#9fb6c9', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.25 }),
  mesh: new THREE.MeshStandardMaterial({ color: '#c9a42b', roughness: 0.6, metalness: 0.3, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
  weldCurtain: new THREE.MeshStandardMaterial({ color: '#d36a12', roughness: 0.5, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
  wood: std('#a57c4f', 0.9, 0),
  cardboard: std('#b48a5a', 0.95, 0),
  sheetSteel: std('#7d8a96', 0.35, 0.8),
  alsi: std('#b9c3cc', 0.28, 0.9),
  ibc: std('#e8ebee', 0.4, 0.05, { transparent: true, opacity: 0.9 }),
  drum: std('#2f5d8a', 0.45, 0.4),
  ktlBlack: std('#1c1f23', 0.35, 0.3),
  partGrey: std('#3a3f45', 0.35, 0.5),
  refractory: std('#6b5d52', 0.9, 0.05),
  granite: std('#1b1c1e', 0.3, 0.1),
  aluminium: std('#c8ced4', 0.3, 0.8),
  skin: std('#d6a682', 0.8, 0),
  vest: std('#f08c1a', 0.7, 0),
  vestYellow: std('#e4e23a', 0.7, 0),
  trousers: std('#2b3440', 0.8, 0),
  helmetWhite: std('#eeeeee', 0.4, 0),
  helmetBlue: std('#2c6fd1', 0.4, 0),
  helmetYellow: std('#f2c12e', 0.4, 0),
  tyre: std('#18191b', 0.9, 0),
  forklift: std('#f0a422', 0.45, 0.2),
  cab: std('#e7e9ec', 0.35, 0.3),
  trailerBlue: std('#244b7a', 0.6, 0.15),
  trailerWhite: std('#e9ecef', 0.55, 0.1),
  trailerGreen: std('#2f5b48', 0.6, 0.15),
  trailerGrey: std('#59626b', 0.6, 0.2),
  door: std('#c3c9cf', 0.5, 0.5),
  bumper: std('#111214', 0.9, 0),
  lamp: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4e0', emissiveIntensity: 2.2 }),
  furnaceGlow: new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff5a0a', emissiveIntensity: 3 }),
  laserGlow: new THREE.MeshStandardMaterial({ color: '#9ad7ff', emissive: '#58b8ff', emissiveIntensity: 6 }),
  sparkGlow: new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }),
  hotBlank: new THREE.MeshStandardMaterial({ color: '#ff8a2a', emissive: '#ff4d00', emissiveIntensity: 2.4 }),
  screen: new THREE.MeshStandardMaterial({ color: '#0e1a26', emissive: '#2a6fb0', emissiveIntensity: 0.9 }),
  paintTank: std('#2a3540', 0.25, 0.8),
  liquid: new THREE.MeshStandardMaterial({ color: '#141a22', roughness: 0.05, metalness: 0.3 }),
  hit: new THREE.MeshBasicMaterial({ visible: false }),
};

export const STATUS_COLOR: Record<MachineStatus, string> = {
  RUNNING: '#38d17a',
  WARNING: '#ffc93d',
  STOPPED: '#ff4b3e',
  MAINT: '#3fb6ff',
  SETUP: '#3fb6ff',
  IDLE: '#7f8994',
};

/** Simulated time with sub-tick interpolation for smooth animation. */
export function simNow(): number {
  const st = useApp.getState();
  const s = st.sim;
  if (!s) return 0;
  if (s.paused || st.report) return s.t;
  const extra = Math.min(0.35, (performance.now() - st.lastTickReal) / 1000) * s.speed;
  return s.t + extra;
}

export function getSim(): SimState | null {
  return useApp.getState().sim;
}

export function machineState(id: string) {
  return useApp.getState().sim?.machines[id];
}

/** Is the machine actively processing (drives most animations)? */
export function isRunning(id: string) {
  const m = machineState(id);
  return !!m && (m.status === 'RUNNING' || (m.status === 'WARNING' && !!m.operator && m.setupLeft <= 0 && !!m.order));
}

export const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
