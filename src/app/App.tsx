import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { useApp } from '../store/store';
import { Login } from '../features/Login';
import { Lobby } from '../features/Lobby';
import { Shell } from './Shell';
import { Toasts } from './Toasts';
import { localAdapter } from '../store/persist';

const Backdrop = lazy(() => import('../three/Backdrop'));

export function App() {
  const profile = useApp((s) => s.profile);
  const hasSim = useApp((s) => !!s.sim);

  // hash routing
  useEffect(() => {
    const on = () => useApp.getState().navigate(location.hash || '#/dashboard');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  // simulation clock: 4 ticks per second, sub-tick interpolation in the 3D view
  useEffect(() => {
    const id = window.setInterval(() => useApp.getState().tick(), 250);
    return () => window.clearInterval(id);
  }, []);

  // pause while the tab is hidden so nothing happens unseen — and resume on return,
  // but only if it was this auto-pause (a pause the player chose stays)
  useEffect(() => {
    let autoPaused = false;
    const on = () => {
      const st = useApp.getState();
      const s = st.sim;
      if (!s) return;
      if (document.hidden && !s.paused) {
        s.paused = true;
        autoPaused = true;
        st.bump();
      } else if (!document.hidden && autoPaused) {
        autoPaused = false;
        if (s.paused && !st.report) {
          s.paused = false;
          useApp.setState({ lastTickReal: performance.now() });
          st.bump();
        }
      }
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  useEffect(() => {
    const save = () => {
      const { sim, slot } = useApp.getState();
      if (sim && slot) localAdapter.saveSim(slot, sim);
    };
    window.addEventListener('beforeunload', save);
    return () => window.removeEventListener('beforeunload', save);
  }, []);

  if (!profile || !hasSim) {
    return (
      <div className="relative h-full overflow-hidden">
        <div className="absolute inset-0" aria-hidden>
          <Suspense fallback={null}>
            <Backdrop />
          </Suspense>
          <div className="absolute inset-0 bg-[linear-gradient(90deg,oklch(0.165_0.01_250/0.97)_0%,oklch(0.165_0.01_250/0.88)_42%,oklch(0.165_0.01_250/0.35)_100%)]" />
        </div>
        <div className="relative h-full overflow-y-auto">{!profile ? <Login /> : <Lobby />}</div>
        <Toasts />
      </div>
    );
  }
  return (
    <>
      <ErrorBoundary>
        <Shell />
      </ErrorBoundary>
      <Toasts />
    </>
  );
}

/** A crash in one screen must never freeze the whole plant: show it and let the player recover. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('UI error', error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="panel max-w-[520px] p-6">
          <h1 className="text-lg font-semibold text-ink">This screen hit an error</h1>
          <p className="mt-2 text-sm text-ink-2">Your plant is saved. Go back to the cockpit to continue — the simulation state is not affected.</p>
          <pre className="mono mt-3 max-h-32 overflow-auto rounded bg-s2 p-2 text-xs text-ink-3">{this.state.error.message}</pre>
          <button
            type="button"
            onClick={() => {
              location.hash = '#/dashboard';
              this.setState({ error: null });
            }}
            className="press mt-4 h-8 cursor-pointer rounded-md bg-accent px-3 text-sm font-medium text-accent-ink"
          >
            Back to cockpit
          </button>
        </div>
      </div>
    );
  }
}
