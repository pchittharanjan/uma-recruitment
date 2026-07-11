'use client';

import dynamic from 'next/dynamic';
import { use } from 'react';
import PageLoading from '@/components/page-loading';

const TeamInterviewScheduleEditor = dynamic(
  () =>
    import('@/components/team-interview-schedule-editor').then(
      (m) => m.TeamInterviewScheduleEditor,
    ),
  { loading: () => <PageLoading />, ssr: false },
);

export default function FinalRoundSchedulePage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);

  return (
    <TeamInterviewScheduleEditor
      apiPath={`/api/admin/teams/${teamId}/schedule/final-round`}
      title="Final Round Interview schedule"
      stage="final_round"
    />
  );
}
