import { useApp } from '../store/store';
import type { SimState } from '../engine';

/** Subscribe to simulation changes (throttled by the store tick) and return the live state. */
export function useSim(): SimState {
  useApp((s) => s.rev);
  return useApp.getState().sim!;
}

export function parseRoute(route: string) {
  const parts = route.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { module: parts[0] ?? 'dashboard', sub: parts[1], id: parts.slice(2).join('/') || undefined, parts };
}

export function go(route: string) {
  useApp.getState().navigate(route);
}
