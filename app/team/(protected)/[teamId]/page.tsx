'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingButton from '@/components/loading-button';
import PageLoading from '@/components/page-loading';
import StatusBanner from '@/components/status-banner';
import {
  TeamPersonalDashboard,
  type TeamOverviewData,
} from '@/components/team-personal-dashboard';
import { PageContainer } from '@/components/page-shell';

export default function TeamHomePage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<TeamOverviewData | null>(null);
  const [hasMultipleTeams, setHasMultipleTeams] = useState(false);
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((me) => {
        const teams = me.teams ?? [];
        setHasMultipleTeams(teams.length > 1);
      });

    fetch(`/api/team/overview?teamId=${teamId}`)
      .then((r) => {
        if (r.status === 401) {
          router.push('/login');
          return null;
        }
        return r.json();
      })
      .then((json) => {
        if (!json) return;
        if (json.error) {
          setAccessError(json.error);
          return;
        }
        setData(json);
      });
  }, [router, teamId]);

  if (accessError && !data) {
    return (
      <PageContainer className="space-y-4">
        <StatusBanner message={accessError} type="error" />
        {hasMultipleTeams && (
          <LoadingButton variant="secondary" onClick={() => router.push('/team')}>
            ← Teams
          </LoadingButton>
        )}
      </PageContainer>
    );
  }

  if (!data) return <PageLoading />;

  return (
    <TeamPersonalDashboard
      data={data}
      teamId={teamId}
      hasMultipleTeams={hasMultipleTeams}
    />
  );
}
