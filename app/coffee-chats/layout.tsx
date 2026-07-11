import { redirect } from 'next/navigation';
import { getAccessibleTeams } from '@/lib/access';
import { getSessionUser } from '@/lib/auth';
import AppHeader from '@/components/app-header';
import { TeamShell } from '@/components/team-shell';
import { PageShell } from '@/components/page-shell';
import { getTeamPortalContext } from '@/lib/team-portal-context';
import { getImpersonateTarget } from '@/lib/impersonation';
import { initDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function CoffeeChatsLayout({ children }: { children: React.ReactNode }) {
  await initDb();

  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');

  const impersonateTarget = await getImpersonateTarget();
  if (impersonateTarget && sessionUser.role === 'admin') {
    const teams = await getAccessibleTeams(impersonateTarget);
    return (
      <TeamShell
        user={{
          name: impersonateTarget.name,
          email: impersonateTarget.email,
          role: impersonateTarget.role,
        }}
        teams={teams}
        isImpersonating
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

  return (
    <PageShell>
      <AppHeader user={sessionUser} homeHref="/admin/dashboard" />
      {children}
    </PageShell>
  );
}
