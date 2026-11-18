// Persistence adapter. localStorage today; the same interface can be backed
// by a REST/Prisma API without touching the engine or the UI.
import type { SimState } from '../engine';
import { STATE_VERSION } from '../engine';
import type { Profile } from '../game/progress';

export interface SaveAdapter {
  loadProfile(): Profile | null;
  saveProfile(p: Profile | null): void;
  loadSim(slot: string): SimState | null;
  saveSim(slot: string, s: SimState): void;
  clearSim(slot: string): void;
  listSlots(): { slot: string; t: number; scenario: string; savedAt: string }[];
}

const P_KEY = 'kfs-profile-v1';
const S_KEY = (slot: string) => `kfs-save-v${STATE_VERSION}-${slot}`;
const META_KEY = 'kfs-saves-meta-v1';

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
    return true;
  } catch {
    return false;
  }
}

export const localAdapter: SaveAdapter = {
  loadProfile() {
    const raw = safeGet(P_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Profile;
    } catch {
      return null;
    }
  },
  saveProfile(p) {
    if (!p) {
      try {
        localStorage.removeItem(P_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    safeSet(P_KEY, JSON.stringify(p));
  },
  loadSim(slot) {
    const raw = safeGet(S_KEY(slot));
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as SimState;
      return s.version === STATE_VERSION ? s : null;
    } catch {
      return null;
    }
  },
  saveSim(slot, s) {
    if (safeSet(S_KEY(slot), JSON.stringify(s))) {
      const meta = this.listSlots().filter((m) => m.slot !== slot);
      meta.push({ slot, t: s.t, scenario: s.scenario, savedAt: new Date().toISOString() });
      safeSet(META_KEY, JSON.stringify(meta));
    }
  },
  clearSim(slot) {
    try {
      localStorage.removeItem(S_KEY(slot));
    } catch {
      /* ignore */
    }
    safeSet(META_KEY, JSON.stringify(this.listSlots().filter((m) => m.slot !== slot)));
  },
  listSlots() {
    try {
      return JSON.parse(safeGet(META_KEY) ?? '[]');
    } catch {
      return [];
    }
  },
};
