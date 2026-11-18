// Player profile, XP, achievements and certifications (persisted separately
// from the simulation save so career progress survives scenario restarts).
import { docsOf, type RoleId, type SimState } from '../engine';
import { rankFor } from './roles';

export interface Certification {
  mission: string;
  title: string;
  score: number;
  t: string; // ISO date
}

export interface Profile {
  name: string;
  employeeId: string;
  xp: number;
  activeRole: RoleId;
  achievements: string[];
  certifications: Certification[];
  best: Record<string, number>; // best mission score
  createdAt: string;
}

export interface Achievement {
  id: string;
  title: string;
  text: string;
  xp: number;
  check: (s: SimState, p: Profile) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'FIRST_GR', title: 'Dock to stock', text: 'Post your first goods receipt for a purchase order.', xp: 40, check: (s) => docsOf(s, 'MD').some((m) => m.mvt === '101' && m.refs.some((r) => s.docs[r]?.type === 'PO') && m.createdBy !== 'SYSTEM') },
  { id: 'FIRST_RELEASE', title: 'Green light', text: 'Release a production order after a successful availability check.', xp: 40, check: (s) => docsOf(s, 'PP').some((p) => p.history.some((h) => h.action === 'Released' && h.user !== 'SYSTEM')) },
  { id: 'CLEAN_LOT', title: 'Right first time', text: 'Accept an inspection lot with every characteristic in tolerance.', xp: 50, check: (s) => docsOf(s, 'IL').some((l) => l.decision === 'ACCEPT' && l.chars.every((c) => (c.recorded ?? c.measured) >= c.lsl && (c.recorded ?? c.measured) <= c.usl)) },
  { id: 'QUALITY_GATE', title: 'Quality gate', text: 'Reject a nonconforming lot before it reaches a customer.', xp: 80, check: (s) => docsOf(s, 'IL').some((l) => l.decision === 'REJECT' && l.chars.some((c) => (c.recorded ?? c.measured) < c.lsl || (c.recorded ?? c.measured) > c.usl)) },
  { id: 'BACK_ONLINE', title: 'Back online', text: 'Complete a corrective maintenance order after a breakdown.', xp: 60, check: (s) => docsOf(s, 'MO').some((m) => m.kind === 'PM01' && m.status === 'COMPLETED') },
  { id: 'PREVENTIVE', title: 'Stitch in time', text: 'Complete a preventive maintenance order (PM02).', xp: 50, check: (s) => docsOf(s, 'MO').some((m) => m.kind === 'PM02' && m.status === 'COMPLETED') },
  { id: 'GHOSTBUSTER', title: 'Ghostbuster', text: 'Find and post an inventory difference with a physical count.', xp: 60, check: (s) => docsOf(s, 'MD').some((m) => m.mvt === '702' || m.mvt === '701') },
  { id: 'ON_TIME', title: 'Just in time', text: 'Deliver a sales order to the customer on time.', xp: 80, check: (s) => s.stats.deliveriesOnTime > 0 },
  { id: 'SELF_CORRECT', title: 'Clean books', text: 'Correct a wrong posting with a reversal document.', xp: 40, check: (s) => s.stats.reversals > 0 },
  { id: 'SPEED_SHIFT', title: 'Full shift', text: 'Run the plant for 8 simulated hours in free simulation.', xp: 100, check: (s) => s.mode === 'FREE' && s.t >= 8 * 60 },
  { id: 'FLAWLESS', title: 'Flawless', text: 'Finish a training mission without a single rejected transaction.', xp: 100, check: () => false },
  { id: 'MANAGER', title: 'Plant manager', text: 'Reach the rank of factory manager.', xp: 0, check: (_s, p) => rankFor(p.xp) === 'MANAGER' },
];

export function newProfile(name: string, employeeId: string): Profile {
  return { name, employeeId, xp: 0, activeRole: 'NEW', achievements: [], certifications: [], best: {}, createdAt: new Date().toISOString() };
}

export const XP_PER_TX = 6;
export const XP_IN_ROLE_BONUS = 4;
