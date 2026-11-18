import { lazy, Suspense, useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  Box,
  ClipboardCheck,
  Factory,
  FileText,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  ListTodo,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Warehouse,
  Wrench,
} from 'lucide-react';
import { useApp } from '../store/store';
import { useSim, parseRoute } from './hooks';
import { Brand } from '../ui/Brand';
import { Kbd, cx } from '../ui/kit';
import { getTasks, tasksByModule } from '../game/tasks';
import { missionById } from '../game/missions';
import { ROLES } from '../game/roles';
import { SimClock } from './SimClock';
import { CommandPalette } from './CommandPalette';
import { Drawers } from './Drawers';
import { MissionHud, MissionReportModal } from './MissionHud';
import { unreadCount } from '../engine';
import { Dashboard } from '../features/Dashboard';
import { WarehousePage } from '../features/Warehouse';
import { ProductionPage } from '../features/Production';
import { QualityPage } from '../features/Quality';
import { MaintenancePage } from '../features/Maintenance';
import { ProcurementPage } from '../features/Procurement';
import { LogisticsPage } from '../features/Logistics';
import { DocumentsPage } from '../features/Documents';
import { AnalyticsPage } from '../features/Analytics';
import { MissionsPage } from '../features/Missions';

const FactoryPage = lazy(() => import('../features/FactoryPage'));

const NAV = [
  { id: 'dashboard', label: 'Plant cockpit', sap: 'Launchpad', Icon: LayoutDashboard },
  { id: 'factory', label: '3D factory', sap: 'Digital twin', Icon: Box },
  { id: 'warehouse', label: 'Warehouse', sap: 'MM · EWM', Icon: Warehouse },
  { id: 'production', label: 'Production', sap: 'PP', Icon: Factory },
  { id: 'quality', label: 'Quality', sap: 'QM', Icon: ShieldCheck },
  { id: 'maintenance', label: 'Maintenance', sap: 'PM', Icon: Wrench },
  { id: 'procurement', label: 'Procurement', sap: 'MM-PUR', Icon: ShoppingCart },
  { id: 'logistics', label: 'Sales & transport', sap: 'SD · TM', Icon: Truck },
  { id: 'documents', label: 'Documents', sap: 'Doc. flow', Icon: FileText },
  { id: 'analytics', label: 'Analytics', sap: 'KPIs', Icon: BarChart3 },
  { id: 'missions', label: 'Missions & career', sap: 'Training', Icon: GraduationCap },
] as const;

