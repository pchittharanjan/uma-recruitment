import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardListIcon } from 'lucide-react';
import StageBadge from '@/components/stage-badge';
import { CenteredMessage } from '@/components/centered-message';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import type { RoundStatus } from '@/lib/db';
import { buildTeamNavSnapshot } from '@/lib/team-nav';
import { runWithRequestCache } from '@/lib/request-cache';
import { getTeamPortalContext, getTeamPortalUser } from '@/lib/team-portal-context';
import { phaseLabel, teamOverviewHref } from '@/lib/stages';

export const dynamic = 'force-dynamic';

function phaseOneLiner(status: RoundStatus): string | undefined {
  switch (status) {
    case 'closed':
      return 'This recruitment cycle is closed.';
    default:
      return undefined;
  }
}

function TeamCard({
  team,
  href,
}: {
  team: { id: number; name: string };
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-colors hover:bg-primary/[0.05]">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/80">
            <ClipboardListIcon className="size-4 text-muted-foreground" />
          </div>
          <CardTitle className="text-base">{team.name}</CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}

export default async function TeamHomePage() {
  return runWithRequestCache(async () => {
    const ctx = await getTeamPortalContext();
    if (!ctx) redirect('/login');

    const user = await getTeamPortalUser({ roles: ['exec', 'ad_hoc_exec'] });
    if (!user) redirect('/login');

    const nav = await buildTeamNavSnapshot(user);
    const { teams } = ctx;

    if (teams.length === 0) {
      return (
        <CenteredMessage
          title="No team access yet"
          description="Ask an Admin to grant you access to a team, then refresh this page."
        />
      );
    }

    if (teams.length === 1) {
      const team = teams[0];
      redirect(teamOverviewHref(team.id));
    }

    const status = nav.status ?? 'application';
    const label = phaseLabel(status);

    return (
      <PageContainer>
        <PageSection>
          <PageHeader
            eyebrow="Team portal"
            title="Your Teams"
            description={phaseOneLiner(status)}
            actions={<StageBadge label={label} color="blue" size="compact" />}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-tour="team-picker">
            {teams.map((team) => {
              const href = teamOverviewHref(team.id);
              return <TeamCard key={team.id} team={team} href={href} />;
            })}
          </div>
        </PageSection>
      </PageContainer>
    );
  });
}
