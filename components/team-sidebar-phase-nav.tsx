'use client';

import { type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTeamNav, type TeamNavTeam } from '@/components/team-nav-provider';
import { useIsClient } from '@/hooks/use-workspace-embed';
import {
  CheckIcon,
  CoffeeIcon,
  FileTextIcon,
  LayoutGridIcon,
  LockIcon,
  MicIcon,
  UserCheckIcon,
  ArrowUpCircleIcon,
} from 'lucide-react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { RoundStatus } from '@/lib/db';
import {
  isTeamPhaseNavActive,
  PIPELINE_PHASES,
  statusIndex,
  teamPhaseHref,
} from '@/lib/stages';

const PHASE_ICONS: Partial<Record<RoundStatus, ComponentType<{ className?: string }>>> = {
  pre_application: CoffeeIcon,
  application: FileTextIcon,
  first_round: MicIcon,
  final_round: UserCheckIcon,
  deliberations: LayoutGridIcon,
};

function phaseAccessible(
  phase: RoundStatus,
  team: TeamNavTeam,
  globalStatus: RoundStatus | null,
): boolean {
  if (!globalStatus || !team.round) return false;
  const teamStatus = team.round.status;
  const unlockKey = PIPELINE_PHASES.find((p) => p.status === phase)?.unlockKey;

  // Closed archive: any team access unlocks every prior phase for browsing.
  if (globalStatus === 'closed' || teamStatus === 'closed') {
    if (team.grantedStages === 'all') return true;
    if (team.grantedStages.length > 0) return true;
    return false;
  }

  if (!isRoundAtOrPast(teamStatus, phase)) return false;
  if (unlockKey && !team.unlockedStages.includes(unlockKey)) return false;
  if (team.grantedStages === 'all') return true;
  if (!unlockKey) return phase === 'pre_application';
  return team.grantedStages.includes(unlockKey);
}

function isRoundAtOrPast(current: RoundStatus, target: RoundStatus): boolean {
  return statusIndex(current) >= statusIndex(target);
}

function extractTeamId(pathname: string): number | null {
  const match = pathname.match(/^\/team\/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function DisabledPhaseItem({
  label,
  icon: Icon,
  reason,
}: {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  reason: string;
}) {
  return (
    <SidebarMenuItem>
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton
              className="cursor-not-allowed text-muted-foreground/50 opacity-60"
              disabled
            >
              {Icon ? <Icon className="size-4 shrink-0" /> : <LockIcon className="size-4 shrink-0" />}
              <span>{label}</span>
            </SidebarMenuButton>
          }
        />
        <TooltipContent side="right">{reason}</TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  );
}

export function TeamSidebarPhaseNav({ teams }: { teams: { id: number; name: string }[] }) {
  const pathname = usePathname();
  const { nav } = useTeamNav();
  const mounted = useIsClient();

  // Server + first client paint both return null so we never hydrate a
  // missing SidebarGroup into a present one (nav loads after mount).
  if (!mounted) return null;

  const navTeams = nav?.teams ?? [];
  const globalStatus = nav?.status ?? null;
  const finalSelectionComplete = Boolean(nav?.finalSelectionComplete);
  const isExec = Boolean(nav?.isExec);

  const pathTeamId = extractTeamId(pathname);
  const activeTeam =
    navTeams.find((t) => t.id === pathTeamId) ?? navTeams.find((t) => t.id === teams[0]?.id) ?? null;

  if (!globalStatus || !activeTeam?.round) return null;

  const teamStatus = activeTeam.round.status;
  const currentIdx = statusIndex(teamStatus);
  const pipelineClosed = globalStatus === 'closed';
  const visiblePhases = PIPELINE_PHASES.filter((p) => p.status !== 'closed');
  const finalActive = pathname.startsWith('/team/final-selection');

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{pipelineClosed ? 'Phases (view only)' : 'Phases'}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {visiblePhases.map((phase) => {
            const phaseIdx = statusIndex(phase.status);
            const isPipelineCurrent = phase.status === teamStatus;
            const isPast = phaseIdx < currentIdx;
            const isFuture = phaseIdx > currentIdx;
            const isNavActive = isTeamPhaseNavActive(pathname, phase.status, {
              teamCurrentStatus: teamStatus,
            });
            const Icon = PHASE_ICONS[phase.status];
            const href = teamPhaseHref(activeTeam.id, phase.status);
            const accessible = phaseAccessible(phase.status, activeTeam, globalStatus);
            const applicationPast =
              phase.status === 'application' &&
              statusIndex(teamStatus) > statusIndex('application');
            const advanceHref = `/team/${activeTeam.id}/advancement`;
            const advanceActive = pathname === advanceHref || pathname === `${advanceHref}/`;
            const advancePast = applicationPast && !advanceActive;

            const firstRoundPast =
              phase.status === 'first_round' &&
              statusIndex(teamStatus) > statusIndex('first_round');
            const firstRoundAdvanceHref = `/team/${activeTeam.id}/advancement/first-round`;
            const firstRoundAdvanceActive = pathname.startsWith(firstRoundAdvanceHref);
            const firstRoundAdvancePast = firstRoundPast && !firstRoundAdvanceActive;

            if (!accessible || !href) {
              const reason = isFuture
                ? `${phase.label} — Not Open Yet`
                : `${phase.label} — Not Available for Your Role`;
              return (
                <DisabledPhaseItem
                  key={phase.status}
                  label={phase.label}
                  icon={Icon}
                  reason={reason}
                />
              );
            }

            return (
              <SidebarMenuItem key={phase.status}>
                <SidebarMenuButton
                  isActive={isNavActive && !advanceActive && !firstRoundAdvanceActive}
                  tooltip={phase.label}
                  className={cn(
                    isPast && !isPipelineCurrent && !isNavActive && 'text-muted-foreground',
                  )}
                  render={<Link href={href} />}
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
                  ) : null}
                  <span
                    className={cn(
                      isPipelineCurrent && 'font-medium text-primary',
                    )}
                  >
                    {phase.label}
                  </span>
                </SidebarMenuButton>
                {phase.status === 'application' && isExec && (
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        size="sm"
                        isActive={advanceActive}
                        className={cn(
                          advancePast &&
                            'text-muted-foreground hover:text-muted-foreground [&>svg]:text-muted-foreground hover:[&>svg]:text-muted-foreground',
                        )}
                        render={<Link href={advanceHref} />}
                      >
                        <ArrowUpCircleIcon
                          className={cn(advancePast && 'text-muted-foreground')}
                        />
                        <span className={cn(advancePast && 'text-muted-foreground')}>
                          Advance to First Round Interview
                        </span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                )}
                {phase.status === 'first_round' && isExec && (
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        size="sm"
                        isActive={firstRoundAdvanceActive}
                        className={cn(
                          firstRoundAdvancePast &&
                            'text-muted-foreground hover:text-muted-foreground [&>svg]:text-muted-foreground hover:[&>svg]:text-muted-foreground',
                        )}
                        render={<Link href={firstRoundAdvanceHref} />}
                      >
                        <ArrowUpCircleIcon
                          className={cn(firstRoundAdvancePast && 'text-muted-foreground')}
                        />
                        <span className={cn(firstRoundAdvancePast && 'text-muted-foreground')}>
                          Advance to Final Round Interview
                        </span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            );
          })}
          {finalSelectionComplete || pipelineClosed ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={finalActive}
                tooltip="Final selection"
                render={<Link href="/team/final-selection" />}
              >
                <CheckIcon className="size-4 shrink-0 text-green-600" />
                <span>Final selection</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
