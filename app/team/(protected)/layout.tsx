import { redirect } from 'next/navigation';
import { TeamShell } from '@/components/team-shell';
import { getTeamPortalContext } from '@/lib/team-portal-context';

export const dynamic = 'force-dynamic';

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTeamPortalContext();
  if (!ctx) redirect('/login');

  return (
    <TeamShell
      user={ctx.portalUser}
      teams={ctx.teams}
      isImpersonating={ctx.isImpersonating}
    >
      {children}
    </TeamShell>
  );
}
