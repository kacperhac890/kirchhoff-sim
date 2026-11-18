import { CheckCircle2, Info, Sparkles, X, XCircle } from 'lucide-react';
import { useApp } from '../store/store';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[var(--z-toast)] flex w-[min(420px,calc(100vw-32px))] flex-col gap-2" aria-live="polite" role="status">
      {toasts.map((t) => {
        const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? XCircle : t.kind === 'xp' ? Sparkles : Info;
        const color = t.kind === 'success' ? 'var(--color-ok)' : t.kind === 'error' ? 'var(--color-bad)' : t.kind === 'xp' ? 'var(--color-amber)' : 'var(--color-accent)';
        return (
          <div key={t.id} className="overlay-surface pointer-events-auto flex gap-3 rounded-lg px-3.5 py-3 rise-in">
            <Icon className="mt-0.5 size-4 shrink-0" style={{ color }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs text-ink-2">{t.body}</p>}
              {t.fix && (
                <p className="mt-1.5 text-xs text-ink-2">
                  <span className="font-medium text-amber">How to fix: </span>
                  {t.fix}
                </p>
              )}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="press -mt-1 -mr-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-ink-3 hover:bg-s3 hover:text-ink">
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
