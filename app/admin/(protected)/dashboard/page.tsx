import { redirect } from 'next/navigation';
import { AdminDashboardView } from '@/components/admin-dashboard-view';
import type { GlobalPhaseInitialState } from '@/components/global-phase-controls';
import {
  buildAdminDashboardPayload,
  buildAdminPhasePayload,
} from '@/lib/admin-workspace-data';
import { getSessionUser } from '@/lib/auth-session';
import { initDb } from '@/lib/db';
import { runWithRequestCache } from '@/lib/request-cache';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  return runWithRequestCache(async () => {
    await initDb();
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') redirect('/login');

    const [dashboardData, phasePayload] = await Promise.all([
      buildAdminDashboardPayload(),
      buildAdminPhasePayload({ includeChecklist: true }),
    ]);

    const initialPhaseState: GlobalPhaseInitialState = {
      status: phasePayload.status,
      nextStatus: phasePayload.nextStatus,
      unlockedStages: phasePayload.unlockedStages,
      teams: phasePayload.teams.map((t) => ({
        teamId: t.teamId,
        teamName: t.teamName,
        round: t.round ? { id: t.round.id, status: t.round.status } : null,
        unlockedStages: t.unlockedStages,
        phaseRevert: t.phaseRevert,
      })),
      checklist: phasePayload.checklist ?? [],
    };

    return (
      <AdminDashboardView
        initialData={dashboardData}
        initialPhaseState={initialPhaseState}
      />
    );
  });
}
