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
import { usePathname, useRouter } from 'next/navigation';
import { markNavigationPending } from '@/components/navigation-progress';
import { useOptionalShellUser } from '@/components/shell-user-provider';
import { useBrowserSearch } from '@/hooks/use-workspace-embed';
import {
  findWorkspaceTabIndex,
  isInternalWorkspaceHref,
  normalizeWorkspaceHref,
  stripEmbedParam,
  workspaceAreaFromPathname,
  workspaceSplitStorageKey,
  workspaceTabMatches,
  workspaceTabsStorageKey,
  workspaceTitle,
  type WorkspaceArea,
  type WorkspaceTab,
  type WorkspaceTitleContext,
} from '@/lib/workspace';

interface WorkspaceContextValue {
  area: WorkspaceArea;
  tabs: WorkspaceTab[];
  activeHref: string;
  split: boolean;
  splitHref: string | null;
  splitRatio: number;
  openTab: (href: string, options?: { background?: boolean }) => void;
  closeTab: (href: string) => void;
  focusTab: (href: string) => void;
  setSplitHref: (href: string | null) => void;
  setSplitRatio: (ratio: number) => void;
  toggleSplit: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function currentHref(pathname: string, search: string): string {
  return normalizeWorkspaceHref(`${pathname}${search}`);
}

function readStoredTabs(area: WorkspaceArea): WorkspaceTab[] {
  try {
    const raw = sessionStorage.getItem(workspaceTabsStorageKey(area));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkspaceTab[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (tab) => tab && typeof tab.href === 'string' && typeof tab.title === 'string',
    );
  } catch {
    return [];
  }
}

function readStoredSplit(area: WorkspaceArea): {
  split: boolean;
  splitHref: string | null;
  splitRatio: number;
} {
  try {
    const raw = sessionStorage.getItem(workspaceSplitStorageKey(area));
    if (!raw) return { split: false, splitHref: null, splitRatio: 50 };
    const parsed = JSON.parse(raw) as {
      split?: boolean;
      splitHref?: string | null;
      splitRatio?: number;
    };
    return {
      split: Boolean(parsed.split),
      splitHref: typeof parsed.splitHref === 'string' ? parsed.splitHref : null,
      splitRatio:
        typeof parsed.splitRatio === 'number' && Number.isFinite(parsed.splitRatio)
          ? Math.min(75, Math.max(25, parsed.splitRatio))
          : 50,
    };
  } catch {
    return { split: false, splitHref: null, splitRatio: 50 };
  }
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider.');
  }
  return context;
}

