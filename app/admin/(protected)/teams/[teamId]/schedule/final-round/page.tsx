'use client';

import { use } from 'react';
import { TeamInterviewScheduleEditor } from '@/components/team-interview-schedule-editor';

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
