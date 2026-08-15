'use client';

import { TeamSidebar } from '@/components/team-sidebar';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { PhaseOpenedGate } from '@/components/phase-opened-gate';
import { PipelineClosedBanner } from '@/components/pipeline-closed-banner';
import { RecruitmentCompleteGate } from '@/components/recruitment-complete-gate';
import { TeamNavProvider } from '@/components/team-nav-provider';
import { WorkspaceFrame } from '@/components/workspace-frame';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { useWorkspaceEmbed } from '@/hooks/use-workspace-embed';
import { cn } from '@/lib/utils';

function TeamShellInner({
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
  const embed = useWorkspaceEmbed();

  if (embed) {
    return <div className="min-h-svh bg-background">{children}</div>;
  }

  return (
    <SidebarProvider
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
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <ImpersonationBanner />
        <SidebarTrigger
          className={cn(
            'fixed top-3.5 left-3.5 z-20 md:hidden',
            'size-8 border border-border/60 bg-background/90 shadow-sm backdrop-blur-sm',
          )}
        />
        <PipelineClosedBanner statusUrl="/api/team/nav" />
        <WorkspaceFrame area="team">{children}</WorkspaceFrame>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function TeamShell(props: {
  user: { name: string; email: string; role: string };
  teams: { id: number; name: string }[];
  isImpersonating?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TeamNavProvider>
      <PhaseOpenedGate userName={props.user.name} />
      <RecruitmentCompleteGate />
      <TeamShellInner {...props} />
    </TeamNavProvider>
  );
}
