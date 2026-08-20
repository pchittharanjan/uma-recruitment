import { redirect } from 'next/navigation';
import { TeamInterviewsQueue } from '@/components/team-interviews-queue';
import { buildTeamInterviewData } from '@/lib/team-interviews-data';
import { runWithRequestCache } from '@/lib/request-cache';
import { getTeamPortalUser } from '@/lib/team-portal-context';

export const dynamic = 'force-dynamic';

export default async function TeamInterviewsPage({
  params,
}: {
  params: Promise<{ teamId: string; stage: string }>;
}) {
  const { teamId, stage } = await params;

  return runWithRequestCache(async () => {
    const user = await getTeamPortalUser({ roles: ['exec', 'ad_hoc_exec'] });
    if (!user) redirect('/login');

    const result = await buildTeamInterviewData(user, Number.parseInt(teamId, 10), stage);

    if (!result.ok) {
      return (
        <TeamInterviewsQueue
          teamId={teamId}
          stage={stage}
          data={null}
          error={result.error}
        />
      );
    }

    return <TeamInterviewsQueue teamId={teamId} stage={stage} data={result.data} />;
  });
}
