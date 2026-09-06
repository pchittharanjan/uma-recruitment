'use client';

import { use } from 'react';
import { DeliberationsApplicantPage } from '@/components/deliberations-applicant-page';

export default function TeamDeliberationsApplicantPage({
  params,
}: {
  params: Promise<{ teamId: string; applicationId: string }>;
}) {
  const { teamId: teamIdRaw, applicationId: appIdRaw } = use(params);
  const teamId = Number.parseInt(teamIdRaw, 10);
  const applicationId = Number.parseInt(appIdRaw, 10);

  if (!Number.isFinite(teamId) || teamId < 1 || !Number.isFinite(applicationId) || applicationId < 1) {
    return (
      <p className="px-4 py-6 text-sm text-destructive">Invalid applicant link.</p>
    );
  }

  return (
    <DeliberationsApplicantPage
      teamId={teamId}
      applicationId={applicationId}
      audience="team"
      detailUrl={`/api/team/deliberations/${applicationId}?teamId=${teamId}`}
    />
  );
}
