import { redirect } from 'next/navigation';
import { getAccessibleTeams } from '@/lib/access';
import { getSessionUser } from '@/lib/auth';
import { AdminShell } from '@/components/admin-shell';
import { TeamShell } from '@/components/team-shell';
import { getTeamPortalContext } from '@/lib/team-portal-context';
import { getImpersonateTarget } from '@/lib/impersonation';
import { initDb } from '@/lib/db';
import { anyTeamHasActivePipeline } from '@/lib/rounds';
import { runWithRequestCache } from '@/lib/request-cache';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  return runWithRequestCache(async () => {
    await initDb();

    const sessionUser = await getSessionUser();
    if (!sessionUser) redirect('/login');

    const impersonateTarget = await getImpersonateTarget();
    if (impersonateTarget && sessionUser.role === 'admin') {
      const teams = await getAccessibleTeams(impersonateTarget);
      return (
        <TeamShell
          user={{
            id: impersonateTarget.id,
            name: impersonateTarget.name,
            email: impersonateTarget.email,
            role: impersonateTarget.role,
          }}
          teams={teams}
          isImpersonating
          impersonationAdmin={{
            name: sessionUser.name,
            email: sessionUser.email,
          }}
        >
          {children}
        </TeamShell>
      );
    }

    const portalCtx = await getTeamPortalContext(sessionUser);
    if (portalCtx) {
      return (
        <TeamShell
          user={portalCtx.portalUser}
          teams={portalCtx.teams}
          isImpersonating={portalCtx.isImpersonating}
        >
          {children}
        </TeamShell>
      );
    }

    if (sessionUser.role !== 'admin') redirect('/login');

    const hasActivePipeline = await anyTeamHasActivePipeline();

    return (
      <AdminShell
        user={{
          id: sessionUser.id,
          name: sessionUser.name,
          email: sessionUser.email,
          role: sessionUser.role,
        }}
        showApplicationsNav={hasActivePipeline}
      >
        {children}
      </AdminShell>
    );
  });
}
