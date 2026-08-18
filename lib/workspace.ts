import {
  adminPhaseHref,
  PIPELINE_PHASES,
  teamOverviewHref,
  teamPhaseHref,
} from '@/lib/stages';

export const WORKSPACE_EMBED_PARAM = 'embed';
export const WORKSPACE_TABS_KEY = 'uma-workspace-tabs';
export const WORKSPACE_SPLIT_KEY = 'uma-workspace-split';

export type WorkspaceArea = 'admin' | 'team';

export interface WorkspaceTab {
  href: string;
  title: string;
}

export interface WorkspaceDestination {
  title: string;
  href: string;
}

export function workspaceAreaFromPathname(pathname: string): WorkspaceArea {
  return pathname.startsWith('/admin') ? 'admin' : 'team';
}

export function workspaceTabsStorageKey(area: WorkspaceArea): string {
  return `${WORKSPACE_TABS_KEY}:${area}`;
}

export function workspaceSplitStorageKey(area: WorkspaceArea): string {
  return `${WORKSPACE_SPLIT_KEY}:${area}`;
}

export function stripEmbedParam(href: string): string {
  try {
    const url = new URL(href, 'http://local.invalid');
    url.searchParams.delete(WORKSPACE_EMBED_PARAM);
    const search = url.searchParams.toString();
    return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
  } catch {
    return href;
  }
}

