'use client';

import { AdminSidebar } from '@/components/admin-sidebar';
import { AdminPhaseProvider } from '@/components/admin-phase-provider';
import { PipelineClosedBanner } from '@/components/pipeline-closed-banner';
import { ShellUserProvider } from '@/components/shell-user-provider';
import { WorkspaceFrame } from '@/components/workspace-frame';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { useWorkspaceEmbed } from '@/hooks/use-workspace-embed';
import { cn } from '@/lib/utils';

function AdminShellInner({
  user,
  showApplicationsNav = false,
  defaultSidebarOpen,
  defaultSidebarWidth,
  children,
}: {
  user: { id?: number; name: string; email: string; role: string };
  showApplicationsNav?: boolean;
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
      <AdminSidebar user={user} showApplicationsNav={showApplicationsNav} variant="inset" />
      <SidebarInset className="uma-app-canvas min-h-0 min-w-0 overflow-hidden bg-transparent md:peer-data-[variant=inset]:shadow-none">
        <SidebarTrigger
          className={cn(
            'fixed top-3.5 left-3.5 z-20 md:hidden',
            'size-8 bg-card/90 shadow-sm backdrop-blur-md',
          )}
        />
        <PipelineClosedBanner statusUrl="/api/admin/phase" />
        <WorkspaceFrame area="admin">{children}</WorkspaceFrame>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function AdminShell(props: {
  user: { id?: number; name: string; email: string; role: string };
  showApplicationsNav?: boolean;
  defaultSidebarOpen?: boolean;
  defaultSidebarWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <ShellUserProvider user={props.user} teams={[]}>
      <AdminPhaseProvider>
        <AdminShellInner {...props} />
      </AdminPhaseProvider>
    </ShellUserProvider>
  );
}
