'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EraseTestDataButton } from '@/components/erase-test-data-button';
import { GlobalPhaseControls } from '@/components/global-phase-controls';
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
import { cachedJsonFetch } from '@/lib/client-fetch-cache';

interface DashboardData {
  pipelineStatus: RoundStatus;
  teams: PhaseTeamSummary[];
}

/** Survive client navigations so we can paint instantly, then force-refresh. */
let lastDashboardData: DashboardData | null = null;

function firstNameFromName(name: string | null | undefined): string {
  if (!name) return '';
  return name.trim().split(/\s+/)[0] ?? '';
}

function AdminDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view') ?? '';
  const { user } = useShellUser();
  const firstName = firstNameFromName(user.name);
  const [data, setData] = useState<DashboardData | null>(lastDashboardData);
  const [viewingStatus, setViewingStatus] = useState<RoundStatus | null>(() =>
    lastDashboardData
      ? parseDashboardViewPhase(viewParam || null, lastDashboardData.pipelineStatus)
      : null,
  );
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const interviewOverviewScrolledRef = useRef<string | null>(null);

  const loadDashboard = useCallback(() => {
    // Always refetch — progress numbers go stale after simulate/grading, and the
    // shared client cache otherwise serves a 5-minute snapshot.
    cachedJsonFetch<DashboardData & { error?: string }>('/api/admin/dashboard', {
      force: true,
    })
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
        lastDashboardData = json;
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
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!data) return;
    const view = parseDashboardViewPhase(viewParam || null, data.pipelineStatus);
    setViewingStatus(view);
  }, [data, viewParam]);

  useEffect(() => {
    if (!data || typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (
      hash !== '#interview-overview' &&
      hash !== '#move-all-teams' &&
      hash !== '#stage-access'
    ) {
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

  if (!data || !viewingStatus) {
    return <PageLoading />;
  }

  return (
    <PageContainer>
      <PageSection>
        <PageHeader
          eyebrow="Admin"
          title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
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
        />

        <AdminPhaseTeamOverview viewPhase={viewingStatus} teams={data.teams} />
      </PageSection>
    </PageContainer>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AdminDashboardContent />
    </Suspense>
  );
}
