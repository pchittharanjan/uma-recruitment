'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EraseTestDataButton } from '@/components/erase-test-data-button';
import { GlobalPhaseControls, type GlobalPhaseInitialState } from '@/components/global-phase-controls';
import { RecruitmentCycleSettings } from '@/components/recruitment-cycle-settings';
import {
  AdminPhaseTeamOverview,
  type PhaseTeamSummary,
} from '@/components/admin-phase-team-overview';
import type { RoundStatus } from '@/lib/db';
import {
  ADMIN_PHASE_SLUGS,
  isAdminDashboardPhase,
  parseDashboardViewPhase,
} from '@/lib/stages';
import PageLoading from '@/components/page-loading';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { useShellUser } from '@/components/shell-user-provider';
import StatusBanner from '@/components/status-banner';
import { cachedJsonFetch, peekCachedJson } from '@/lib/client-fetch-cache';
import { greetingForName } from '@/lib/greeting';
import type { AdminDashboardPayload } from '@/lib/admin-workspace-data';

interface DashboardData {
  pipelineStatus: RoundStatus;
  teams: PhaseTeamSummary[];
}

function AdminDashboardContent({
  initialData,
  initialPhaseState,
}: {
  initialData: DashboardData;
  initialPhaseState: GlobalPhaseInitialState;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view') ?? '';
  const { user } = useShellUser();
  const [data, setData] = useState<DashboardData>(() =>
    peekCachedJson<DashboardData>('/api/admin/dashboard') ?? initialData,
  );
  const [viewingStatus, setViewingStatus] = useState<RoundStatus>(() =>
    parseDashboardViewPhase(viewParam || null, initialData.pipelineStatus ?? 'pre_application'),
  );
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const interviewOverviewScrolledRef = useRef<string | null>(null);

  const loadDashboard = useCallback(() => {
    cachedJsonFetch<DashboardData & { error?: string }>('/api/admin/dashboard')
      .then(({ status, json }) => {
        if (status === 401) {
          router.push('/login');
          return;
        }
        if (!json) return;
        if (json.error) {
          setError(json.error);
          return;
        }
        setData(json);
        const view = parseDashboardViewPhase(
          viewParam || null,
          json.pipelineStatus as RoundStatus,
        );
        setViewingStatus(view);
      })
      .catch(() => setError('Failed to load dashboard'));
  }, [router, viewParam, refreshKey]);

  useEffect(() => {
    if (refreshKey === 0) return;
    loadDashboard();
  }, [loadDashboard, refreshKey]);

  useEffect(() => {
    if (!data) return;
    const view = parseDashboardViewPhase(viewParam || null, data.pipelineStatus);
    setViewingStatus(view);
  }, [data, viewParam]);

  useEffect(() => {
    if (!data || typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash !== '#interview-overview' && hash !== '#pipeline-controls') {
      interviewOverviewScrolledRef.current = null;
      return;
    }

    const scrollKey = `${viewParam}${hash}`;
    if (interviewOverviewScrolledRef.current === scrollKey) return;

    const el = document.getElementById(hash.slice(1));
    if (!el) return;

    interviewOverviewScrolledRef.current = scrollKey;
    el.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, [data, viewParam]);

  const handleViewingChange = (status: RoundStatus) => {
    setViewingStatus(status);
    const slug = ADMIN_PHASE_SLUGS[status];
    if (slug && isAdminDashboardPhase(status)) {
      router.replace(`/admin/dashboard?view=${slug}`, { scroll: false });
      return;
    }
    if (status === data?.pipelineStatus) {
      router.replace('/admin/dashboard', { scroll: false });
    }
  };

  if (error) {
    return (
      <PageContainer>
        <StatusBanner message={error} type="error" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageSection>
        <PageHeader
          eyebrow="Admin"
          title={greetingForName(user.name)}
          actions={
            <EraseTestDataButton
              redirectTo="/admin/dashboard"
              onSuccess={() => {
                setViewingStatus('pre_application');
                setRefreshKey((k) => k + 1);
              }}
            />
          }
        />

        <RecruitmentCycleSettings />

        <GlobalPhaseControls
          viewingStatus={viewingStatus}
          onViewingStatusChange={handleViewingChange}
          onPhaseChange={() => {
            setRefreshKey((k) => k + 1);
          }}
          initialPhaseState={initialPhaseState}
        />

        <AdminPhaseTeamOverview viewPhase={viewingStatus} teams={data.teams} />
      </PageSection>
    </PageContainer>
  );
}

export function AdminDashboardView({
  initialData,
  initialPhaseState,
}: {
  initialData: AdminDashboardPayload;
  initialPhaseState: GlobalPhaseInitialState;
}) {
  return (
    <Suspense fallback={<PageLoading />}>
      <AdminDashboardContent
        initialData={{
          pipelineStatus: initialData.pipelineStatus ?? 'pre_application',
          teams: initialData.teams as unknown as PhaseTeamSummary[],
        }}
        initialPhaseState={initialPhaseState}
      />
    </Suspense>
  );
}