export function WorkspaceProvider({
  children,
  area,
}: {
  children: ReactNode;
  area?: WorkspaceArea;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useBrowserSearch();
  const shell = useOptionalShellUser();
  const href = currentHref(pathname, search);
  const resolvedArea = area ?? workspaceAreaFromPathname(pathname);

  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [split, setSplit] = useState(false);
  const [splitHref, setSplitHrefState] = useState<string | null>(null);
  const [splitRatio, setSplitRatioState] = useState(50);
  const [hydrated, setHydrated] = useState(false);
  const [adminTeamNames, setAdminTeamNames] = useState<Record<string, string>>({});
  /** Last tab the left pane was showing — used to update that tab in place on nav. */
  const activeTabHrefRef = useRef<string | null>(null);
  /** Set by openTab before router.push so the sync effect does not replace in place. */
  const pendingOpenRef = useRef<string | null>(null);
  /** Set by focusTab before router.push so the sync effect does not clobber other tabs. */
  const pendingFocusRef = useRef<string | null>(null);
  /** Avoid router.push until after mount — prevents HMR reload race. */
  const routerReadyRef = useRef(false);

  useEffect(() => {
    routerReadyRef.current = true;
  }, []);

  const titleContext = useMemo<WorkspaceTitleContext>(() => {
    const teamNames = { ...adminTeamNames };
    for (const team of shell?.teams ?? []) {
      teamNames[String(team.id)] = team.name;
    }
    return { teamNames };
  }, [adminTeamNames, shell?.teams]);

  useEffect(() => {
    if (resolvedArea !== 'admin') return;

    let cancelled = false;
    fetch('/api/admin/teams')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.teams) return;
        const next: Record<string, string> = {};
        for (const team of json.teams as Array<{ id: number; name: string }>) {
          next[String(team.id)] = team.name;
        }
        setAdminTeamNames(next);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [resolvedArea]);

  useEffect(() => {
    const storedTabs = readStoredTabs(resolvedArea);
    const storedSplit = readStoredSplit(resolvedArea);
    setTabs(storedTabs);
    setSplit(storedSplit.split);
    setSplitHrefState(storedSplit.splitHref);
    setSplitRatioState(storedSplit.splitRatio);
    activeTabHrefRef.current = null;
    pendingOpenRef.current = null;
    pendingFocusRef.current = null;
    setHydrated(true);
  }, [resolvedArea]);

  // Keep the active tab's href/title in sync with the current route.
  // Do NOT append a tab on every navigation — only openTab (+ / Open) adds tabs.
  useEffect(() => {
    if (!hydrated) return;
    const title = workspaceTitle(href, titleContext);
    setTabs((prev) => {
      const existingIndex = findWorkspaceTabIndex(prev, href);
      if (existingIndex >= 0) {
        pendingOpenRef.current = null;
        pendingFocusRef.current = null;
        activeTabHrefRef.current = href;
        const existing = prev[existingIndex]!;
        return existing.href === href && existing.title === title
          ? prev
          : prev.map((tab, i) => (i === existingIndex ? { ...tab, href, title } : tab));
      }

      // Explicit Open / + : openTab owns appending; skip in-place replace.
      if (pendingOpenRef.current && workspaceTabMatches(pendingOpenRef.current, href)) {
        pendingOpenRef.current = null;
        activeTabHrefRef.current = href;
        return findWorkspaceTabIndex(prev, href) >= 0 ? prev : [...prev, { href, title }];
      }

      // Tab bar click: wait for URL to settle, then update only the focused tab.
      if (pendingFocusRef.current) {
        const focusHref = pendingFocusRef.current;
        if (!workspaceTabMatches(focusHref, href)) {
          return prev;
        }
        pendingFocusRef.current = null;
        activeTabHrefRef.current = href;
        const focusIndex = findWorkspaceTabIndex(prev, focusHref);
        const resolvedFocusIndex =
          focusIndex >= 0 ? focusIndex : findWorkspaceTabIndex(prev, href);
        if (resolvedFocusIndex >= 0) {
          const existing = prev[resolvedFocusIndex]!;
          return existing.href === href && existing.title === title
            ? prev
            : prev.map((tab, i) =>
                i === resolvedFocusIndex ? { ...tab, href, title } : tab,
              );
        }
        return [...prev, { href, title }];
      }

      if (prev.length === 0) {
        activeTabHrefRef.current = href;
        return [{ href, title }];
      }

      // Sidebar / in-tab navigation: mutate the tab that was already active.
      const activeIndex =
        activeTabHrefRef.current != null
          ? findWorkspaceTabIndex(prev, activeTabHrefRef.current)
          : -1;
      const indexToUpdate = activeIndex >= 0 ? activeIndex : 0;
      activeTabHrefRef.current = href;
      return prev.map((tab, i) => (i === indexToUpdate ? { href, title } : tab));
    });
  }, [hydrated, href, titleContext]);

  useEffect(() => {
    if (!hydrated) return;
    setTabs((prev) => {
      let changed = false;
      const next = prev.map((tab) => {
        const title = workspaceTitle(tab.href, titleContext);
        if (tab.title === title) return tab;
        changed = true;
        return { ...tab, title };
      });
      return changed ? next : prev;
    });
  }, [hydrated, titleContext]);

  useEffect(() => {
    if (!hydrated) return;
    sessionStorage.setItem(workspaceTabsStorageKey(resolvedArea), JSON.stringify(tabs));
  }, [hydrated, resolvedArea, tabs]);

  useEffect(() => {
    if (!hydrated) return;
    sessionStorage.setItem(
      workspaceSplitStorageKey(resolvedArea),
      JSON.stringify({ split, splitHref, splitRatio }),
    );
  }, [hydrated, resolvedArea, split, splitHref, splitRatio]);

  const openTab = useCallback(
    (nextHref: string, options?: { background?: boolean }) => {
      const normalized = normalizeWorkspaceHref(nextHref);
      if (!options?.background) {
        pendingOpenRef.current = normalized;
        activeTabHrefRef.current = normalized;
      }
      setTabs((prev) => {
        if (findWorkspaceTabIndex(prev, normalized) >= 0) return prev;
        return [...prev, { href: normalized, title: workspaceTitle(normalized, titleContext) }];
      });
      if (!options?.background && routerReadyRef.current) {
        markNavigationPending();
        router.push(normalized);
      }
    },
    [router, titleContext],
  );

  const closeTab = useCallback(
    (targetHref: string) => {
      const next = tabs.filter((tab) => !workspaceTabMatches(tab.href, targetHref));
      let navigateTo: string | null = null;
      if (workspaceTabMatches(targetHref, href) && next.length > 0) {
        const closedIndex = findWorkspaceTabIndex(tabs, targetHref);
        const fallback = next[Math.min(closedIndex, next.length - 1)] ?? next[0];
        navigateTo = fallback?.href ?? null;
      }

      setTabs(next);
      setSplitHrefState((current) =>
        current != null && workspaceTabMatches(current, targetHref) ? null : current,
      );

      if (navigateTo && routerReadyRef.current) {
        pendingFocusRef.current = navigateTo;
        activeTabHrefRef.current = navigateTo;
        markNavigationPending();
        router.push(navigateTo);
      } else if (targetHref === href) {
        activeTabHrefRef.current = null;
      }
    },
    [href, router, tabs],
  );

  const focusTab = useCallback(
    (targetHref: string) => {
      const normalized = normalizeWorkspaceHref(targetHref);
      pendingFocusRef.current = normalized;
      activeTabHrefRef.current = normalized;
      if (routerReadyRef.current) {
        markNavigationPending();
        router.push(normalized);
      }
    },
    [router],
  );

  const setSplitHref = useCallback((next: string | null) => {
    setSplitHrefState(next ? normalizeWorkspaceHref(next) : null);
  }, []);

  const setSplitRatio = useCallback((ratio: number) => {
    setSplitRatioState(Math.min(75, Math.max(25, ratio)));
  }, []);

  const toggleSplit = useCallback(() => {
    if (split) {
      setSplit(false);
      return;
    }
    setSplit(true);
    // Right pane starts empty — user picks a page via the right tab bar or + menu.
    setSplitHrefState(null);
  }, [split]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a');
      if (!anchor) return;
      const rawHref = anchor.getAttribute('href');
      if (!rawHref || !isInternalWorkspaceHref(rawHref)) return;
      if (anchor.target === '_blank') return;
      if (!(event.metaKey || event.ctrlKey || event.button === 1)) return;
      event.preventDefault();
      openTab(rawHref, { background: true });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [openTab]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '\\') return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      toggleSplit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSplit]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      area: resolvedArea,
      tabs,
      activeHref: href,
      split,
      splitHref,
      splitRatio,
      openTab,
      closeTab,
      focusTab,
      setSplitHref,
      setSplitRatio,
      toggleSplit,
    }),
    [
      resolvedArea,
      tabs,
      href,
      split,
      splitHref,
      splitRatio,
      openTab,
      closeTab,
      focusTab,
      setSplitHref,
      setSplitRatio,
      toggleSplit,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function isWorkspaceEmbedSearch(searchParams: URLSearchParams | { get: (key: string) => string | null }) {
  return searchParams.get('embed') === '1';
}

export { stripEmbedParam };
