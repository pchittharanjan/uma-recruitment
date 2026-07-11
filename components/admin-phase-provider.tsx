'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { RoundStatus } from '@/lib/db';
import { PIPELINE_PHASE_CHANGED_EVENT } from '@/lib/pipeline-events';
import type { UnlockableStage } from '@/lib/stages';

export type AdminPhaseSnapshot = {
  status: RoundStatus | null;
  unlockedStages: UnlockableStage[];
  pipelineClosed: boolean;
};

type AdminPhaseContextValue = {
  phase: AdminPhaseSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AdminPhaseContext = createContext<AdminPhaseContextValue | null>(null);

export function AdminPhaseProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AdminPhaseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/phase', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setPhase({
        status: json.status ?? null,
        unlockedStages: json.unlockedStages ?? [],
        pipelineClosed: json.status === 'closed' || Boolean(json.pipelineClosed),
      });
    } catch {
      // Shell stays usable without phase data.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/admin/phase', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        setPhase({
          status: json.status ?? null,
          unlockedStages: json.unlockedStages ?? [],
          pipelineClosed: json.status === 'closed' || Boolean(json.pipelineClosed),
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onChange = () => {
      void refresh();
    };
    window.addEventListener(PIPELINE_PHASE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PIPELINE_PHASE_CHANGED_EVENT, onChange);
  }, [refresh]);

  const value = useMemo(
    () => ({ phase, loading, refresh }),
    [phase, loading, refresh],
  );

  return (
    <AdminPhaseContext.Provider value={value}>{children}</AdminPhaseContext.Provider>
  );
}

export function useAdminPhase(): AdminPhaseContextValue {
  const ctx = useContext(AdminPhaseContext);
  if (!ctx) {
    throw new Error('useAdminPhase must be used within AdminPhaseProvider');
  }
  return ctx;
}
