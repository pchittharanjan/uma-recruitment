'use client';

import { use } from 'react';
import { DeliberationsTeamBoard } from '@/components/deliberations-team-board';
import { PageContainer, PageHeader } from '@/components/page-shell';

export default function TeamDeliberationsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId: teamIdRaw } = use(params);
  const teamId = Number.parseInt(teamIdRaw, 10);

  return (
    <PageContainer className="space-y-4">
      <PageHeader
        title="Deliberations"
        description="Your personal board — autosaved. The admin deliberations screen is the official source for final acceptances."
      />
      <DeliberationsTeamBoard
        teamId={teamId}
        boardApiBase={`/api/team/deliberations?teamId=${teamId}`}
        detailApiBase={`/api/team/deliberations`}
      />
    </PageContainer>
  );
}
