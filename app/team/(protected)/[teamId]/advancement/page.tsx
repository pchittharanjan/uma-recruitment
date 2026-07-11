'use client';

import dynamic from 'next/dynamic';
import { use } from 'react';
import PageLoading from '@/components/page-loading';

const TeamAdvancementPanel = dynamic(
  () =>
    import('@/components/team-advancement-panel').then((m) => m.TeamAdvancementPanel),
  { loading: () => <PageLoading />, ssr: false },
);

export default function TeamApplicationAdvancementPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);
  return <TeamAdvancementPanel teamId={teamId} fromStage="application" />;
}
