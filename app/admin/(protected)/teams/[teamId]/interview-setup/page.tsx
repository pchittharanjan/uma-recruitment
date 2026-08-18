'use client';

import { use } from 'react';
import { TeamInterviewGuideSetup } from '@/components/team-interview-guide-setup';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';

export default function TeamInterviewSetupPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);

  return (
    <PageContainer size="wide" className="space-y-8">
      <PageHeader title="Interview Setup" />
      <PageSection>
        <TeamInterviewGuideSetup teamId={teamId} />
      </PageSection>
    </PageContainer>
  );
}
