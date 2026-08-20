import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  AdminApplicationsView,
  type AdminApplicationsInitialData,
} from '@/components/admin-applications-view';
import PageLoading from '@/components/page-loading';
import { listAdminApplications } from '@/lib/admin-applications';
import { getSessionUser } from '@/lib/auth-session';
import { initDb } from '@/lib/db';
import { runWithRequestCache } from '@/lib/request-cache';

export const dynamic = 'force-dynamic';

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string }>;
}) {
  const { teamId: teamIdParam } = await searchParams;

  return runWithRequestCache(async () => {
    await initDb();
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') redirect('/login');

    const teamId =
      teamIdParam && teamIdParam !== 'all'
        ? Number.parseInt(teamIdParam, 10)
        : undefined;

    const data = await listAdminApplications({
      teamId: Number.isFinite(teamId) ? teamId : undefined,
      limit: 150,
      offset: 0,
    });

    const initialData: AdminApplicationsInitialData = {
      applications: data.applications,
      teams: data.teams,
      total: data.total,
      allCount: data.allCount,
      hasMore: data.hasMore,
    };

    return (
      <Suspense fallback={<PageLoading />}>
        <AdminApplicationsView
          initialData={initialData}
          initialTeamFilter={teamIdParam ?? 'all'}
        />
      </Suspense>
    );
  });
}
