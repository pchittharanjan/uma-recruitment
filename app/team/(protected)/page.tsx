'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardListIcon } from 'lucide-react';
import StageBadge from '@/components/stage-badge';
import PageLoading from '@/components/page-loading';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RoundStatus } from '@/lib/db';
import { phaseLabel, teamLandingHref, teamOverviewHref } from '@/lib/stages';

interface MeResponse {
  user: { id: number; email: string; name: string; role: string };
  teams: { id: number; name: string }[];
}

interface NavTeam {
  id: number;
  round: { status: RoundStatus } | null;
}

function phaseOneLiner(status: RoundStatus): string {
  switch (status) {
    case 'pre_application':
      return 'Log Coffee Chats and Prepare for Applications.';
    case 'application':
      return 'Grade applications assigned to you.';
    case 'first_round':
    case 'final_round':
      return 'Complete interview scoring for your slots.';
    case 'deliberations':
      return 'Explore placements — only admin can save & advance.';
    case 'closed':
      return 'This recruitment cycle is closed.';
    default:
      return 'Pick a team to get started.';
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
      <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/30">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <ClipboardListIcon className="size-4 text-muted-foreground" />
          </div>
          <CardTitle className="text-base">{team.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Open current phase</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function TeamHomePage() {
  const router = useRouter();
  const [data, setData] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<RoundStatus>('application');
  const [navTeams, setNavTeams] = useState<NavTeam[]>([]);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) {
          router.push('/login');
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (!json) return;
        setData(json);
        if (json.teams?.length === 1) {
          setRedirecting(true);
          fetch('/api/team/nav')
            .then((r) => (r.ok ? r.json() : null))
            .then((nav) => {
              const team = json.teams[0];
              const navTeam = (nav?.teams as NavTeam[] | undefined)?.find((t) => t.id === team.id);
              const href = navTeam?.round?.status
                ? teamLandingHref(team.id, navTeam.round.status)
                : teamOverviewHref(team.id);
              router.replace(href);
            })
            .catch(() => {
              router.replace(teamOverviewHref(json.teams[0].id));
            });
        }
      });

    fetch('/api/team/nav')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.status) setStatus(json.status);
        if (json?.teams) setNavTeams(json.teams);
      })
      .catch(() => {});
  }, [router]);

  if (!data || redirecting) {
    return <PageLoading />;
  }

  const label = phaseLabel(status);

  if (data.teams.length === 0) {
    return (
      <PageContainer className="space-y-8">
        <PageHeader
          title="Recruitment Hub"
          description="You don't have team access yet. Ask an Admin to grant access."
          actions={<StageBadge label={label} color="blue" />}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        title="Your teams"
        description={phaseOneLiner(status)}
        actions={<StageBadge label={label} color="blue" />}
      />

      <PageSection>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.teams.map((team) => {
            const navTeam = navTeams.find((t) => t.id === team.id);
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
