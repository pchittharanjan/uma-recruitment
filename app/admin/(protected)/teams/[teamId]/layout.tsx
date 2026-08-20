import AppBreadcrumb from '@/components/app-breadcrumb';
import { pagePaddingX } from '@/components/page-shell';
import { cn } from '@/lib/utils';
import { getTeamById } from '@/lib/db';

export default async function AdminTeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const team = Number.isFinite(Number(teamId))
    ? await getTeamById(Number.parseInt(teamId, 10))
    : null;

  return (
    <div className="uma-page-root flex min-h-0 min-w-0 flex-col overflow-auto has-[[data-interview-workspace]]:h-0 has-[[data-interview-workspace]]:flex-1 has-[[data-interview-workspace]]:overflow-hidden">
      <div data-interview-page-chrome="" className={cn(pagePaddingX, 'shrink-0 pt-4')}>
        <AppBreadcrumb teamId={teamId} teamName={team?.name} />
      </div>
      {children}
    </div>
  );
}
