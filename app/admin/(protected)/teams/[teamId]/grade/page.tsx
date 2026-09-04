import { redirect } from 'next/navigation';
import { TeamGradingQueue } from '@/components/team-grading-queue';
import { getTeamById } from '@/lib/db';
import { getSessionUser } from '@/lib/auth-session';
import { buildTeamGradingData } from '@/lib/team-grading-data';
import { runWithRequestCache } from '@/lib/request-cache';

export const dynamic = 'force-dynamic';

export default async function AdminTeamGradingPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  return runWithRequestCache(async () => {
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') redirect('/login');

    const teamIdNum = Number.parseInt(teamId, 10);
    const [result, team] = await Promise.all([
      buildTeamGradingData(user, teamIdNum),
      Number.isFinite(teamIdNum) ? getTeamById(teamIdNum) : Promise.resolve(null),
    ]);

    if (!result.ok) {
      return (
        <TeamGradingQueue
          teamId={teamId}
          data={null}
          accessError={result.error}
          audience="admin"
          teamName={team?.name}
        />
      );
    }

    return (
      <TeamGradingQueue
        teamId={teamId}
        data={result.data}
        audience="admin"
        teamName={team?.name}
      />
    );
  });
}
