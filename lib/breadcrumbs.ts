import { teamOverviewHref } from '@/lib/stages';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type BreadcrumbDynamicLabels = {
  teamNames?: Record<string, string>;
  candidateNames?: Record<string, string>;
  interviewProgress?: Record<string, { current: number; total: number }>;
};

const ADMIN_SEGMENT_LABELS: Record<string, string> = {
  applications: 'Applications',
  advancements: 'Advancements',
  import: 'Import CSV',
  users: 'People',
  assignments: 'Assignments',
  finalize: 'Finalize results',
  'interview-results': 'Interview results',
  communications: 'Applicant outcome emails',
  schedule: 'Schedule',
  'interview-setup': 'Setup interview',
  setup: 'Setup',
  'grader-preview': 'Grader preview',
  deliberations: 'Deliberations',
  'final-selection': 'Final selection',
};

const TEAM_SEGMENT_LABELS: Record<string, string> = {
  grade: 'Application grading',
  interviews: 'Interviews',
  advancement: 'Advancement',
  deliberations: 'Deliberations',
  'final-selection': 'Final selection',
  'first-round': 'Advance to Final Round',
  first_round: 'First Round Interview',
  final_round: 'Final Round Interview',
};

function finalizeCrumbs(crumbs: BreadcrumbItem[]): BreadcrumbItem[] {
  if (crumbs.length === 0) return crumbs;
  return crumbs.map((crumb, index) =>
    index === crumbs.length - 1 ? { label: crumb.label } : crumb,
  );
}

function buildAdminBreadcrumbs(
  parts: string[],
  dynamic: BreadcrumbDynamicLabels,
): BreadcrumbItem[] {
  const isDashboardHome =
    parts.length === 1 || (parts.length === 2 && parts[1] === 'dashboard');
  if (isDashboardHome) {
    return [{ label: 'Dashboard' }];
  }

  const crumbs: BreadcrumbItem[] = [{ label: 'Dashboard', href: '/admin/dashboard' }];
  let index = 1;

  while (index < parts.length) {
    const segment = parts[index];

    if (segment === 'dashboard') {
      index += 1;
      continue;
    }

    if (segment === 'teams' && parts[index + 1] && /^\d+$/.test(parts[index + 1])) {
      const teamId = parts[index + 1];
      const href = `/admin/teams/${teamId}`;
      const hasMore = index + 2 < parts.length;
      crumbs.push({
        label: dynamic.teamNames?.[teamId] ?? `Team ${teamId}`,
        href: hasMore ? href : undefined,
      });
      index += 2;
      continue;
    }

    if (segment === 'schedule' && parts[index + 1] === 'first-round') {
      crumbs.push({ label: 'First Round Interview schedule' });
      index += 2;
      continue;
    }

    if (segment === 'schedule' && parts[index + 1] === 'final-round') {
      crumbs.push({ label: 'Final Round Interview schedule' });
      index += 2;
      continue;
    }

    if (segment === 'interview-setup') {
      crumbs.push({ label: 'Setup interview' });
      index += 1;
      continue;
    }

    const href = `/admin/${parts.slice(1, index + 1).join('/')}`;
    crumbs.push({
      label: ADMIN_SEGMENT_LABELS[segment] ?? segment,
      href: index < parts.length - 1 ? href : undefined,
    });
    index += 1;
  }

  return finalizeCrumbs(crumbs);
}

