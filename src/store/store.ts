import { create } from 'zustand';
import {
  advance,
  createScenario,
  fail,
  type ScenarioId,
  type SimState,
  type TCode,
  type TxResult,
} from '../engine';
import { missionById, missionIntroEvent, scoreMission, type Mission } from '../game/missions';
import { ACHIEVEMENTS, newProfile, XP_IN_ROLE_BONUS, XP_PER_TX, type Profile } from '../game/progress';
import { rankFor, ROLES, TCODES } from '../game/roles';
import { localAdapter } from './persist';

export type Selection =
  | { kind: 'machine'; id: string }
  | { kind: 'bin'; id: string }
  | { kind: 'rack'; id: string }
  | { kind: 'zone'; id: string }
  | { kind: 'truck'; id: string }
  | { kind: 'forklift'; id: string };

export type CameraMode = 'overview' | 'map' | 'explore';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info' | 'xp';
  title: string;
  body?: string;
  fix?: string;
}

export interface MissionReport {
  mission: string;
  score: number;
  xp: number;
  errors: number;
  hints: number;
  simMinutes: number;
  certified: boolean;
  mistakes: { text: string; fix: string }[];
}

export interface StepFlash {
  stepId: string;
  title: string;
  why: string;
}

interface AppState {
  profile: Profile | null;
  sim: SimState | null;
  slot: string;
  rev: number;
  lastTickReal: number;
  route: string;
  selection: Selection | null;
  camera: CameraMode;
  focusRequest: { target: string; n: number } | null;
  paletteOpen: boolean;
  drawer: 'notifications' | 'tasks' | 'help' | null;
  toasts: Toast[];
  trail: string[];
  stepFlash: StepFlash | null;
  report: MissionReport | null;
  missionCollapsed: boolean;
  quality: 'high' | 'low';

  login: (name: string, employeeId: string) => void;
  logout: () => void;
  startScenario: (id: ScenarioId, fresh?: boolean) => void;
  resumeSlot: (slot: string) => boolean;
  exitScenario: () => void;
  run: (tcode: TCode, fn: (s: SimState) => TxResult, opts?: { silent?: boolean }) => TxResult;
  tick: () => void;
  setSpeed: (n: number) => void;
  togglePause: () => void;
  navigate: (route: string) => void;
  select: (sel: Selection | null) => void;
  setCamera: (c: CameraMode) => void;
  focus: (target: string) => void;
  setPalette: (open: boolean) => void;
  setDrawer: (d: AppState['drawer']) => void;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  visit: (key: string) => void;
  spendHint: () => void;
  closeReport: () => void;
  dismissFlash: () => void;
  setRole: (r: Profile['activeRole']) => void;
  markEventsRead: () => void;
  setMissionCollapsed: (v: boolean) => void;
  setQuality: (q: 'high' | 'low') => void;
  bump: () => void;
}

let toastId = 1;
let lastSave = 0;

function slotFor(id: ScenarioId) {
  return id === 'FREE' ? 'free' : `mission-${id}`;
}

