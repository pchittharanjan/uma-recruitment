'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { RoundStatus } from '@/lib/db';
import { cachedJsonFetch, invalidateClientFetchCache } from '@/lib/client-fetch-cache';
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

const LIGHT_PHASE_URL = '/api/admin/phase?light=1';

function parsePhase(json: Record<string, unknown>): AdminPhaseSnapshot {
  return {
    status: (json.status as RoundStatus | null) ?? null,
    unlockedStages: (json.unlockedStages as UnlockableStage[]) ?? [],
    pipelineClosed: json.status === 'closed' || Boolean(json.pipelineClosed),
  };
}

export function AdminPhaseProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AdminPhaseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      invalidateClientFetchCache('/api/admin/phase');
      const { ok, json } = await cachedJsonFetch<Record<string, unknown>>(LIGHT_PHASE_URL, {
        force: true,
      });
      if (!mountedRef.current || !ok || !json) return;
      setPhase(parsePhase(json));
    } catch {
      // Shell stays usable without phase data.
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    cachedJsonFetch<Record<string, unknown>>(LIGHT_PHASE_URL)
      .then(({ ok, json }) => {
        if (cancelled || !ok || !json) return;
        setPhase(parsePhase(json));
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

  const value = useMemo(() => ({ phase, loading, refresh }), [phase, loading, refresh]);

  return <AdminPhaseContext.Provider value={value}>{children}</AdminPhaseContext.Provider>;
}

export function useAdminPhase(): AdminPhaseContextValue {
  const ctx = useContext(AdminPhaseContext);
  if (!ctx) {
    throw new Error('useAdminPhase must be used within AdminPhaseProvider');
  }
  return ctx;
}
