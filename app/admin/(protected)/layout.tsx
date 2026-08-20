import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth-session';
import { AdminShell } from '@/components/admin-shell';
import { initDb } from '@/lib/db';
import { runWithRequestCache } from '@/lib/request-cache';
import { readSidebarPrefs } from '@/lib/sidebar-prefs';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  return runWithRequestCache(async () => {
    await initDb();
    const user = await getSessionUser();
    if (!user) redirect('/login');
    if (user.role !== 'admin') redirect('/login');

    const sidebarPrefs = readSidebarPrefs(await cookies());

    return (
      <AdminShell
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        }}
        showApplicationsNav
        defaultSidebarOpen={sidebarPrefs.defaultOpen}
        defaultSidebarWidth={sidebarPrefs.defaultWidth}
      >
        {children}
      </AdminShell>
    );
  });
}
