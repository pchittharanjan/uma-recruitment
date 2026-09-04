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
import { useAdminPhase } from '@/components/admin-phase-provider';

interface DashboardData {
  pipelineStatus: RoundStatus;
  teams: PhaseTeamSummary[];
}

function AdminGettingStartedBanner({
  teams,
  pipelineClosed,
}: {
  teams: PhaseTeamSummary[];
  pipelineClosed: boolean;
}) {
  const totalApplications = teams.reduce((sum, team) => sum + (team.applicationCount ?? 0), 0);
  const allPreApplication =
    teams.length > 0 &&
    teams.every(
      (team) => !team.round || team.round.status === 'pre_application',
    );
  const showBanner = !pipelineClosed && teams.length > 0 && (allPreApplication || totalApplications === 0);

  if (!showBanner) return null;

  return (
    <StatusBanner
      dismissKey="admin-getting-started"
      type="info"
      title="Getting started:"
      message="1. Add users · 2. Advance each team to Application · 3. Import CSV · 4. Unlock grading for execs"
      actions={[
        { label: 'Users', href: '/admin/users' },
        { label: 'Advance', href: '#pipeline-controls' },
        { label: 'Import', href: '/admin/import' },
        { label: 'Unlock', href: '#pipeline-controls' },
      ]}
    />
  );
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
  const { phase } = useAdminPhase();
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

    const scrollToHash = () => {
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
    };

    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
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

        <div data-tour="admin-cycle">
          <RecruitmentCycleSettings />
        </div>

        <div data-tour="admin-phase" className="space-y-4">
          <AdminGettingStartedBanner
            teams={data.teams}
            pipelineClosed={phase?.pipelineClosed ?? false}
          />
          <GlobalPhaseControls
            viewingStatus={viewingStatus}
            onViewingStatusChange={handleViewingChange}
            onPhaseChange={() => {
              setRefreshKey((k) => k + 1);
            }}
            initialPhaseState={initialPhaseState}
          />
        </div>

        <div data-tour="admin-teams-overview">
          <AdminPhaseTeamOverview viewPhase={viewingStatus} teams={data.teams} />
        </div>
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
