'use client';

import { usePathname } from 'next/navigation';
import { TeamSidebar } from '@/components/team-sidebar';
import AppBreadcrumb from '@/components/app-breadcrumb';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { PhaseOpenedGate } from '@/components/phase-opened-gate';
import { PipelineClosedBanner } from '@/components/pipeline-closed-banner';
import { RecruitmentCompleteGate } from '@/components/recruitment-complete-gate';
import { TeamNavProvider } from '@/components/team-nav-provider';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { extractTeamIdFromPath, shouldShowBreadcrumbs } from '@/lib/breadcrumbs';
import { cn } from '@/lib/utils';

export function TeamShell({
  user,
  teams,
  isImpersonating = false,
  children,
}: {
  user: { name: string; email: string; role: string };
  teams: { id: number; name: string }[];
  isImpersonating?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const teamIdFromPath = extractTeamIdFromPath(pathname);
  const currentTeam = teamIdFromPath
    ? teams.find((team) => String(team.id) === teamIdFromPath)
    : undefined;

  return (
    <TeamNavProvider>
      <SidebarProvider
        style={
          {
            '--sidebar-width': 'calc(var(--spacing) * 72)',
            '--header-height': 'calc(var(--spacing) * 12)',
          } as React.CSSProperties
        }
      >
        <TeamSidebar
          user={user}
          teams={teams}
          isImpersonating={isImpersonating}
          variant="inset"
        />
        <SidebarInset className="min-w-0 overflow-x-hidden">
          <ImpersonationBanner />
          <PhaseOpenedGate />
          <RecruitmentCompleteGate />
          <SidebarTrigger
            className={cn(
              'fixed top-3.5 left-3.5 z-20 md:hidden',
              'size-8 border border-border/60 bg-background/90 shadow-sm backdrop-blur-sm',
            )}
          />
          <PipelineClosedBanner statusUrl="/api/team/nav" />
          {shouldShowBreadcrumbs(pathname) && (
            <div className="border-b border-border/60 px-5 py-2 sm:px-8">
              <AppBreadcrumb teamId={teamIdFromPath ?? undefined} teamName={currentTeam?.name} />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TeamNavProvider>
  );
}
