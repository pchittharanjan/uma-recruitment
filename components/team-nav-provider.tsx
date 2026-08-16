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
import { cachedJsonFetch, invalidateClientFetchCache } from '@/lib/client-fetch-cache';
import { PIPELINE_PHASE_CHANGED_EVENT } from '@/lib/pipeline-events';
import type { UnlockableStage } from '@/lib/stages';

export type TeamNavTeam = {
  id: number;
  name: string;
  round: { status: RoundStatus } | null;
  grantedStages: UnlockableStage[] | 'all';
  unlockedStages: UnlockableStage[];
};

export type TeamNavSnapshot = {
  status: RoundStatus | null;
  teams: TeamNavTeam[];
  isExec: boolean;
  finalSelectionComplete: boolean;
  pipelineClosed: boolean;
  recruitmentCycleShortLabel?: string;
  recruitmentCycleLabel?: string;
};

type TeamNavContextValue = {
  nav: TeamNavSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const TeamNavContext = createContext<TeamNavContextValue | null>(null);

function parseNav(json: Record<string, unknown>): TeamNavSnapshot {
  return {
    status: (json.status as RoundStatus | null) ?? null,
    teams: (json.teams as TeamNavTeam[]) ?? [],
    isExec: Boolean(json.isExec),
    finalSelectionComplete: Boolean(json.finalSelectionComplete),
    pipelineClosed:
      json.status === 'closed' || Boolean(json.pipelineClosed),
    recruitmentCycleShortLabel:
      typeof json.recruitmentCycleShortLabel === 'string'
        ? json.recruitmentCycleShortLabel
        : undefined,
    recruitmentCycleLabel:
      typeof json.recruitmentCycleLabel === 'string'
        ? json.recruitmentCycleLabel
        : undefined,
  };
}

const NAV_URL = '/api/team/nav';

export function TeamNavProvider({ children }: { children: ReactNode }) {
  const [nav, setNav] = useState<TeamNavSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      invalidateClientFetchCache(NAV_URL);
      const { ok, json } = await cachedJsonFetch<Record<string, unknown>>(NAV_URL, {
        force: true,
      });
      if (!ok || !json) return;
      setNav(parseNav(json));
    } catch {
      // Shell stays usable without nav data.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    cachedJsonFetch<Record<string, unknown>>(NAV_URL)
      .then(({ ok, json }) => {
        if (cancelled || !ok || !json) return;
        setNav(parseNav(json));
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

  const value = useMemo(() => ({ nav, loading, refresh }), [nav, loading, refresh]);

  return <TeamNavContext.Provider value={value}>{children}</TeamNavContext.Provider>;
}

export function useTeamNav(): TeamNavContextValue {
  const ctx = useContext(TeamNavContext);
  if (!ctx) {
    throw new Error('useTeamNav must be used within TeamNavProvider');
  }
  return ctx;
}
