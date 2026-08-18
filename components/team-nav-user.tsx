'use client';

import { useRouter } from 'next/navigation';
import { SidebarNavUser } from '@/components/sidebar-nav-user';
import { LogOutIcon, Undo2Icon } from 'lucide-react';

export function TeamNavUser({
  user,
  isImpersonating = false,
}: {
  user: { name: string; email: string; role: string };
  isImpersonating?: boolean;
}) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const handleExitTestMode = async () => {
    await fetch('/api/admin/impersonate/stop', { method: 'POST' });
    router.push('/admin/dashboard');
    router.refresh();
  };

  return (
    <SidebarNavUser
      user={user}
      actionLabel={isImpersonating ? 'Exit test mode' : 'Sign out'}
      actionIcon={isImpersonating ? Undo2Icon : LogOutIcon}
      onAction={isImpersonating ? handleExitTestMode : handleLogout}
    />
  );
}
