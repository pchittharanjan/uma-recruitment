'use client';

import { WorkspaceChrome } from '@/components/workspace-chrome';
import { WorkspaceProvider } from '@/components/workspace-provider';
import { useWorkspaceEmbed } from '@/hooks/use-workspace-embed';
import type { WorkspaceArea } from '@/lib/workspace';

export function WorkspaceFrame({
  children,
  area,
}: {
  children: React.ReactNode;
  area: WorkspaceArea;
}) {
  const embed = useWorkspaceEmbed();
  if (embed) {
    return <div className="min-h-svh bg-background">{children}</div>;
  }

  return (
    <WorkspaceProvider area={area}>
      <WorkspaceChrome>{children}</WorkspaceChrome>
    </WorkspaceProvider>
  );
}
