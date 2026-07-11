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
import StatusBanner from '@/components/status-banner';

interface DashboardData {
  pipelineStatus: RoundStatus;
  teams: PhaseTeamSummary[];
}

function firstNameFromName(name: string | null | undefined): string {
  if (!name) return '';
  return name.trim().split(/\s+/)[0] ?? '';
}

function AdminDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view') ?? '';
  const [data, setData] = useState<DashboardData | null>(null);
  const [viewingStatus, setViewingStatus] = useState<RoundStatus | null>(null);
  const [firstName, setFirstName] = useState('');
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const interviewOverviewScrolledRef = useRef<string | null>(null);

  const loadDashboard = useCallback(() => {
    fetch('/api/admin/dashboard')
      .then((res) => {
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        return res.json();
      })
      .then((json) => {
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
  }, [router, viewParam]);

  useEffect(() => {
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
    if (hash !== '#interview-overview' && hash !== '#move-all-teams') {
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

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return;
        const nextFirstName = firstNameFromName(json?.user?.name);
        setFirstName(nextFirstName);
      })
      .catch(() => {
        if (!cancelled) setFirstName('');
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
          title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
          description="Overall status across all teams"
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
