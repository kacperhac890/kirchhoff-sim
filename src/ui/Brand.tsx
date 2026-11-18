export function Brand({ large, collapsed }: { large?: boolean; collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className={large ? 'size-10' : 'size-7'} aria-hidden>
        <rect width="32" height="32" rx="7" fill="oklch(0.235 0.012 250)" />
        <path d="M8 23V9h3.2v5.6L16.6 9h3.9l-5.9 6.3L21 23h-4l-4.6-5.7-1.2 1.3V23z" fill="oklch(0.7 0.135 248)" />
        <rect x="21.5" y="20" width="3" height="3" fill="oklch(0.82 0.145 80)" />
      </svg>
      {!collapsed && (
        <div className="leading-tight">
          <div className={`${large ? 'text-lg' : 'text-sm'} font-semibold tracking-[0.06em] text-ink`}>KIRCHHOFF</div>
          <div className={`${large ? 'text-sm' : 'text-2xs'} text-ink-3`}>{large ? 'Factory Simulator · Plant 1000 Gliwice (training)' : 'Factory Simulator'}</div>
        </div>
      )}
    </div>
  );
}