export function withEmbedParam(href: string): string {
  try {
    const url = new URL(href, 'http://local.invalid');
    url.searchParams.set(WORKSPACE_EMBED_PARAM, '1');
    return `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
  } catch {
    return href;
  }
}

export function normalizeWorkspaceHref(href: string): string {
  const stripped = stripEmbedParam(href);
  try {
    const url = new URL(stripped, 'http://local.invalid');
    const search = url.searchParams.toString();
    return `${url.pathname}${search ? `?${search}` : ''}`;
  } catch {
    return stripped.split('#')[0] ?? stripped;
  }
}

/** Whether a stored workspace tab refers to the same page as the current URL. */
export function workspaceTabMatches(storedHref: string, currentHref: string): boolean {
  const stored = normalizeWorkspaceHref(storedHref);
  const current = normalizeWorkspaceHref(currentHref);
  if (stored === current) return true;

  const { pathname: storedPath } = splitHrefParts(stored);
  const { pathname: currentPath } = splitHrefParts(current);
  if (storedPath !== currentPath) return false;

  // Deliberations mutates ?tabs/?active via replaceState — one outer tab.
  if (storedPath === '/admin/deliberations') return true;

  // Dashboard phase hub: ?view= swaps content on the same tab.
  if (storedPath === '/admin/dashboard') return true;

  // Team hub root: ?view= swaps phase preview on the same tab.
  if (/^\/admin\/teams\/\d+$/.test(storedPath)) return true;

  return false;
}

export function findWorkspaceTabIndex(tabs: WorkspaceTab[], href: string): number {
  return tabs.findIndex((tab) => workspaceTabMatches(tab.href, href));
}

function splitHrefParts(hrefOrPathname: string): { pathname: string; search: string } {
  try {
    const url = new URL(hrefOrPathname, 'http://local.invalid');
    return { pathname: url.pathname, search: url.search };
  } catch {
    const q = hrefOrPathname.indexOf('?');
    if (q >= 0) {
      return { pathname: hrefOrPathname.slice(0, q), search: hrefOrPathname.slice(q) };
    }
    return { pathname: hrefOrPathname, search: '' };
  }
}

export type WorkspaceTitleContext = {
  teamNames?: Record<string, string>;
};

function titleCase(value: string): string {
  if (!value) return 'Page';
  return value.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function resolveTeamName(teamId: string, context: WorkspaceTitleContext): string {
  return context.teamNames?.[teamId] ?? `Team ${teamId}`;
}

function teamTabTitle(teamId: string, page: string, context: WorkspaceTitleContext): string {
  return `${resolveTeamName(teamId, context)} · ${page}`;
}

function adminTeamPageLabel(rest: string): string {
  if (rest.startsWith('communications')) return 'Emails';
  if (rest.startsWith('interview-setup')) return 'Interview Setup';
  if (rest.startsWith('interview-preview')) return 'Preview';
  if (rest.startsWith('interview-results')) return 'Results';
  if (rest.startsWith('assignments')) return 'Assignments';
  if (rest.startsWith('finalize')) return 'Finalize';
  if (rest.startsWith('schedule/first-round')) return 'First Round Schedule';
  if (rest.startsWith('schedule/final-round')) return 'Final Round Schedule';
  if (rest.includes('schedule')) return 'Schedule';
  if (rest.startsWith('grader-preview')) return 'Grader Preview';
  return titleCase((rest.split('/')[0] ?? '').replace(/-/g, ' '));
}

function teamPortalPageLabel(rest: string): string {
  if (rest.startsWith('grade')) return 'Grading';
  if (rest.startsWith('advancement')) return 'Advancement';
  if (rest.startsWith('deliberations')) return 'Deliberations';
  if (rest.startsWith('final-selection')) return 'Final Selection';
  if (rest.includes('interviews/first_round')) {
    return /\/\d+/.test(rest) ? 'Interview' : 'First Round';
  }
  if (rest.includes('interviews/final_round')) {
    return /\/\d+/.test(rest) ? 'Interview' : 'Final Round';
  }
  if (rest.startsWith('interviews')) return 'Interviews';
  return titleCase((rest.split('/')[0] ?? '').replace(/-/g, ' '));
}

export function workspaceTitle(
  hrefOrPathname: string,
  context: WorkspaceTitleContext = {},
): string {
  const { pathname, search } = splitHrefParts(hrefOrPathname);
  const view = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('view');

  if (pathname === '/admin/dashboard' || pathname === '/admin') {
    if (view === 'first-round') return 'First Round';
    if (view === 'final-round') return 'Final Round';
    if (view === 'deliberations') return 'Deliberations';
    return 'Dashboard';
  }
  if (pathname === '/admin/advancements') return 'Advancements';
  if (pathname === '/admin/applications') return 'Applications';
  if (pathname === '/admin/users') return 'Users';
  if (pathname === '/admin/users/new') return 'New User';
  if (pathname === '/admin/coffee-chats' || pathname === '/coffee-chats') return 'Coffee Chats';
  if (pathname === '/admin/import') return 'Import';
  if (pathname === '/admin/communications') return 'Emails';
  if (pathname === '/admin/phases/application') return 'Application';
  if (pathname === '/admin/final-selection' || pathname.startsWith('/admin/final-selection/')) {
    return 'Final Selection';
  }
  if (pathname.startsWith('/admin/deliberations')) return 'Deliberations';
  if (pathname === '/team') return 'Your Teams';
  if (pathname === '/team/final-selection') return 'Final Selection';

  const adminTeam = pathname.match(/^\/admin\/teams\/(\d+)(?:\/(.+))?$/);
  if (adminTeam) {
    const teamId = adminTeam[1]!;
    const rest = adminTeam[2] ?? '';
    if (!rest) return resolveTeamName(teamId, context);
    return teamTabTitle(teamId, adminTeamPageLabel(rest), context);
  }

  const teamPath = pathname.match(/^\/team\/(\d+)(?:\/(.+))?$/);
  if (teamPath) {
    const teamId = teamPath[1]!;
    const rest = teamPath[2] ?? '';
    if (!rest) return resolveTeamName(teamId, context);
    return teamTabTitle(teamId, teamPortalPageLabel(rest), context);
  }

  const last = pathname.split('/').filter(Boolean).pop() ?? 'Page';
  return titleCase(last.replace(/-/g, ' '));
}

export function isInternalWorkspaceHref(href: string): boolean {
  if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
  if (href.startsWith('http://') || href.startsWith('https://')) return false;
  if (href.startsWith('#')) return false;
  return href.startsWith('/');
}

function dedupeDestinations(items: WorkspaceDestination[]): WorkspaceDestination[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeWorkspaceHref(item.href);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const ADMIN_WORKSPACE_DESTINATIONS: WorkspaceDestination[] = [
  { title: 'Dashboard', href: '/admin/dashboard' },
  { title: 'Coffee Chats', href: '/admin/coffee-chats' },
  { title: 'Application', href: '/admin/phases/application' },
  { title: 'First Round Interview', href: adminPhaseHref('first_round') },
  { title: 'Final Round Interview', href: adminPhaseHref('final_round') },
  { title: 'Deliberations', href: '/admin/deliberations' },
  { title: 'Advancements', href: '/admin/advancements' },
  { title: 'Applications', href: '/admin/applications' },
  { title: 'Users', href: '/admin/users' },
  { title: 'Import', href: '/admin/import' },
  { title: 'Emails', href: '/admin/communications' },
  { title: 'Final Selection', href: '/admin/final-selection' },
];

/** Sidebar-style pages available for the workspace "+" menu (derived from current route). */
export function workspaceDestinations(
  pathname: string,
  area?: WorkspaceArea,
): WorkspaceDestination[] {
  const resolvedArea = area ?? workspaceAreaFromPathname(pathname);
  if (resolvedArea === 'admin') {
    return dedupeDestinations(ADMIN_WORKSPACE_DESTINATIONS);
  }

  const teamMatch = pathname.match(/^\/team\/(\d+)/);
  if (teamMatch) {
    const teamId = Number.parseInt(teamMatch[1], 10);
    const destinations: WorkspaceDestination[] = [
      { title: 'Overview', href: teamOverviewHref(teamId) },
    ];
    for (const phase of PIPELINE_PHASES) {
      if (phase.status === 'closed') continue;
      const href = teamPhaseHref(teamId, phase.status);
      if (href) destinations.push({ title: phase.label, href });
    }
    return dedupeDestinations(destinations);
  }

  if (pathname === '/coffee-chats' || pathname.startsWith('/team')) {
    return [
      { title: 'Home', href: '/team' },
      { title: 'Coffee Chats', href: '/coffee-chats' },
    ];
  }

  return [{ title: 'Coffee Chats', href: '/coffee-chats' }];
}
