'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingButton from '@/components/loading-button';

interface MeResponse {
  user: { name: string; email: string; role: string };
  impersonation: {
    active: boolean;
    admin: { name: string; email: string };
  } | null;
}

export function ImpersonationBanner() {
  const router = useRouter();
  const [state, setState] = useState<MeResponse | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json) setState(json);
      });
  }, []);

  if (!state?.impersonation?.active) return null;

  const handleStop = async () => {
    setStopping(true);
    try {
      const res = await fetch('/api/admin/impersonate/stop', { method: 'POST' });
      if (!res.ok) return;
      router.push('/admin/dashboard');
      router.refresh();
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-950 sm:px-6 dark:text-amber-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 leading-relaxed">
          <span className="font-semibold">Test mode:</span> viewing as{' '}
          <span className="font-medium">{state.user.name}</span> ({state.user.email}). Admin session
          saved as {state.impersonation.admin.name}.
        </p>
        <LoadingButton
          size="sm"
          variant="secondary"
          loading={stopping}
          onClick={handleStop}
          className="w-full shrink-0 border-amber-500/40 bg-background/80 sm:w-auto"
        >
          Exit test mode
        </LoadingButton>
      </div>
    </div>
  );
}
