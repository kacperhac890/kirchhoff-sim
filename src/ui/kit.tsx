// Small design-system kit: buttons, status pills, fields, tabs, panels.
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, Loader2, Wrench, PauseCircle, Info } from 'lucide-react';
import type { DocStatus, MachineStatus } from '../engine';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'amber';
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; icon?: ReactNode; loading?: boolean }) {
  const v = {
    primary: 'bg-accent text-accent-ink hover:bg-[oklch(0.75_0.13_248)] border border-transparent font-medium',
    secondary: 'bg-s2 text-ink border border-line hover:bg-s3 hover:border-s4',
    ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-s2 hover:text-ink',
    danger: 'bg-bad-soft text-[oklch(0.82_0.12_25)] border border-[oklch(0.68_0.19_25/0.4)] hover:bg-[oklch(0.68_0.19_25/0.25)]',
    amber: 'bg-amber text-[oklch(0.2_0.03_80)] border border-transparent hover:bg-[oklch(0.86_0.14_82)] font-medium',
  }[variant];
  const s = size === 'sm' ? 'h-7 px-2.5 text-xs gap-1.5' : 'h-8 px-3 text-sm gap-2';
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx('press inline-flex items-center justify-center rounded-md whitespace-nowrap cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed select-none', v, s, className)}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, active, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx(
        'press relative inline-flex size-8 items-center justify-center rounded-md cursor-pointer text-ink-2 hover:bg-s2 hover:text-ink disabled:opacity-40',
        active && 'bg-s3 text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

// --------------------------------------------------------------- status
export const MACHINE_STATUS: Record<MachineStatus, { label: string; color: string; soft: string; Icon: typeof CheckCircle2 }> = {
  RUNNING: { label: 'Running', color: 'var(--color-ok)', soft: 'var(--color-ok-soft)', Icon: CheckCircle2 },
  WARNING: { label: 'Warning', color: 'var(--color-warn)', soft: 'var(--color-warn-soft)', Icon: AlertTriangle },
  STOPPED: { label: 'Stopped', color: 'var(--color-bad)', soft: 'var(--color-bad-soft)', Icon: CircleSlash },
  MAINT: { label: 'Maintenance', color: 'var(--color-maint)', soft: 'var(--color-maint-soft)', Icon: Wrench },
  SETUP: { label: 'Setup', color: 'var(--color-maint)', soft: 'var(--color-maint-soft)', Icon: Wrench },
  IDLE: { label: 'Idle', color: 'var(--color-idle)', soft: 'oklch(0.62 0.01 250 / 0.14)', Icon: PauseCircle },
};

export function MachinePill({ status, className }: { status: MachineStatus; className?: string }) {
  const m = MACHINE_STATUS[status];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', className)} style={{ background: m.soft, color: m.color }}>
      <m.Icon className="size-3.5" aria-hidden />
      {m.label}
    </span>
  );
}

const DOC_STATUS: Record<DocStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'muted' },
  CREATED: { label: 'Created', tone: 'muted' },
  RELEASED: { label: 'Released', tone: 'accent' },
  IN_PROGRESS: { label: 'In progress', tone: 'warn' },
  COMPLETED: { label: 'Completed', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'muted' },
  BLOCKED: { label: 'Blocked', tone: 'bad' },
};
export function DocStatusPill({ status, label }: { status: DocStatus; label?: string }) {
  const d = DOC_STATUS[status];
  return <Badge tone={d.tone}>{label ?? d.label}</Badge>;
}

