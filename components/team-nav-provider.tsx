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
import { cachedJsonFetch, invalidateClientFetchCache } from '@/lib/client-fetch-cache';
import { PIPELINE_PHASE_CHANGED_EVENT } from '@/lib/pipeline-events';
import type { TeamNavSnapshot, TeamNavTeam } from '@/lib/team-nav-types';

export type { TeamNavSnapshot, TeamNavTeam };

type TeamNavContextValue = {
  nav: TeamNavSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const TeamNavContext = createContext<TeamNavContextValue | null>(null);

function parseNav(json: Record<string, unknown>): TeamNavSnapshot {
  return {
    status: (json.status as TeamNavSnapshot['status']) ?? null,
    teams: (json.teams as TeamNavSnapshot['teams']) ?? [],
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

export function TeamNavProvider({
  children,
  initialNav,
}: {
  children: ReactNode;
  initialNav?: TeamNavSnapshot | null;
}) {
  const [nav, setNav] = useState<TeamNavSnapshot | null>(initialNav ?? null);
  const [loading, setLoading] = useState(!initialNav);

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
    if (initialNav) return;
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
  }, [initialNav]);

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
