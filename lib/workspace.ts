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

export function workspaceTitle(hrefOrPathname: string): string {
  const { pathname, search } = splitHrefParts(hrefOrPathname);
  const view = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('view');

  if (pathname === '/admin/dashboard' || pathname === '/admin') {
    if (view === 'first-round') return 'First Round Interview';
    if (view === 'final-round') return 'Final Round Interview';
    if (view === 'deliberations') return 'Deliberations';
    return 'Dashboard';
  }
  if (pathname === '/admin/advancements') return 'Advancements';
  if (pathname === '/admin/applications') return 'Applications';
  if (pathname === '/admin/users') return 'Users';
  if (pathname === '/admin/users/new') return 'New user';
  if (pathname === '/admin/coffee-chats' || pathname === '/coffee-chats') return 'Coffee Chats';
  if (pathname === '/admin/import') return 'Import';
  if (pathname === '/admin/communications') return 'Emails';
  if (pathname === '/admin/phases/application') return 'Application';
  if (pathname === '/admin/final-selection' || pathname.startsWith('/admin/final-selection/')) {
    return 'Final selection';
  }
  if (pathname.startsWith('/admin/deliberations')) return 'Deliberations';
  if (pathname === '/team') return 'Home';
  if (pathname === '/team/final-selection') return 'Final selection';

  const adminTeam = pathname.match(/^\/admin\/teams\/(\d+)(?:\/(.+))?$/);
  if (adminTeam) {
    const rest = adminTeam[2] ?? '';
    if (!rest) return 'Team';
    if (rest.startsWith('communications')) return 'Team emails';
    if (rest.startsWith('interview-setup')) return 'Interview setup';
    if (rest.startsWith('interview-results')) return 'Interview results';
    if (rest.startsWith('assignments')) return 'Assignments';
    if (rest.startsWith('finalize')) return 'Finalize';
    if (rest.includes('schedule')) return 'Schedule';
    return rest.split('/')[0]?.replace(/-/g, ' ') ?? 'Team';
  }

  const teamPath = pathname.match(/^\/team\/(\d+)(?:\/(.+))?$/);
  if (teamPath) {
    const rest = teamPath[2] ?? '';
    if (!rest) return 'Overview';
    if (rest.startsWith('grade')) return 'Grading';
    if (rest.startsWith('advancement')) return 'Advancement';
    if (rest.startsWith('deliberations')) return 'Deliberations';
    if (rest.includes('interviews/first')) return 'First Round';
    if (rest.includes('interviews/final')) return 'Final Round';
    return rest.split('/')[0]?.replace(/-/g, ' ') ?? 'Team';
  }

  const last = pathname.split('/').filter(Boolean).pop() ?? 'Page';
  return last.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
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
  { title: 'Final selection', href: '/admin/final-selection' },
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
