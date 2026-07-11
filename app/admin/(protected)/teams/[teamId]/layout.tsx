import AppBreadcrumb from '@/components/app-breadcrumb';
import { getTeamById, initDb } from '@/lib/db';
import { notFound } from 'next/navigation';

export default async function AdminTeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  await initDb();
  const team = await getTeamById(Number.parseInt(teamId, 10));
  if (!team) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-4 pt-4 lg:px-6">
        <AppBreadcrumb teamId={teamId} teamName={team.name} />
      </div>
      {children}
    </div>
  );
}
