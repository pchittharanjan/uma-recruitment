'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageLoading from '@/components/page-loading';
import StatusBanner from '@/components/status-banner';
import { TeamInterviewGuideSetup } from '@/components/team-interview-guide-setup';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';

interface PageData {
  team: { id: number; name: string };
  round: { id: number; label: string };
}

export default function TeamInterviewSetupPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/teams/${teamId}/interview-guide`);
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Failed to load interview setup.');
      return;
    }
    setData({ team: json.team, round: json.round });
  }, [router, teamId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !data) {
    return (
      <PageContainer>
        <StatusBanner message={error} type="error" />
      </PageContainer>
    );
  }

  if (!data) {
    return <PageLoading />;
  }

  return (
    <PageContainer size="wide" className="space-y-8">
      <PageHeader
        eyebrow={data.team.name}
        title="Setup interview"
      />

      <PageSection>
        <TeamInterviewGuideSetup teamId={teamId} />
      </PageSection>
    </PageContainer>
  );
}
