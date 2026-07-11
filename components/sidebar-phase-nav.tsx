'use client';

import { useCallback, useEffect, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  CheckIcon,
  CoffeeIcon,
  FileTextIcon,
  LayoutGridIcon,
  MicIcon,
  UserCheckIcon,
} from 'lucide-react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import type { RoundStatus } from '@/lib/db';
import { PIPELINE_PHASE_CHANGED_EVENT } from '@/lib/pipeline-events';
import {
  adminPhaseHref,
  isAdminDashboardPhase,
  isAdminPhaseNavActive,
  parseDashboardViewPhase,
  PIPELINE_PHASES,
  statusIndex,
  type UnlockableStage,
} from '@/lib/stages';

const PHASE_ICONS: Partial<Record<RoundStatus, ComponentType<{ className?: string }>>> = {
  pre_application: CoffeeIcon,
  application: FileTextIcon,
  first_round: MicIcon,
  final_round: UserCheckIcon,
  deliberations: LayoutGridIcon,
};

interface PhaseNavState {
  status: RoundStatus | null;
  unlockedStages: UnlockableStage[];
}

export function SidebarPhaseNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<PhaseNavState | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/phase');
      const json = await res.json();
      if (!res.ok) return;
      setState({
        status: json.status ?? null,
        unlockedStages: json.unlockedStages ?? [],
      });
    } catch {
      // Sidebar stays usable without phase data.
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    load();
  }, [load, pathname]);

  useEffect(() => {
    const onChange = () => load();
    window.addEventListener(PIPELINE_PHASE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PIPELINE_PHASE_CHANGED_EVENT, onChange);
  }, [load]);

  if (!state?.status) return null;

  const currentIdx = statusIndex(state.status);
  const visiblePhases = PIPELINE_PHASES.filter((p) => p.status !== 'closed');
  const dashboardViewPhase =
    pathname === '/admin/dashboard'
      ? parseDashboardViewPhase(searchParams.get('view'), state.status)
      : null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Phases</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {visiblePhases.map((phase) => {
            const phaseIdx = statusIndex(phase.status);
            const isPipelineCurrent = phase.status === state.status;
            const isPast = phaseIdx < currentIdx;
            const isFuture = phaseIdx > currentIdx;
            const isNavActive =
              mounted &&
              (pathname === '/admin/dashboard' && isAdminDashboardPhase(phase.status)
                ? dashboardViewPhase === phase.status
                : isAdminPhaseNavActive(pathname, phase.status));
            const Icon = PHASE_ICONS[phase.status];
            const tooltip = isFuture
              ? `${phase.label} — Preview`
              : isPast && !isPipelineCurrent
                ? `${phase.label} — Completed`
                : phase.label;

            return (
              <SidebarMenuItem key={phase.status}>
                <SidebarMenuButton
                  isActive={isNavActive}
                  tooltip={mounted ? tooltip : undefined}
                  className={cn(
                    isPast && !isPipelineCurrent && !isNavActive && 'text-muted-foreground',
                    isFuture && !isNavActive && 'text-muted-foreground/80',
                  )}
                  render={<Link href={adminPhaseHref(phase.status)} />}
                >
                  {isPast && !isPipelineCurrent && !isNavActive ? (
                    <CheckIcon className="size-4 shrink-0 text-green-600" />
                  ) : Icon ? (
                    <Icon
                      className={cn(
                        'size-4 shrink-0',
                        (isPipelineCurrent || isNavActive) && 'text-primary',
                      )}
                    />
                  ) : (
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        isPipelineCurrent ? 'bg-primary' : 'bg-muted-foreground/40',
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      (isPipelineCurrent || isNavActive) && 'font-medium text-primary',
                      isFuture && !isNavActive && 'text-muted-foreground/80',
                    )}
                  >
                    {phase.label}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
