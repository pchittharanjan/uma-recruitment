import { redirect } from 'next/navigation';
import { TeamGradingQueue } from '@/components/team-grading-queue';
import { buildTeamGradingData } from '@/lib/team-grading-data';
import { runWithRequestCache } from '@/lib/request-cache';
import { getTeamPortalUser } from '@/lib/team-portal-context';

export const dynamic = 'force-dynamic';

export default async function TeamApplicationGradingPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  return runWithRequestCache(async () => {
    const user = await getTeamPortalUser({ roles: ['exec', 'ad_hoc_exec'] });
    if (!user) redirect('/login');

    const result = await buildTeamGradingData(user, Number.parseInt(teamId, 10));

    if (!result.ok) {
      return (
        <TeamGradingQueue
          teamId={teamId}
          data={null}
          accessError={result.error}
        />
      );
    }

    return <TeamGradingQueue teamId={teamId} data={result.data} />;
  });
}