export const useApp = create<AppState>((set, get) => ({
  profile: localAdapter.loadProfile(),
  sim: null,
  slot: '',
  rev: 0,
  lastTickReal: performance.now(),
  route: location.hash || '#/dashboard',
  selection: null,
  camera: 'overview',
  focusRequest: null,
  paletteOpen: false,
  drawer: null,
  toasts: [],
  trail: [],
  stepFlash: null,
  report: null,
  missionCollapsed: false,
  quality: (() => {
    try {
      return (localStorage.getItem('kfs-quality') as 'high' | 'low') || 'high';
    } catch {
      return 'high';
    }
  })(),

  login(name, employeeId) {
    const existing = get().profile;
    const p = existing && existing.employeeId === employeeId ? { ...existing, name } : newProfile(name, employeeId);
    localAdapter.saveProfile(p);
    set({ profile: p });
  },
  logout() {
    get().exitScenario();
    set({ profile: null });
    localAdapter.saveProfile(null);
  },

  startScenario(id, fresh = true) {
    const p = get().profile;
    if (!p) return;
    const slot = slotFor(id);
    let sim = fresh ? null : localAdapter.loadSim(slot);
    if (!sim) {
      sim = createScenario(id, p.employeeId.toUpperCase(), (Date.now() % 100000) + 17);
      const m = missionById(id);
      if (m) {
        sim.mission = { id, step: 0, startedAt: sim.t, completedSteps: [], errors: 0, hintsUsed: 0 };
        missionIntroEvent(sim, m);
        sim.speed = 1;
      } else {
        sim.speed = 2;
      }
      sim.paused = false;
    }
    const trail = fresh ? [] : JSON.parse(sessionStorage.getItem(`kfs-trail-${slot}`) ?? '[]');
    set({ sim, slot, trail, report: null, stepFlash: null, selection: null, rev: get().rev + 1, lastTickReal: performance.now() });
    localAdapter.saveSim(slot, sim);
  },
  resumeSlot(slot) {
    const sim = localAdapter.loadSim(slot);
    if (!sim) return false;
    let trail: string[] = [];
    try {
      trail = JSON.parse(sessionStorage.getItem(`kfs-trail-${slot}`) ?? '[]');
    } catch {
      trail = [];
    }
    set({ sim, slot, trail, report: null, rev: get().rev + 1, lastTickReal: performance.now() });
    return true;
  },
  exitScenario() {
    const { sim, slot } = get();
    if (sim && slot) localAdapter.saveSim(slot, sim);
    set({ sim: null, slot: '', selection: null, report: null, stepFlash: null });
  },

  run(tcode, fn, opts) {
    const { sim, profile } = get();
    if (!sim || !profile) return { ok: false, message: 'No simulation running.' };
    const mission = sim.mission ? missionById(sim.mission.id) : undefined;
    let res: TxResult;
    if (mission && !sim.mission?.finishedAt && !mission.tcodes.includes(tcode)) {
      const info = TCODES[tcode];
      res = fail(sim, tcode, `No authorization for ${info.sap} (${info.name}) in this training mission.`, `This mission trains: ${mission.tcodes.map((c) => TCODES[c].sap).join(', ')}. Use those transactions — or switch to free simulation for full access.`, 'AUTH');
    } else {
      res = fn(sim);
    }
    if (sim.mission && !sim.mission.finishedAt && !res.ok) sim.mission.errors++;
    // XP for correct postings
    let xpGain = 0;
    if (res.ok) {
      xpGain = XP_PER_TX + (ROLES[profile.activeRole]?.tcodes.includes(tcode) ? XP_IN_ROLE_BONUS : 0);
    }
    const newProfile = { ...profile, xp: profile.xp + xpGain };
    set({ profile: newProfile });
    if (!opts?.silent) {
      if (res.ok) get().pushToast({ kind: 'success', title: res.message });
      else get().pushToast({ kind: 'error', title: res.message, fix: res.fix });
    }
    afterChange(get, set);
    localAdapter.saveSim(get().slot, sim);
    localAdapter.saveProfile(get().profile);
    return res;
  },

  tick() {
    const { sim } = get();
    const now = performance.now();
    const elapsed = Math.min(1000, now - get().lastTickReal);
    if (!sim || sim.paused || get().report) {
      set({ lastTickReal: now });
      return;
    }
    const dt = (sim.speed * elapsed) / 1000;
    advance(sim, dt);
    const mission = sim.mission ? missionById(sim.mission.id) : undefined;
    if (mission?.onTick && sim.mission && !sim.mission.finishedAt) mission.onTick(sim, ctxOf(get));
    set({ lastTickReal: now });
    afterChange(get, set);
    if (now - lastSave > 5000) {
      lastSave = now;
      localAdapter.saveSim(get().slot, sim);
    }
  },

  setSpeed(n) {
    const sim = get().sim;
    if (!sim) return;
    sim.speed = n;
    sim.paused = false;
    set({ rev: get().rev + 1, lastTickReal: performance.now() });
  },
  togglePause() {
    const sim = get().sim;
    if (!sim) return;
    sim.paused = !sim.paused;
    set({ rev: get().rev + 1, lastTickReal: performance.now() });
  },
  navigate(route) {
    if (location.hash !== route) location.hash = route;
    set({ route });
    const key = route.replace('#/', '').split('/').slice(0, 2).join('.');
    get().visit(key);
    get().visit(route.replace('#/', '').split('/')[0]);
  },
  select(sel) {
    set({ selection: sel });
    if (sel) get().visit(`${sel.kind}:${sel.id}`);
  },
  setCamera(c) {
    set({ camera: c });
  },
  focus(target) {
    const n = (get().focusRequest?.n ?? 0) + 1;
    set({ focusRequest: { target, n } });
    const [kind, id] = target.split(':');
    if (kind === 'machine' || kind === 'zone' || kind === 'rack' || kind === 'bin') set({ selection: { kind, id } as Selection });
  },
  setPalette(open) {
    set({ paletteOpen: open });
  },
  setDrawer(d) {
    set({ drawer: get().drawer === d ? null : d });
    if (d === 'notifications') get().markEventsRead();
  },
  pushToast(t) {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    setTimeout(() => get().dismissToast(id), t.kind === 'error' ? 9000 : 4500);
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
  visit(key) {
    if (!key || get().trail.includes(key)) return;
    const trail = [...get().trail, key];
    set({ trail });
    try {
      sessionStorage.setItem(`kfs-trail-${get().slot}`, JSON.stringify(trail));
    } catch {
      /* ignore */
    }
    afterChange(get, set);
  },
  spendHint() {
    const sim = get().sim;
    if (sim?.mission) sim.mission.hintsUsed++;
  },
  closeReport() {
    set({ report: null });
  },
  dismissFlash() {
    set({ stepFlash: null });
  },
  setRole(r) {
    const p = get().profile;
    if (!p) return;
    const np = { ...p, activeRole: r };
    localAdapter.saveProfile(np);
    set({ profile: np });
  },
  markEventsRead() {
    const sim = get().sim;
    if (!sim) return;
    for (const e of sim.events) e.read = true;
    set({ rev: get().rev + 1 });
  },
  setMissionCollapsed(v) {
    set({ missionCollapsed: v });
  },
  setQuality(q) {
    try {
      localStorage.setItem('kfs-quality', q);
    } catch {
      /* ignore */
    }
    set({ quality: q });
  },
  bump() {
    set({ rev: get().rev + 1 });
  },
}));

function ctxOf(get: () => AppState) {
  const sim = get().sim!;
  return { trail: new Set(get().trail), startedAt: sim.mission?.startedAt ?? 0 };
}


/** Mission progress, achievements, rank-ups — run after every tick and posting. */
function afterChange(get: () => AppState, set: (p: Partial<AppState>) => void) {
  const { sim, profile } = get();
  if (!sim || !profile) return;
  const patch: Partial<AppState> = { rev: get().rev + 1 };
  let prof = { ...profile };
  const prevRank = rankFor(prof.xp);
  // mission steps
  const mp = sim.mission;
  const mission = mp ? missionById(mp.id) : undefined;
  if (mp && mission && !mp.finishedAt) {
    const ctx = ctxOf(get);
    let guard = 0;
    while (mp.step < mission.steps.length && guard++ < mission.steps.length) {
      const step = mission.steps[mp.step];
      if (!step.check(sim, ctx)) break;
      mp.completedSteps.push(step.id);
      mp.step++;
      patch.stepFlash = { stepId: step.id, title: step.title, why: step.why };
    }
    if (mp.step >= mission.steps.length) {
      mp.finishedAt = sim.t;
      const score = scoreMission(mp.errors, mp.hintsUsed);
      const xp = Math.round((mission.xp * score) / 100);
      prof.xp += xp;
      const certified = score >= 70;
      if (certified && !prof.certifications.some((c) => c.mission === mission.id)) {
        prof.certifications = [...prof.certifications, { mission: mission.id, title: mission.certification, score, t: new Date().toISOString() }];
      }
      prof.best = { ...prof.best, [mission.id]: Math.max(prof.best[mission.id] ?? 0, score) };
      if (mp.errors === 0 && !prof.achievements.includes('FLAWLESS')) {
        prof.achievements = [...prof.achievements, 'FLAWLESS'];
        prof.xp += 100;
      }
      patch.report = {
        mission: mission.id,
        score,
        xp,
        errors: mp.errors,
        hints: mp.hintsUsed,
        simMinutes: sim.t - mp.startedAt,
        certified,
        mistakes: sim.stats.mistakes.filter((m) => m.t >= mp.startedAt).map((m) => ({ text: m.text, fix: m.fix })),
      };
      sim.paused = true;
    }
  }
  // achievements
  for (const a of ACHIEVEMENTS) {
    if (prof.achievements.includes(a.id)) continue;
    if (a.check(sim, prof)) {
      prof = { ...prof, achievements: [...prof.achievements, a.id], xp: prof.xp + a.xp };
      get().pushToast({ kind: 'xp', title: `Achievement unlocked: ${a.title}`, body: `${a.text}${a.xp ? ` +${a.xp} XP` : ''}` });
    }
  }
  const newRank = rankFor(prof.xp);
  if (newRank !== prevRank) {
    get().pushToast({ kind: 'xp', title: `Promotion: ${ROLES[newRank].title}`, body: 'New role, transactions and missions unlocked.' });
    prof.activeRole = newRank;
  }
  if (prof.xp !== profile.xp || prof.achievements !== profile.achievements || prof.certifications !== profile.certifications) {
    patch.profile = prof;
    localAdapter.saveProfile(prof);
  }
  set(patch);
}

export type { Mission };
