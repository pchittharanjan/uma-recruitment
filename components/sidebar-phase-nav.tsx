'use client';

import { type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useIsClient, useBrowserSearch } from '@/hooks/use-workspace-embed';
import {
  CheckIcon,
  CoffeeIcon,
  FileTextIcon,
  LayoutGridIcon,
  MicIcon,
  UserCheckIcon,
} from 'lucide-react';
import { useAdminPhase } from '@/components/admin-phase-provider';
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
import {
  adminPhaseHref,
  isAdminDashboardPhase,
  isAdminPhaseNavActive,
  parseDashboardViewPhase,
  PIPELINE_PHASES,
  statusIndex,
} from '@/lib/stages';

const PHASE_ICONS: Partial<Record<RoundStatus, ComponentType<{ className?: string }>>> = {
  pre_application: CoffeeIcon,
  application: FileTextIcon,
  first_round: MicIcon,
  final_round: UserCheckIcon,
  deliberations: LayoutGridIcon,
};

export function SidebarPhaseNav() {
  const pathname = usePathname();
  const search = useBrowserSearch();
  const { phase } = useAdminPhase();
  const mounted = useIsClient();

  if (!mounted) return null;
  if (!phase?.status) return null;

  const pipelineStatus = phase.status;
  const currentIdx = statusIndex(pipelineStatus);
  const visiblePhases = PIPELINE_PHASES.filter((p) => p.status !== 'closed');
  const viewParam = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  ).get('view');
  const dashboardViewPhase =
    pathname === '/admin/dashboard'
      ? parseDashboardViewPhase(viewParam, pipelineStatus)
      : null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Phases</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {visiblePhases.map((phaseItem) => {
            const phaseIdx = statusIndex(phaseItem.status);
            const isPipelineCurrent = phaseItem.status === pipelineStatus;
            const isPast = phaseIdx < currentIdx;
            const isFuture = phaseIdx > currentIdx;
            const isNavActive =
              pathname === '/admin/dashboard' && isAdminDashboardPhase(phaseItem.status)
                ? dashboardViewPhase === phaseItem.status
                : isAdminPhaseNavActive(pathname, phaseItem.status);
            const Icon = PHASE_ICONS[phaseItem.status];
            const tooltip = isFuture
              ? `${phaseItem.label} — Preview`
              : isPast && !isPipelineCurrent
                ? `${phaseItem.label} — Completed`
                : phaseItem.label;

            return (
              <SidebarMenuItem key={phaseItem.status}>
                <SidebarMenuButton
                  isActive={isNavActive}
                  tooltip={tooltip}
                  className={cn(
                    isPast && !isPipelineCurrent && !isNavActive && 'text-muted-foreground',
                    isFuture && !isNavActive && 'text-muted-foreground/80',
                  )}
                  render={<Link href={adminPhaseHref(phaseItem.status)} />}
                >
                  {isPast && !isPipelineCurrent && !isNavActive ? (
                    <CheckIcon className="size-4 shrink-0 text-green-600" />
                  ) : Icon ? (
                    <Icon
                      className={cn(
                        'size-4 shrink-0',
                        isPipelineCurrent && 'text-primary',
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
                      isPipelineCurrent && 'font-medium text-primary',
                      isFuture && !isNavActive && 'text-muted-foreground/80',
                    )}
                  >
                    {phaseItem.label}
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
