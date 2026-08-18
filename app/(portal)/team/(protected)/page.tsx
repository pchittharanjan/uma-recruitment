'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardListIcon } from 'lucide-react';
import StageBadge from '@/components/stage-badge';
import PageLoading from '@/components/page-loading';
import { CenteredMessage } from '@/components/centered-message';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { useShellUser } from '@/components/shell-user-provider';
import { useTeamNav } from '@/components/team-nav-provider';
import type { RoundStatus } from '@/lib/db';
import { phaseLabel, teamLandingHref, teamOverviewHref } from '@/lib/stages';

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

export default function TeamHomePage() {
  const router = useRouter();
  const { teams } = useShellUser();
  const { nav, loading: navLoading } = useTeamNav();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (navLoading || !nav || teams.length !== 1) return;
    setRedirecting(true);
    const team = teams[0];
    const navTeam = nav.teams.find((t) => t.id === team.id);
    const href = navTeam?.round?.status
      ? teamLandingHref(team.id, navTeam.round.status)
      : teamOverviewHref(team.id);
    router.replace(href);
  }, [nav, navLoading, router, teams]);

  if (navLoading || redirecting || (teams.length === 1 && !nav)) {
    return <PageLoading />;
  }

  const status = nav?.status ?? 'application';
  const label = phaseLabel(status);

  if (teams.length === 0) {
    return (
      <CenteredMessage
        title="No team access yet"
        description="Ask an Admin to grant you access to a team, then refresh this page."
        ctaLabel="Coffee Chats"
        ctaHref="/coffee-chats"
      />
    );
  }

  return (
    <PageContainer>
      <PageSection>
        <PageHeader
          eyebrow="Team portal"
          title="Your Teams"
          description={phaseOneLiner(status)}
          actions={<StageBadge label={label} color="blue" />}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
            const navTeam = nav?.teams.find((t) => t.id === team.id);
            const href = navTeam?.round?.status
              ? teamLandingHref(team.id, navTeam.round.status)
              : teamOverviewHref(team.id);
            return <TeamCard key={team.id} team={team} href={href} />;
          })}
        </div>
      </PageSection>
    </PageContainer>
  );
}
