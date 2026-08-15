'use client';

import { AdminSidebar } from '@/components/admin-sidebar';
import { AdminPhaseProvider } from '@/components/admin-phase-provider';
import { PipelineClosedBanner } from '@/components/pipeline-closed-banner';
import { WorkspaceFrame } from '@/components/workspace-frame';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { useWorkspaceEmbed } from '@/hooks/use-workspace-embed';
import { cn } from '@/lib/utils';

function AdminShellInner({
  user,
  showApplicationsNav = false,
  children,
}: {
  user: { name: string; email: string; role: string };
  showApplicationsNav?: boolean;
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
      <AdminSidebar user={user} showApplicationsNav={showApplicationsNav} variant="inset" />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <SidebarTrigger
          className={cn(
            'fixed top-3.5 left-3.5 z-20 md:hidden',
            'size-8 border border-border/60 bg-background/90 shadow-sm backdrop-blur-sm',
          )}
        />
        <PipelineClosedBanner statusUrl="/api/admin/phase" />
        <WorkspaceFrame area="admin">{children}</WorkspaceFrame>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function AdminShell(props: {
  user: { name: string; email: string; role: string };
  showApplicationsNav?: boolean;
  children: React.ReactNode;
}) {
  return (
    <AdminPhaseProvider>
      <AdminShellInner {...props} />
    </AdminPhaseProvider>
  );
}
