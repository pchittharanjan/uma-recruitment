'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import LoadingButton from '@/components/loading-button';
import { cn } from '@/lib/utils';

interface ProfileMenuUser {
  name: string;
  email: string;
  role: string;
}

function firstNameInitial(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return (first?.[0] ?? '?').toUpperCase();
}

import { roleLabel } from '@/lib/roles';

export default function ProfileMenu({ user }: { user: ProfileMenuUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initial = firstNameInitial(user.name);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open profile menu"
      >
        <Avatar size="sm">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
            {initial}
          </AvatarFallback>
        </Avatar>
      </button>

      <div
        role="menu"
        className={cn(
          'absolute right-0 top-full z-50 mt-2 w-56 rounded-lg bg-card p-2 shadow-md transition-all',
          open ? 'visible opacity-100' : 'invisible pointer-events-none opacity-0',
        )}
      >
        <div className="px-2 py-2">
          <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {roleLabel(user.role)}
          </p>
        </div>
        <div className="pt-1">
          <LoadingButton
            variant="ghost"
            className="h-8 w-full justify-start px-2 text-sm"
            onClick={handleLogout}
          >
            Sign Out
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
