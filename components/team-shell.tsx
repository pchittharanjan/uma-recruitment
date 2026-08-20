'use client';

import { TeamSidebar } from '@/components/team-sidebar';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { PhaseOpenedGate } from '@/components/phase-opened-gate';
import { PipelineClosedBanner } from '@/components/pipeline-closed-banner';
import { RecruitmentCompleteGate } from '@/components/recruitment-complete-gate';
import { ShellUserProvider } from '@/components/shell-user-provider';
import { TeamNavProvider } from '@/components/team-nav-provider';
import { WorkspaceFrame } from '@/components/workspace-frame';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { useWorkspaceEmbed } from '@/hooks/use-workspace-embed';
import { cn } from '@/lib/utils';

function TeamShellInner({
  user,
  teams,
  isImpersonating = false,
  defaultSidebarOpen,
  defaultSidebarWidth,
  children,
}: {
  user: { id?: number; name: string; email: string; role: string };
  teams: { id: number; name: string }[];
  isImpersonating?: boolean;
  defaultSidebarOpen?: boolean;
  defaultSidebarWidth?: number;
  children: React.ReactNode;
}) {
  const embed = useWorkspaceEmbed();

  if (embed) {
    return <div className="min-h-svh bg-background">{children}</div>;
  }

  return (
    <SidebarProvider
      defaultOpen={defaultSidebarOpen}
      defaultWidth={defaultSidebarWidth}
      style={
        {
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
      <SidebarInset className="uma-app-canvas min-h-0 min-w-0 overflow-hidden bg-transparent md:peer-data-[variant=inset]:shadow-none">
        <ImpersonationBanner />
        <SidebarTrigger
          data-interview-chrome=""
          className={cn(
            'fixed top-3.5 left-3.5 z-20 md:hidden',
            'h-9 rounded-full border border-border/70 bg-card/92 px-3 text-sm font-medium text-foreground shadow-lg backdrop-blur-xl',
          )}
        >
          Menu
        </SidebarTrigger>
        <PipelineClosedBanner statusUrl="/api/team/nav" />
        <WorkspaceFrame area="team" className="min-h-0 flex-1">
          {children}
        </WorkspaceFrame>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function TeamShell(props: {
  user: { id?: number; name: string; email: string; role: string };
  teams: { id: number; name: string }[];
  isImpersonating?: boolean;
  impersonationAdmin?: { name: string; email: string };
  defaultSidebarOpen?: boolean;
  defaultSidebarWidth?: number;
  initialNav?: import('@/lib/team-nav-types').TeamNavSnapshot | null;
  children: React.ReactNode;
}) {
  const impersonation =
    props.isImpersonating && props.impersonationAdmin
      ? { active: true as const, admin: props.impersonationAdmin }
      : null;

  return (
    <ShellUserProvider user={props.user} teams={props.teams} impersonation={impersonation}>
      <TeamNavProvider initialNav={props.initialNav}>
        <PhaseOpenedGate userName={props.user.name} />
        <RecruitmentCompleteGate />
        <TeamShellInner {...props} />
      </TeamNavProvider>
    </ShellUserProvider>
  );
}
