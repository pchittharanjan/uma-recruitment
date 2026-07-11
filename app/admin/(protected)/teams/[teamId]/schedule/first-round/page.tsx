'use client';

import { use } from 'react';
import { TeamInterviewScheduleEditor } from '@/components/team-interview-schedule-editor';

export default function FirstRoundSchedulePage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);

  return (
    <TeamInterviewScheduleEditor
      apiPath={`/api/admin/teams/${teamId}/schedule/first-round`}
      title="First Round Interview schedule"
      stage="first_round"
    />
  );
}