function buildTeamBreadcrumbs(
  parts: string[],
  dynamic: BreadcrumbDynamicLabels,
): BreadcrumbItem[] {
  // /team — multi-team picker (breadcrumbs hidden on this route; label for completeness)
  if (parts.length === 1) {
    return [{ label: 'Your teams' }];
  }

  if (parts[1] === 'final-selection') {
    return [
      { label: 'Your teams', href: '/team' },
      { label: 'Final selection' },
    ];
  }

  const teamId = parts[1];
  if (!/^\d+$/.test(teamId)) {
    return [{ label: 'Your teams', href: '/team' }];
  }

  const teamName = dynamic.teamNames?.[teamId] ?? `Team ${teamId}`;
  const teamHref = teamOverviewHref(Number.parseInt(teamId, 10));

  // /team/[teamId] — team dashboard
  if (parts.length === 2) {
    return [{ label: teamName }];
  }

  const crumbs: BreadcrumbItem[] = [{ label: teamName, href: teamHref }];
  let index = 2;

  while (index < parts.length) {
    const segment = parts[index];

    if (segment === 'interviews') {
      const stage = parts[index + 1];
      const hasStage = stage === 'first_round' || stage === 'final_round';
      const hasApplicationId =
        hasStage && parts[index + 2] && /^\d+$/.test(parts[index + 2]);
      const interviewsHref = hasStage
        ? `/team/${teamId}/interviews/${stage}`
        : `/team/${teamId}/interviews/${stage ?? 'first_round'}`;

      crumbs.push({
        label: TEAM_SEGMENT_LABELS.interviews,
        href: hasApplicationId ? interviewsHref : undefined,
      });
      index += 1;
      continue;
    }

    if (segment === 'first_round' || segment === 'final_round') {
      const hasApplicationId = parts[index + 1] && /^\d+$/.test(parts[index + 1]);
      const stageHref = `/team/${teamId}/interviews/${segment}`;

      crumbs.push({
        label: TEAM_SEGMENT_LABELS[segment],
        href: hasApplicationId ? stageHref : undefined,
      });
      index += 1;
      continue;
    }

    if (
      (parts[index - 1] === 'first_round' || parts[index - 1] === 'final_round') &&
      parts[index - 2] === 'interviews' &&
      /^\d+$/.test(segment)
    ) {
      const progress = dynamic.interviewProgress?.[segment];
      crumbs.push({
        label: progress
          ? `Interview ${progress.current} of ${progress.total}`
          : 'Score interview',
      });
      index += 1;
      continue;
    }

    if (segment === 'grade' && parts[index + 1] && /^\d+$/.test(parts[index + 1])) {
      crumbs.push({ label: TEAM_SEGMENT_LABELS.grade });
      index += 2;
      continue;
    }

    if (segment === 'grade') {
      crumbs.push({ label: TEAM_SEGMENT_LABELS.grade });
      index += 1;
      continue;
    }

    if (segment === 'advancement' && parts[index + 1] === 'first-round') {
      crumbs.push({ label: TEAM_SEGMENT_LABELS['first-round'] });
      index += 2;
      continue;
    }

    const href = `/team/${parts.slice(1, index + 1).join('/')}`;
    crumbs.push({
      label: TEAM_SEGMENT_LABELS[segment] ?? segment,
      href: index < parts.length - 1 ? href : undefined,
    });
    index += 1;
  }

  return finalizeCrumbs(crumbs);
}

export function buildBreadcrumbs(
  pathname: string,
  dynamic: BreadcrumbDynamicLabels = {},
): BreadcrumbItem[] {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return [];

  if (parts[0] === 'admin') {
    return buildAdminBreadcrumbs(parts, dynamic);
  }

  if (parts[0] === 'team') {
    return buildTeamBreadcrumbs(parts, dynamic);
  }

  return [];
}

export function parseInterviewScorePath(pathname: string): {
  teamId: string;
  stage: 'first_round' | 'final_round';
  applicationId: string;
} | null {
  const match = pathname.match(/^\/team\/(\d+)\/interviews\/(first_round|final_round)\/(\d+)/);
  if (!match) return null;
  return {
    teamId: match[1],
    stage: match[2] as 'first_round' | 'final_round',
    applicationId: match[3],
  };
}

export function extractTeamIdFromPath(pathname: string): string | null {
  const adminMatch = pathname.match(/\/admin\/teams\/(\d+)/);
  if (adminMatch) return adminMatch[1];

  const teamMatch = pathname.match(/^\/team\/(\d+)/);
  if (teamMatch) return teamMatch[1];

  return null;
}

/** Show breadcrumbs on nested or checklist-linked admin routes. */
export function shouldShowBreadcrumbs(pathname: string): boolean {
  if (pathname.startsWith('/admin/teams/')) return true;
  if (pathname === '/admin/deliberations' || pathname.startsWith('/admin/deliberations/')) {
    return true;
  }
  if (pathname === '/admin/communications') return true;
  if (pathname === '/admin/final-selection' || pathname.startsWith('/admin/final-selection/')) {
    return true;
  }
  return false;
}
