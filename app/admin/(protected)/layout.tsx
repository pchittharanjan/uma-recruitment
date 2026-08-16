import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AdminShell } from '@/components/admin-shell';
import { initDb } from '@/lib/db';
import { getImpersonateTarget } from '@/lib/impersonation';
import { anyTeamHasActivePipeline } from '@/lib/rounds';
import { runWithRequestCache } from '@/lib/request-cache';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  return runWithRequestCache(async () => {
    await initDb();
    const user = await getSessionUser();
    if (!user) redirect('/login');
    if (user.role !== 'admin') redirect('/login');
    if (await getImpersonateTarget()) redirect('/team');

    const hasActivePipeline = await anyTeamHasActivePipeline();

    return (
      <AdminShell
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        }}
        showApplicationsNav={hasActivePipeline}
      >
        {children}
      </AdminShell>
    );
  });
}
