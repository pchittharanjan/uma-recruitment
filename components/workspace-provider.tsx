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
import { useBrowserSearch } from '@/hooks/use-workspace-embed';
import {
  isInternalWorkspaceHref,
  normalizeWorkspaceHref,
  stripEmbedParam,
  workspaceAreaFromPathname,
  workspaceSplitStorageKey,
  workspaceTabsStorageKey,
  workspaceTitle,
  type WorkspaceArea,
  type WorkspaceTab,
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
  const href = currentHref(pathname, search);
  const resolvedArea = area ?? workspaceAreaFromPathname(pathname);

  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [split, setSplit] = useState(false);
  const [splitHref, setSplitHrefState] = useState<string | null>(null);
  const [splitRatio, setSplitRatioState] = useState(50);
  const [hydrated, setHydrated] = useState(false);
  /** Last tab the left pane was showing — used to update that tab in place on nav. */
  const activeTabHrefRef = useRef<string | null>(null);
  /** Set by openTab before router.push so the sync effect does not replace in place. */
  const pendingOpenRef = useRef<string | null>(null);

  useEffect(() => {
    const storedTabs = readStoredTabs(resolvedArea);
    const storedSplit = readStoredSplit(resolvedArea);
    setTabs(storedTabs);
    setSplit(storedSplit.split);
    setSplitHrefState(storedSplit.splitHref);
    setSplitRatioState(storedSplit.splitRatio);
    activeTabHrefRef.current = null;
    pendingOpenRef.current = null;
    setHydrated(true);
  }, [resolvedArea]);

  // Keep the active tab's href/title in sync with the current route.
  // Do NOT append a tab on every navigation — only openTab (+ / Open) adds tabs.
  useEffect(() => {
    if (!hydrated) return;
    const title = workspaceTitle(href);
    setTabs((prev) => {
      const existingIndex = prev.findIndex((tab) => tab.href === href);
      if (existingIndex >= 0) {
        pendingOpenRef.current = null;
        activeTabHrefRef.current = href;
        const existing = prev[existingIndex]!;
        return existing.title === title
          ? prev
          : prev.map((tab, i) => (i === existingIndex ? { ...tab, title } : tab));
      }

      // Explicit Open / + : openTab owns appending; skip in-place replace.
      if (pendingOpenRef.current === href) {
        pendingOpenRef.current = null;
        activeTabHrefRef.current = href;
        return prev.some((tab) => tab.href === href)
          ? prev
          : [...prev, { href, title }];
      }

      if (prev.length === 0) {
        activeTabHrefRef.current = href;
        return [{ href, title }];
      }

      const activeIndex = prev.findIndex((tab) => tab.href === activeTabHrefRef.current);
      const indexToUpdate = activeIndex >= 0 ? activeIndex : 0;
      activeTabHrefRef.current = href;
      return prev.map((tab, i) => (i === indexToUpdate ? { href, title } : tab));
    });
  }, [hydrated, href]);

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
        if (prev.some((tab) => tab.href === normalized)) return prev;
        return [...prev, { href: normalized, title: workspaceTitle(normalized) }];
      });
      if (!options?.background) router.push(normalized);
    },
    [router],
  );

  const closeTab = useCallback(
    (targetHref: string) => {
      const next = tabs.filter((tab) => tab.href !== targetHref);
      let navigateTo: string | null = null;
      if (targetHref === href && next.length > 0) {
        const closedIndex = tabs.findIndex((tab) => tab.href === targetHref);
        const fallback = next[Math.min(closedIndex, next.length - 1)] ?? next[0];
        navigateTo = fallback?.href ?? null;
      }

      setTabs(next);
      setSplitHrefState((current) => (current === targetHref ? null : current));

      if (navigateTo) {
        activeTabHrefRef.current = navigateTo;
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
      activeTabHrefRef.current = normalized;
      router.push(normalized);
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
