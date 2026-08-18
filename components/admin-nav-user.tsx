'use client';

import { useRouter } from 'next/navigation';
import { SidebarNavUser } from '@/components/sidebar-nav-user';
import { LogOutIcon } from 'lucide-react';

export function AdminNavUser({
  user,
}: {
  user: { name: string; email: string; role: string };
}) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <SidebarNavUser
      user={user}
      actionLabel="Sign out"
      actionIcon={LogOutIcon}
      onAction={handleLogout}
    />
  );
}
