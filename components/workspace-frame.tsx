'use client';

import { NavigationProgress } from '@/components/navigation-progress';
import { WorkspaceChrome } from '@/components/workspace-chrome';
import { WorkspaceProvider } from '@/components/workspace-provider';
import { useWorkspaceEmbed } from '@/hooks/use-workspace-embed';
import type { WorkspaceArea } from '@/lib/workspace';
import { cn } from '@/lib/utils';

export function WorkspaceFrame({
  children,
  area,
  className,
}: {
  children: React.ReactNode;
  area: WorkspaceArea;
  className?: string;
}) {
  const embed = useWorkspaceEmbed();
  if (embed) {
    return <div className="min-h-svh bg-background">{children}</div>;
  }

  return (
    <WorkspaceProvider area={area}>
      <NavigationProgress />
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col has-[[data-interview-workspace]]:h-0 has-[[data-interview-workspace]]:overflow-hidden',
          className,
        )}
      >
        <WorkspaceChrome>{children}</WorkspaceChrome>
      </div>
    </WorkspaceProvider>
  );
}
