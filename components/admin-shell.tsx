'use client';

import { AdminSidebar } from '@/components/admin-sidebar';
import { AdminPhaseProvider } from '@/components/admin-phase-provider';
import { PipelineClosedBanner } from '@/components/pipeline-closed-banner';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

export function AdminShell({
  user,
  showApplicationsNav = false,
  children,
}: {
  user: { name: string; email: string; role: string };
  showApplicationsNav?: boolean;
  children: React.ReactNode;
}) {
  return (
    <AdminPhaseProvider>
      <SidebarProvider
        style={
          {
            '--sidebar-width': 'calc(var(--spacing) * 72)',
            '--header-height': 'calc(var(--spacing) * 12)',
          } as React.CSSProperties
        }
      >
        <AdminSidebar user={user} showApplicationsNav={showApplicationsNav} variant="inset" />
        <SidebarInset className="min-w-0 overflow-x-hidden">
          <SidebarTrigger
            className={cn(
              'fixed top-3.5 left-3.5 z-20 md:hidden',
              'size-8 border border-border/60 bg-background/90 shadow-sm backdrop-blur-sm',
            )}
          />
          <PipelineClosedBanner statusUrl="/api/admin/phase" />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AdminPhaseProvider>
  );
}
