import Link from 'next/link';
import { redirect } from 'next/navigation';
import StatusBanner from '@/components/status-banner';
import {
  TeamPersonalDashboard,
  type TeamOverviewData,
} from '@/components/team-personal-dashboard';
import { PageContainer } from '@/components/page-shell';
import { buttonVariants } from '@/components/ui/button';
import { getUserById } from '@/lib/db';
import { runWithRequestCache } from '@/lib/request-cache';
import { buildTeamOverview } from '@/lib/team-overview';
import { getTeamPortalContext } from '@/lib/team-portal-context';

export const dynamic = 'force-dynamic';

export default async function TeamHomePage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;

  return runWithRequestCache(async () => {
    const ctx = await getTeamPortalContext();
    if (!ctx) redirect('/login');

    const user = await getUserById(ctx.portalUser.id);
    if (!user) redirect('/login');

    const hasMultipleTeams = ctx.teams.length > 1;
    const result = await buildTeamOverview(user, Number.parseInt(teamId, 10));

    if (!result.ok) {
      return (
        <PageContainer className="space-y-4">
          <StatusBanner message={result.error} type="error" />
          {hasMultipleTeams && (
            <Link href="/team" className={buttonVariants({ variant: 'secondary' })}>
              ← Teams
            </Link>
          )}
        </PageContainer>
      );
    }

    return (
      <TeamPersonalDashboard
        data={result.data as unknown as TeamOverviewData}
        teamId={teamId}
        hasMultipleTeams={hasMultipleTeams}
      />
    );
  });
}