export type Tone = 'muted' | 'accent' | 'ok' | 'warn' | 'bad' | 'maint' | 'amber';
const TONES: Record<Tone, string> = {
  muted: 'bg-s3 text-ink-2',
  accent: 'bg-accent-soft text-[oklch(0.82_0.09_248)]',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-[oklch(0.78_0.14_25)]',
  maint: 'bg-maint-soft text-maint',
  amber: 'bg-amber-soft text-amber',
};
export function Badge({ tone = 'muted', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded px-1.5 py-px text-xs font-medium whitespace-nowrap', TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

// --------------------------------------------------------------- layout
export function PageHeader({ title, sap, children, sub }: { title: string; sap?: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line-soft px-6 pt-5 pb-4">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-ink">{title}</h1>
          {sap && <span className="mono text-xs text-ink-3">{sap}</span>}
        </div>
        {sub && <div className="mt-1 text-sm text-ink-3">{sub}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Panel({ title, actions, children, className, bodyClass, sub }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; sub?: ReactNode }) {
  return (
    <section className={cx('panel flex min-h-0 flex-col', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>}
            {sub && <div className="text-xs text-ink-3">{sub}</div>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cx('min-h-0 flex-1', bodyClass)}>{children}</div>
    </section>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cx('flex gap-1 border-b border-line-soft px-6', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'relative -mb-px cursor-pointer px-3 py-2.5 text-sm transition-colors',
            value === t.id ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="ml-1.5 rounded bg-s3 px-1.5 text-2xs text-ink-2 tnum">{t.count}</span>}
          {value === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

// --------------------------------------------------------------- forms
export function Field({ label, hint, error, children, required }: { label: string; hint?: ReactNode; error?: string; children: (id: string) => ReactNode; required?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-ink-2">
        {label}
        {required && <span className="ml-0.5 text-amber" aria-hidden>*</span>}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="text-xs text-[oklch(0.78_0.14_25)]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

const inputCls = 'h-8 w-full rounded-md border border-line bg-bg px-2.5 text-sm text-ink placeholder:text-ink-4 hover:border-s4 focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-[oklch(0.7_0.135_248/0.25)] disabled:opacity-50';
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.type === 'number' && 'tnum text-right', props.className)} />;
}
export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(inputCls, 'cursor-pointer pr-7', props.className)}>
      {children}
    </select>
  );
}

// --------------------------------------------------------------- data display
export function KV({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-2', cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-ink-3">{k}</dt>
          <dd className="truncate text-sm text-ink tnum">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Bar({ value, tone = 'accent', className, label }: { value: number; tone?: 'accent' | 'ok' | 'warn' | 'bad' | 'maint'; className?: string; label?: string }) {
  const color = { accent: 'var(--color-accent)', ok: 'var(--color-ok)', warn: 'var(--color-warn)', bad: 'var(--color-bad)', maint: 'var(--color-maint)' }[tone];
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-s3', className)} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: color, transition: 'width 300ms var(--ease-out-strong)' }} />
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-ink-4">{icon}</div>}
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {children && <p className="max-w-[46ch] text-xs text-ink-3">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Callout({ tone = 'accent', title, children, icon }: { tone?: 'accent' | 'warn' | 'bad' | 'ok' | 'amber'; title?: ReactNode; children: ReactNode; icon?: ReactNode }) {
  const bg = { accent: 'var(--color-accent-soft)', warn: 'var(--color-warn-soft)', bad: 'var(--color-bad-soft)', ok: 'var(--color-ok-soft)', amber: 'var(--color-amber-soft)' }[tone];
  const fg = { accent: 'oklch(0.82 0.09 248)', warn: 'var(--color-warn)', bad: 'oklch(0.8 0.13 25)', ok: 'var(--color-ok)', amber: 'var(--color-amber)' }[tone];
  return (
    <div className="flex gap-2.5 rounded-md px-3 py-2.5 text-sm" style={{ background: bg }}>
      <span className="mt-0.5 shrink-0" style={{ color: fg }} aria-hidden>
        {icon ?? <Info className="size-4" />}
      </span>
      <div className="min-w-0 text-ink-2">
        {title && <div className="mb-0.5 font-medium" style={{ color: fg }}>{title}</div>}
        {children}
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="mono rounded border border-line bg-s2 px-1 py-px text-2xs text-ink-3">{children}</kbd>;
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold text-ink-2">{children}</h3>
      {actions}
    </div>
  );
}
