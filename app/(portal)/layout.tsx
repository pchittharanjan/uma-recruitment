import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAccessibleTeams } from '@/lib/access';
import { getSessionUser } from '@/lib/auth-session';
import { AdminShell } from '@/components/admin-shell';
import { TeamShell } from '@/components/team-shell';
import { getTeamPortalContext, getTeamPortalUser } from '@/lib/team-portal-context';
import { getImpersonateTarget } from '@/lib/impersonation';
import { initDb } from '@/lib/db';
import { anyTeamHasActivePipeline } from '@/lib/rounds';
import { runWithRequestCache } from '@/lib/request-cache';
import { readSidebarPrefs } from '@/lib/sidebar-prefs';
import { buildTeamNavSnapshot } from '@/lib/team-nav';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  return runWithRequestCache(async () => {
    await initDb();

    const sessionUser = await getSessionUser();
    if (!sessionUser) redirect('/login');

    const sidebarPrefs = readSidebarPrefs(await cookies());

    const impersonateTarget = await getImpersonateTarget();
    if (impersonateTarget && sessionUser.role === 'admin') {
      const teams = await getAccessibleTeams(impersonateTarget);
      const initialNav = await buildTeamNavSnapshot(impersonateTarget);
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
          defaultSidebarOpen={sidebarPrefs.defaultOpen}
          defaultSidebarWidth={sidebarPrefs.defaultWidth}
          initialNav={initialNav}
        >
          {children}
        </TeamShell>
      );
    }

    const portalCtx = await getTeamPortalContext(sessionUser);
    if (portalCtx) {
      const portalUser = await getTeamPortalUser({ roles: ['exec', 'ad_hoc_exec'] });
      const initialNav = portalUser ? await buildTeamNavSnapshot(portalUser) : null;
      return (
        <TeamShell
          user={portalCtx.portalUser}
          teams={portalCtx.teams}
          isImpersonating={portalCtx.isImpersonating}
          defaultSidebarOpen={sidebarPrefs.defaultOpen}
          defaultSidebarWidth={sidebarPrefs.defaultWidth}
          initialNav={initialNav}
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
        defaultSidebarOpen={sidebarPrefs.defaultOpen}
        defaultSidebarWidth={sidebarPrefs.defaultWidth}
      >
        {children}
      </AdminShell>
    );
  });
}
