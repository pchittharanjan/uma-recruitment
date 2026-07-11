import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AdminShell } from '@/components/admin-shell';
import { initDb } from '@/lib/db';
import { getImpersonateTarget } from '@/lib/impersonation';
import { anyTeamHasActivePipeline } from '@/lib/rounds';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await initDb();
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/login');
  if (await getImpersonateTarget()) redirect('/team');

  const hasActivePipeline = await anyTeamHasActivePipeline();

  return (
    <AdminShell user={user} showApplicationsNav={hasActivePipeline}>
      {children}
    </AdminShell>
  );
}
