import { redirect } from 'next/navigation';
import { TeamInterviewsQueue } from '@/components/team-interviews-queue';
import { getSessionUser } from '@/lib/auth-session';
import { buildTeamInterviewData } from '@/lib/team-interviews-data';
import { runWithRequestCache } from '@/lib/request-cache';

export const dynamic = 'force-dynamic';

export default async function AdminTeamInterviewsPage({
  params,
}: {
  params: Promise<{ teamId: string; stage: string }>;
}) {
  const { teamId, stage } = await params;

  return runWithRequestCache(async () => {
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') redirect('/login');

    const result = await buildTeamInterviewData(user, Number.parseInt(teamId, 10), stage);

    if (!result.ok) {
      return (
        <TeamInterviewsQueue
          teamId={teamId}
          stage={stage}
          data={null}
          error={result.error}
          audience="admin"
        />
      );
    }

    return (
      <TeamInterviewsQueue
        teamId={teamId}
        stage={stage}
        data={result.data}
        audience="admin"
      />
    );
  });
}
