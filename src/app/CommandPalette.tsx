import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, FileText, Layers, Package, Search, Terminal, Zap } from 'lucide-react';
import { useApp } from '../store/store';
import { BINS, DOC_LABEL, MACHINES, MATERIALS, type TCode } from '../engine';
import { TCODES } from '../game/roles';
import { cx } from '../ui/kit';

export const TCODE_ROUTE: Record<TCode, string> = {
  MIGO_GR: '#/warehouse/inbound',
  MIGO_TR: '#/warehouse/stock',
  MIGO_GI: '#/warehouse/stock',
  MI01: '#/warehouse/count',
  MB_REV: '#/documents',
  ME51N: '#/procurement',
  ME21N: '#/procurement',
  MD01: '#/production/mrp',
  CO01: '#/production/create',
  CO02: '#/production',
  CO_STAGE: '#/production',
  CO11N: '#/production',
  CO_GR: '#/production',
  CO_TECO: '#/production',
  QA32: '#/quality',
  QM01: '#/quality/notifications',
  QA_BLOCK: '#/quality/batches',
  IW21: '#/maintenance',
  IW31: '#/maintenance',
  IW41: '#/maintenance/orders',
  VA01: '#/logistics/create',
  VL01N: '#/logistics',
  VL_PICK: '#/logistics/deliveries',
  VL_PGI: '#/logistics/deliveries',
  VT01N: '#/logistics/deliveries',
};

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  Icon: typeof Box;
  run: () => void;
}

export function CommandPalette() {
  const open = useApp((s) => s.paletteOpen);
  const setOpen = useApp((s) => s.setPalette);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    if (!open) return [];
    const st = useApp.getState();
    const s = st.sim;
    const nav = (r: string) => () => {
      st.navigate(r);
      setOpen(false);
    };
    const query = q.trim().toLowerCase();
    const match = (...xs: (string | undefined)[]) => !query || xs.some((x) => x?.toLowerCase().includes(query));
    const list: Item[] = [];
    const modules: [string, string][] = [
      ['Plant cockpit', '#/dashboard'],
      ['3D factory', '#/factory'],
      ['Warehouse — inbound deliveries', '#/warehouse/inbound'],
      ['Warehouse — stock overview', '#/warehouse/stock'],
      ['Warehouse — rack map', '#/warehouse/bins'],
      ['Physical inventory', '#/warehouse/count'],
      ['Production orders', '#/production'],
      ['MRP run', '#/production/mrp'],
      ['Quality — inspection lots', '#/quality'],
      ['Maintenance', '#/maintenance'],
      ['Procurement', '#/procurement'],
      ['Sales orders & deliveries', '#/logistics'],
      ['Transport planning', '#/logistics/shipments'],
      ['Document center', '#/documents'],
      ['Audit log', '#/documents/audit'],
      ['Analytics', '#/analytics'],
      ['Missions & career', '#/missions'],
    ];
    for (const [label, r] of modules) if (match(label)) list.push({ id: `nav${r}`, group: 'Go to', label, Icon: Layers, run: nav(r) });
    for (const t of Object.values(TCODES)) if (match(t.sap, t.name, t.code)) list.push({ id: `t${t.code}`, group: 'Transactions', label: t.name, hint: t.sap, Icon: Terminal, run: nav(TCODE_ROUTE[t.code]) });
    if (s && query.length >= 2) {
      let n = 0;
      for (const d of Object.values(s.docs)) {
        if (n >= 8) break;
        if (d.type === 'WT') continue;
        if (match(d.id)) {
          list.push({ id: `d${d.id}`, group: 'Documents', label: `${DOC_LABEL[d.type]} ${d.id}`, hint: d.status.toLowerCase(), Icon: FileText, run: nav(`#/documents/${encodeURIComponent(d.id)}`) });
          n++;
        }
      }
    }
    for (const m of MACHINES)
      if (query && match(m.id, m.name))
        list.push({
          id: `m${m.id}`,
          group: 'Machines',
          label: `${m.id} — ${m.name}`,
          Icon: Box,
          run: () => {
            st.navigate('#/factory');
            st.focus(`machine:${m.id}`);
            setOpen(false);
          },
        });
    if (query.length >= 3)
      for (const b of BINS.filter((b) => match(b.id)).slice(0, 6))
        list.push({
          id: `b${b.id}`,
          group: 'Storage bins',
          label: b.id,
          Icon: Package,
          run: () => {
            st.navigate(`#/warehouse/bins/${b.id}`);
            setOpen(false);
          },
        });
    if (query.length >= 2) for (const m of Object.values(MATERIALS).filter((m) => match(m.id, m.name)).slice(0, 6)) list.push({ id: `mat${m.id}`, group: 'Materials', label: m.name, hint: m.id, Icon: Package, run: nav(`#/warehouse/stock/${m.id}`) });
    const actions: Item[] = [
      { id: 'a-pause', group: 'Simulation', label: s?.paused ? 'Resume simulation' : 'Pause simulation', hint: 'Space', Icon: Zap, run: () => { st.togglePause(); setOpen(false); } },
      ...[1, 2, 5, 10].map((v) => ({ id: `a-x${v}`, group: 'Simulation', label: `Speed ×${v}`, Icon: Zap, run: () => { st.setSpeed(v); setOpen(false); } })),
      { id: 'a-q', group: 'Simulation', label: `Graphics quality: ${st.quality === 'high' ? 'switch to performance' : 'switch to high'}`, Icon: Zap, run: () => { st.setQuality(st.quality === 'high' ? 'low' : 'high'); setOpen(false); } },
    ];
    for (const a of actions) if (match(a.label)) list.push(a);
    return list.slice(0, 40);
  }, [open, q, setOpen]);

  if (!open) return null;
  const sel = Math.min(idx, Math.max(0, items.length - 1));
  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center bg-[oklch(0.1_0.01_250/0.55)] px-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command search"
        className="overlay-surface w-full max-w-[620px] overflow-hidden rounded-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIdx((i) => Math.min(items.length - 1, i + 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIdx((i) => Math.max(0, i - 1));
          }
          if (e.key === 'Enter') items[sel]?.run();
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 text-ink-3" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            placeholder="Type a T-code (MIGO, CO11N…), document number, machine or material"
            className="h-12 flex-1 bg-transparent text-base text-ink placeholder:text-ink-4 focus:outline-none"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[sel] ? `pi-${items[sel].id}` : undefined}
          />
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-3">Nothing found for “{q}”.</li>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <li key={it.id} role="presentation">
                {header && <div className="px-2.5 pt-2.5 pb-1 text-2xs font-medium text-ink-4">{header}</div>}
                <div
                  id={`pi-${it.id}`}
                  role="option"
                  aria-selected={i === sel}
                  onMouseEnter={() => setIdx(i)}
                  onClick={it.run}
                  className={cx('flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm', i === sel ? 'bg-s3 text-ink' : 'text-ink-2')}
                >
                  <it.Icon className="size-4 shrink-0 text-ink-3" aria-hidden />
                  <span className="truncate">{it.label}</span>
                  {it.hint && <span className="mono ml-auto shrink-0 text-xs text-ink-3">{it.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
