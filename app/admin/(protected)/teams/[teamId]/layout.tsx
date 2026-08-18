import AppBreadcrumb from '@/components/app-breadcrumb';
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
    <div className="uma-page-root flex min-w-0 flex-1 flex-col">
      <div className="px-5 pt-4 sm:px-8 lg:px-10 xl:px-12 2xl:px-14">
        <AppBreadcrumb teamId={teamId} teamName={team?.name} />
      </div>
      {children}
    </div>
  );
}
