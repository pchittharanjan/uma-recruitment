'use client';

import { use } from 'react';
import { TeamAdvancementPanel } from '@/components/team-advancement-panel';

export default function TeamApplicationAdvancementPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);
  return <TeamAdvancementPanel teamId={teamId} fromStage="application" />;
}
