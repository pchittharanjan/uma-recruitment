'use client';

import { useSyncExternalStore } from 'react';
import { WORKSPACE_EMBED_PARAM } from '@/lib/workspace';

type Listener = () => void;

const listeners = new Set<Listener>();
let patched = false;
let emitScheduled = false;

function flush() {
  emitScheduled = false;
  for (const listener of listeners) listener();
}

/** Defer so history patches during React useInsertionEffect don't setState sync. */
function emit() {
  if (emitScheduled) return;
  emitScheduled = true;
  queueMicrotask(flush);
}

function patchHistory() {
  if (patched || typeof window === 'undefined') return;
  patched = true;

  const wrap = (method: 'pushState' | 'replaceState') => {
    const original = history[method];
    history[method] = function (
      this: History,
      ...args: Parameters<History['pushState']>
    ) {
      const result = original.apply(this, args);
      emit();
      return result;
    };
  };

  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', emit);
}

function subscribe(listener: Listener) {
  patchHistory();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSearch() {
  return window.location.search;
}

function getServerSearch() {
  return '';
}

function subscribeIsClient() {
  return () => {};
}

function getIsClient() {
  return true;
}

function getIsServer() {
  return false;
}

/** Current `window.location.search` (`?…` or `''`). SSR / hydration always `''`. */
export function useBrowserSearch(): string {
  return useSyncExternalStore(subscribe, getSearch, getServerSearch);
}

/** True when this page is the workspace split-view iframe (`?embed=1`). */
export function useWorkspaceEmbed(): boolean {
  const search = useBrowserSearch();
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  );
  return params.get(WORKSPACE_EMBED_PARAM) === '1';
}

/** False on the server and during hydration; true after the client snapshot. */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribeIsClient, getIsClient, getIsServer);
}
