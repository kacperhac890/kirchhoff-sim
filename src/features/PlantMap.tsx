// 2D schematic of the plant for the cockpit — live machine status, trucks and forklifts.
import { HALL, INBOUND_DOORS, MACHINES, OUTBOUND_DOORS, RACK_DEFS, ZONES, BIN_MAP, accessPoint, docsOf, type SimState } from '../engine';
import { useApp } from '../store/store';
import { MACHINE_STATUS } from '../ui/kit';

const FOOT: Record<string, [number, number]> = { PRESS: [6, 4.6], BLANK: [11, 4.4], TRIM: [5.6, 4.2], WELD: [7, 6], HOTFORM: [6, 4.6], KTL: [22, 4], CNC: [4.4, 3], QC: [3.2, 2.2] };

export function PlantMap({ s }: { s: SimState }) {
  const nav = useApp((st) => st.navigate);
  const focus = useApp((st) => st.focus);
  const open = (target: string) => {
    nav('#/factory');
    setTimeout(() => focus(target), 50);
  };
  const ibd = docsOf(s, 'IBD').filter((d) => d.arrivedAt !== undefined && !(d.departAt !== undefined && s.t > d.departAt));
  const shp = docsOf(s, 'SHP').filter((d) => d.arrivedAt !== undefined && d.departedAt === undefined);
  return (
    <svg viewBox={`${HALL.x0 - 14} ${HALL.z0 - 3} ${HALL.x1 - HALL.x0 + 28} ${HALL.z1 - HALL.z0 + 6}`} className="h-auto w-full" role="img" aria-label="Plant layout with live machine status">
      <rect x={HALL.x0} y={HALL.z0} width={HALL.x1 - HALL.x0} height={HALL.z1 - HALL.z0} rx={1} fill="oklch(0.215 0.011 250)" stroke="oklch(0.36 0.012 250)" strokeWidth={0.4} />
      <rect x={HALL.x0 + 1} y={-9.4} width={HALL.x1 - HALL.x0 - 2} height={10.6} fill="oklch(0.195 0.011 250)" />
      {ZONES.map((z) => (
        <g key={z.id}>
          <rect x={z.rect[0]} y={z.rect[2]} width={z.rect[1] - z.rect[0]} height={z.rect[3] - z.rect[2]} fill="none" stroke="oklch(0.62 0.1 85 / 0.45)" strokeWidth={0.25} />
          <text x={z.rect[0] + 0.8} y={z.rect[2] + 2.4} fontSize={1.7} fill="oklch(0.68 0.012 250)" style={{ fontFamily: 'IBM Plex Sans' }}>
            {z.short}
          </text>
        </g>
      ))}
      {RACK_DEFS.map((r) => (
        <rect key={r.wh + r.rack} x={r.x - 0.55} y={r.zStart - r.bayPitch / 2} width={1.1} height={r.bays * r.bayPitch} fill="oklch(0.5 0.12 250 / 0.5)" />
      ))}
      {Object.values(BIN_MAP)
        .filter((b) => b.type === 'SHEET')
        .map((b) => (
          <rect key={b.id} x={b.pos[0] - 1.3} y={b.pos[2] - 0.7} width={2.6} height={1.4} fill="oklch(0.45 0.02 250)" />
        ))}
      {MACHINES.map((d) => {
        const m = s.machines[d.id];
        const st = MACHINE_STATUS[m.status];
        const [w, h] = FOOT[d.group];
        const cx = d.group === 'KTL' ? d.pos[0] : d.pos[0];
        return (
          <g key={d.id} onClick={() => open(`machine:${d.id}`)} className="cursor-pointer" role="button" aria-label={`${d.id} ${st.label}`}>
            {d.group === 'HOTFORM' && <rect x={d.pos[0] - 20.5} y={d.pos[1] - 1.5} width={14} height={3} rx={0.3} fill="oklch(0.3 0.02 50)" />}
            <rect x={cx - w / 2} y={d.pos[1] - h / 2} width={w} height={h} rx={0.5} fill={st.soft} stroke={st.color} strokeWidth={0.35} />
            <circle cx={cx + w / 2 - 0.9} cy={d.pos[1] - h / 2 + 0.9} r={0.55} fill={st.color} className={m.status === 'STOPPED' ? 'pulse' : undefined} />
            <text x={cx} y={d.pos[1] + 0.6} fontSize={1.45} textAnchor="middle" fill="oklch(0.92 0.005 250)" style={{ fontFamily: 'IBM Plex Mono' }}>
              {d.id}
            </text>
          </g>
        );
      })}
      {INBOUND_DOORS.map(([x, z], i) => (
        <rect key={`i${i}`} x={x - 0.4} y={z - 1.9} width={0.8} height={3.8} fill="oklch(0.7 0.135 248)" />
      ))}
      {OUTBOUND_DOORS.map(([x, z], i) => (
        <rect key={`o${i}`} x={x - 0.4} y={z - 1.9} width={0.8} height={3.8} fill="oklch(0.82 0.145 80)" />
      ))}
      {ibd.map((d) => (
        <g key={d.id} onClick={() => nav(`#/warehouse/inbound/${d.id}`)} className="cursor-pointer">
          <rect x={HALL.x0 - 13.5} y={INBOUND_DOORS[d.dock ?? 0][1] - 1.3} width={13} height={2.6} rx={0.4} fill="oklch(0.85 0.01 250)" />
          <text x={HALL.x0 - 7} y={INBOUND_DOORS[d.dock ?? 0][1] + 0.6} fontSize={1.5} textAnchor="middle" fill="oklch(0.2 0.01 250)" style={{ fontFamily: 'IBM Plex Mono' }}>
            {d.id}
          </text>
        </g>
      ))}
      {shp.map((d) => (
        <g key={d.id} onClick={() => nav(`#/logistics/shipments`)} className="cursor-pointer">
          <rect x={HALL.x1 + 0.5} y={OUTBOUND_DOORS[d.dock][1] - 1.3} width={13} height={2.6} rx={0.4} fill="oklch(0.82 0.145 80)" />
          <text x={HALL.x1 + 7} y={OUTBOUND_DOORS[d.dock][1] + 0.6} fontSize={1.5} textAnchor="middle" fill="oklch(0.2 0.03 80)" style={{ fontFamily: 'IBM Plex Mono' }}>
            {d.id}
          </text>
        </g>
      ))}
      {Object.values(s.forklifts).map((f) => {
        const wt = f.task ? s.docs[f.task] : undefined;
        let p: [number, number] = [f.home[0], f.home[2]];
        if (wt && wt.type === 'WT' && wt.startedAt !== undefined) {
          const k = Math.min(1, (s.t - wt.startedAt) / wt.durationMin);
          const a = accessPoint(wt.fromBin);
          const b = accessPoint(wt.toBin);
          p = [a[0] + (b[0] - a[0]) * k, k < 0.5 ? a[1] + (-4 - a[1]) * Math.min(1, k * 4) : -4 + (b[1] + 4) * Math.max(0, (k - 0.75) * 4)];
        }
        return <circle key={f.id} cx={p[0]} cy={p[1]} r={0.8} fill="oklch(0.8 0.14 70)" stroke="oklch(0.2 0.01 250)" strokeWidth={0.2} />;
      })}
    </svg>
  );
}