export function Shell() {
  const s = useSim();
  const route = useApp((st) => st.route);
  const navigate = useApp((st) => st.navigate);
  const setPalette = useApp((st) => st.setPalette);
  const setDrawer = useApp((st) => st.setDrawer);
  const drawer = useApp((st) => st.drawer);
  const profile = useApp((st) => st.profile)!;
  const exit = useApp((st) => st.exitScenario);
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1100);
  const { module } = parseRoute(route);
  const tasks = getTasks(s);
  const counts = tasksByModule(tasks);
  const unread = unreadCount(s);
  const mission = s.mission ? missionById(s.mission.id) : undefined;

  useEffect(() => {
    useApp.getState().visit(parseRoute(route).module);
  }, [route]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(!useApp.getState().paletteOpen);
      }
      const typing = (e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]');
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (useApp.getState().camera === 'explore' && parseRoute(useApp.getState().route).module === 'factory') return;
      if (e.code === 'Space') {
        e.preventDefault();
        useApp.getState().togglePause();
      }
      const speeds: Record<string, number> = { Digit1: 1, Digit2: 2, Digit3: 5, Digit4: 10 };
      if (speeds[e.code]) useApp.getState().setSpeed(speeds[e.code]);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [setPalette]);

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[90] focus:rounded focus:bg-accent focus:px-3 focus:py-1.5 focus:text-accent-ink">
        Skip to content
      </a>
      <nav aria-label="Modules" className={cx('flex shrink-0 flex-col border-r border-line-soft bg-[oklch(0.185_0.011_250)] transition-[width] duration-200', collapsed ? 'w-[60px]' : 'w-[236px]')}>
        <div className={cx('flex h-14 items-center border-b border-line-soft', collapsed ? 'justify-center' : 'px-4')}>
          <Brand collapsed={collapsed} />
        </div>
        <ul className="flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((n) => {
            const active = module === n.id;
            const c = counts[n.id] ?? 0;
            return (
              <li key={n.id}>
                <a
                  href={`#/${n.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`#/${n.id}`);
                  }}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? `${n.label} (${n.sap})` : undefined}
                  className={cx(
                    'group relative mb-0.5 flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors',
                    active ? 'bg-s3 text-ink' : 'text-ink-2 hover:bg-s2 hover:text-ink',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <n.Icon className={cx('size-[18px] shrink-0', active ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2')} aria-hidden />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{n.label}</span>
                      {c > 0 ? (
                        <span className="tnum rounded bg-accent-soft px-1.5 text-2xs font-medium text-[oklch(0.82_0.09_248)]" aria-label={`${c} open tasks`}>
                          {c}
                        </span>
                      ) : (
                        <span className="mono text-2xs text-ink-4">{n.sap}</span>
                      )}
                    </>
                  )}
                  {collapsed && c > 0 && <span className="absolute top-1.5 right-2 size-1.5 rounded-full bg-accent" aria-hidden />}
                </a>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line-soft p-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="press flex h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-md text-xs text-ink-3 hover:bg-s2 hover:text-ink"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && 'Collapse'}
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line-soft bg-[oklch(0.18_0.011_250)] px-4">
          <div className="hidden min-w-0 items-center gap-2 xl:flex">
            {mission ? (
              <span className="flex min-w-0 items-center gap-2 rounded-md bg-amber-soft px-2 py-1 text-xs text-amber">
                <ClipboardCheck className="size-3.5 shrink-0" aria-hidden />
                <span className="mono shrink-0">{mission.code}</span>
                <span className="truncate text-ink-2">{mission.title}</span>
              </span>
            ) : (
              <span className="rounded-md bg-s2 px-2 py-1 text-xs text-ink-2">Free simulation</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="press flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-line bg-bg px-2.5 text-sm text-ink-3 hover:border-s4 md:max-w-[420px]"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Search documents, T-codes, machines…</span>
            <span className="ml-auto hidden shrink-0 whitespace-nowrap md:inline">
              <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <SimClock />
            <div className="mx-1 h-6 w-px bg-line-soft" aria-hidden />
            <TopIcon label="Worklist" active={drawer === 'tasks'} onClick={() => setDrawer('tasks')} count={tasks.length}>
              <ListTodo className="size-[18px]" />
            </TopIcon>
            <TopIcon label="Notifications" active={drawer === 'notifications'} onClick={() => setDrawer('notifications')} count={unread} alert={s.events.some((e) => !e.read && e.severity === 'critical')}>
              <Bell className="size-[18px]" />
            </TopIcon>
            <TopIcon label="Help for this screen" active={drawer === 'help'} onClick={() => setDrawer('help')}>
              <HelpCircle className="size-[18px]" />
            </TopIcon>
            <div className="ml-2 hidden items-center gap-2 border-l border-line-soft pl-3 lg:flex">
              <div className="text-right leading-tight">
                <div className="text-xs text-ink">{profile.name}</div>
                <div className="text-2xs text-ink-3">{ROLES[profile.activeRole].title}</div>
              </div>
              <button
                type="button"
                onClick={exit}
                title="Save and exit to lobby"
                aria-label="Save and exit to lobby"
                className="press flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-s2 hover:text-ink"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </header>
        <main id="main" className="relative min-h-0 flex-1 overflow-hidden">
          <Page module={module} />
          <MissionHud />
        </main>
      </div>
      <Drawers />
      <CommandPalette />
      <MissionReportModal />
    </div>
  );
}

function TopIcon({ label, children, onClick, count, active, alert }: { label: string; children: React.ReactNode; onClick: () => void; count?: number; active?: boolean; alert?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count ? `${label} (${count})` : label}
      title={label}
      aria-pressed={active}
      className={cx('press relative flex size-9 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-s2 hover:text-ink', active && 'bg-s3 text-ink')}
    >
      {children}
      {!!count && (
        <span className={cx('tnum absolute top-0.5 right-0.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold', alert ? 'bg-bad text-white' : 'bg-accent text-accent-ink')}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

function Page({ module }: { module: string }) {
  switch (module) {
    case 'factory':
      return (
        <Suspense fallback={<FactoryLoading />}>
          <FactoryPage />
        </Suspense>
      );
    case 'warehouse':
      return <Scroll><WarehousePage /></Scroll>;
    case 'production':
      return <Scroll><ProductionPage /></Scroll>;
    case 'quality':
      return <Scroll><QualityPage /></Scroll>;
    case 'maintenance':
      return <Scroll><MaintenancePage /></Scroll>;
    case 'procurement':
      return <Scroll><ProcurementPage /></Scroll>;
    case 'logistics':
      return <Scroll><LogisticsPage /></Scroll>;
    case 'documents':
      return <Scroll><DocumentsPage /></Scroll>;
    case 'analytics':
      return <Scroll><AnalyticsPage /></Scroll>;
    case 'missions':
      return <Scroll><MissionsPage /></Scroll>;
    default:
      return <Scroll><Dashboard /></Scroll>;
  }
}

function Scroll({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto pb-28">{children}</div>;
}

function FactoryLoading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="skeleton h-1.5 w-48" />
      <p className="text-sm text-ink-3">Loading 3D plant…</p>
    </div>
  );
}
