/** Query + session helpers for the admin deliberations multi-tab workspace. */

export const DELIBERATIONS_WORKSPACE_PATH = '/admin/deliberations';
export const DELIBERATIONS_TABS_STORAGE_KEY = 'admin-deliberations-tabs';

export function parseDeliberationsTabIds(value: string | null | undefined): number[] {
  if (!value) return [];
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const part of value.split(',')) {
    const id = Number.parseInt(part.trim(), 10);
    if (!Number.isFinite(id) || id < 1 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function serializeDeliberationsTabIds(ids: number[]): string {
  return ids.join(',');
}

export function deliberationsWorkspaceHref(options?: {
  tabs?: number[];
  active?: number | null;
  open?: number | null;
}): string {
  const params = new URLSearchParams();
  const tabs = options?.tabs?.filter((id) => Number.isFinite(id) && id >= 1) ?? [];
  if (tabs.length > 0) {
    params.set('tabs', serializeDeliberationsTabIds(tabs));
  }
  if (options?.active != null && options.active >= 1) {
    params.set('active', String(options.active));
  }
  if (options?.open != null && options.open >= 1) {
    params.set('open', String(options.open));
  }
  const qs = params.toString();
  return qs ? `${DELIBERATIONS_WORKSPACE_PATH}?${qs}` : DELIBERATIONS_WORKSPACE_PATH;
}

/** Deep-link / checklist helper: open (or focus) one team in the workspace. */
export function openTeamDeliberationsHref(teamId: number): string {
  return deliberationsWorkspaceHref({ open: teamId });
}

export function readStoredDeliberationsTabIds(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    return parseDeliberationsTabIds(sessionStorage.getItem(DELIBERATIONS_TABS_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeStoredDeliberationsTabIds(ids: number[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (ids.length === 0) {
      sessionStorage.removeItem(DELIBERATIONS_TABS_STORAGE_KEY);
    } else {
      sessionStorage.setItem(DELIBERATIONS_TABS_STORAGE_KEY, serializeDeliberationsTabIds(ids));
    }
  } catch {
    // Ignore quota / private mode failures.
  }
}
