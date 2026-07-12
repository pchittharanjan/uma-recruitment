import { cache } from 'react';
import { connection } from 'next/server';
import { getAccessibleTeams } from '@/lib/access';
import { getSessionUser } from '@/lib/auth';
import { initDb, type User } from '@/lib/db';
import { getImpersonateTarget } from '@/lib/impersonation';
import { isExecRole } from '@/lib/roles';

export interface TeamPortalContext {
  portalUser: { id: number; name: string; email: string; role: string };
  teams: { id: number; name: string }[];
  isExec: boolean;
  isImpersonating: boolean;
}

/** Deduped per request (React cache) so layout + page share one lookup. */
export const getTeamPortalContext = cache(async function getTeamPortalContext(
  sessionUser?: User | null,
): Promise<TeamPortalContext | null> {
  await connection();
  await initDb();

  const resolvedSession = sessionUser ?? (await getSessionUser());
  if (!resolvedSession) return null;

  const impersonateTarget = await getImpersonateTarget();
  const portalUser = impersonateTarget ?? resolvedSession;

  if (impersonateTarget && resolvedSession.role !== 'admin') return null;
  if (!isExecRole(portalUser.role)) return null;

  const teams = await getAccessibleTeams(portalUser);

  return {
    portalUser: {
      id: portalUser.id,
      name: portalUser.name,
      email: portalUser.email,
      role: portalUser.role,
    },
    teams,
    isExec: portalUser.role === 'exec',
    isImpersonating: Boolean(impersonateTarget),
  };
});
