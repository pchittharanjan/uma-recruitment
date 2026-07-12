import type { ApplicationStage, AssignmentStage, RoundStatus } from '@/lib/db';

/** Phases shown in the admin phase stepper (in order). */
export const PIPELINE_PHASES: Array<{
  status: RoundStatus;
  label: string;
  shortLabel: string;
  unlockKey?: UnlockableStage;
}> = [
  { status: 'pre_application', label: 'Coffee Chats', shortLabel: 'Coffee' },
  {
    status: 'application',
    label: 'Application',
    shortLabel: 'Apps',
    unlockKey: 'application',
  },
  {
    status: 'first_round',
    label: 'First Round Interview',
    shortLabel: '1st',
    unlockKey: 'first_round',
  },
  {
    status: 'final_round',
    label: 'Final Round Interview',
    shortLabel: 'Final',
    unlockKey: 'final_round',
  },
  {
    status: 'deliberations',
    label: 'Deliberations',
    shortLabel: 'Delibs',
    unlockKey: 'deliberations',
  },
  { status: 'closed', label: 'Closed', shortLabel: 'Done' },
];

export type UnlockableStage = AssignmentStage | 'deliberations';

export const UNLOCKABLE_STAGES: UnlockableStage[] = [
  'application',
  'first_round',
  'final_round',
  'deliberations',
];

const STATUS_ORDER: RoundStatus[] = [
  'setup',
  'pre_application',
  'application',
  'first_round',
  'final_round',
  'deliberations',
  'closed',
];

export function statusIndex(status: RoundStatus): number {
  const idx = STATUS_ORDER.indexOf(status);
  return idx === -1 ? 0 : idx;
}

export function isRoundAtOrPastStatus(current: RoundStatus, target: RoundStatus): boolean {
  return statusIndex(current) >= statusIndex(target);
}

/** Map round status to the unlock key that gates grader work at that phase. */
export function unlockKeyForStatus(status: RoundStatus): UnlockableStage | null {
  const phase = PIPELINE_PHASES.find((p) => p.status === status);
  return phase?.unlockKey ?? null;
}

export function nextRoundStatus(current: RoundStatus): RoundStatus | null {
  const idx = statusIndex(current);
  if (idx < 0 || idx >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[idx + 1];
}

export function phaseLabel(status: RoundStatus): string {
  return PIPELINE_PHASES.find((p) => p.status === status)?.label ?? status;
}

export function assignmentStageLabel(stage: AssignmentStage): string {
  switch (stage) {
    case 'application':
      return 'Application grading';
    case 'first_round':
      return 'First Round Interview';
    case 'final_round':
      return 'Final Round Interview';
    default:
      return stage;
  }
}

/** Team portal work-queue nouns — grading/scoring language instead of "assignments". */
export function workItemNoun(stage: AssignmentStage, count: number): string {
  switch (stage) {
    case 'application':
      return count === 1 ? 'application' : 'applications';
    case 'first_round':
    case 'final_round':
      return count === 1 ? 'interview' : 'interviews';
    default:
      return count === 1 ? 'item' : 'items';
  }
}

export function yourWorkCardLabel(stage: AssignmentStage): string {
  switch (stage) {
    case 'application':
      return 'Your applications';
    case 'first_round':
    case 'final_round':
      return 'Your interviews';
    default:
      return 'Your work';
  }
}

export function workEmptyState(stage: AssignmentStage): string {
  switch (stage) {
    case 'application':
      return 'No applications to grade in this phase';
    case 'first_round':
    case 'final_round':
      return 'No interviews to score in this phase';
    default:
      return 'Nothing for you in this phase';
  }
}

export function workCompleteState(stage: AssignmentStage): string {
  switch (stage) {
    case 'application':
      return 'All applications graded';
    case 'first_round':
    case 'final_round':
      return 'All interviews scored';
    default:
      return 'All work complete';
  }
}

/** Compact status when the team has moved past a work stage. */
export function pastPhaseWorkSummary(
  stage: AssignmentStage,
  userCompleted: number,
  userTotal: number,
  teamCompleted: number,
  teamTotal: number,
): string {
  const verbPast = stage === 'application' ? 'graded' : 'scored';

  if (userTotal > 0) {
    return `${userCompleted} ${verbPast} · Phase complete`;
  }

  if (teamTotal > 0 && teamCompleted >= teamTotal) {
    switch (stage) {
      case 'application':
        return 'All applications graded · Phase complete';
      case 'first_round':
      case 'final_round':
        return 'All interviews scored · Phase complete';
    }
  }

  if (teamTotal > 0) {
    return `${teamCompleted} ${verbPast} · Phase complete`;
  }

  return 'Phase complete';
}

export function pendingWorkLabel(stage: AssignmentStage): string {
  switch (stage) {
    case 'application':
      return 'application to grade';
    case 'first_round':
    case 'final_round':
      return 'interview to score';
    default:
      return 'item pending';
  }
}

export function workActionVerb(stage: AssignmentStage): 'grade' | 'score' {
  return stage === 'application' ? 'grade' : 'score';
}

/** User work-queue status — Not started / In progress / Completed. */
export type WorkStatus = 'not_started' | 'in_progress' | 'completed';

export const WORK_STATUS_DISPLAY: Record<WorkStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

export type WorkStatusBadgeColor = 'gray' | 'yellow' | 'green';

/**
 * Resolve aggregate work status from pending/total counts.
 * Returns null when total is 0 (no work assigned).
 */
export function resolveWorkStatus(
  pending: number,
  total: number,
  started?: boolean,
): WorkStatus | null {
  if (total === 0) return null;
  const completed = total - pending;
  if (pending === 0) return 'completed';
  if (completed === 0 && !started) return 'not_started';
  return 'in_progress';
}

/** Display label for aggregate work status; null when there is no assigned work. */
export function workStatusLabel(
  pending: number,
  total: number,
  started?: boolean,
): string | null {
  const status = resolveWorkStatus(pending, total, started);
  return status ? WORK_STATUS_DISPLAY[status] : null;
}

export function workStatusBadgeColor(status: WorkStatus): WorkStatusBadgeColor {
  switch (status) {
    case 'not_started':
      return 'gray';
    case 'in_progress':
      return 'yellow';
    case 'completed':
      return 'green';
  }
}

/** Per-assignment status from API (`pending` | `completed`). */
export function assignmentWorkStatus(status: string): WorkStatus {
  return status === 'completed' ? 'completed' : 'not_started';
}

/** URL slug for admin phase hub pages. */
export const ADMIN_PHASE_SLUGS: Partial<Record<RoundStatus, string>> = {
  application: 'application',
  first_round: 'first-round',
  final_round: 'final-round',
  deliberations: 'deliberations',
};

const ADMIN_PHASE_PATH_PATTERNS: Partial<Record<RoundStatus, RegExp>> = {
  pre_application: /^\/admin\/(?:coffee-chats|import)(?:\/|$)/,
  application: /^\/admin\/phases\/application(?:\/|$)/,
  first_round: /^\/admin\/teams\/\d+\/schedule\/first-round(?:\/|$)/,
  deliberations: /^\/admin\/deliberations(?:\/|$)/,
};

/** Phases that share the dashboard as their nav target — only one should look active at a time. */
const ADMIN_DASHBOARD_PHASES: RoundStatus[] = [
  'first_round',
  'final_round',
  'deliberations',
];

export function isAdminDashboardPhase(status: RoundStatus): boolean {
  return ADMIN_DASHBOARD_PHASES.includes(status);
}

/** Admin sidebar / phase nav destination for each pipeline phase. */
export function adminPhaseHref(status: RoundStatus): string {
  switch (status) {
    case 'pre_application':
      return '/admin/coffee-chats';
    case 'application':
      return '/admin/phases/application';
    case 'first_round':
    case 'final_round':
    case 'deliberations': {
      const slug = ADMIN_PHASE_SLUGS[status];
      return slug ? `/admin/dashboard?view=${slug}` : '/admin/dashboard';
    }
    default:
      return '/admin/dashboard';
  }
}

export function parseDashboardViewPhase(
  viewParam: string | null,
  fallback: RoundStatus,
): RoundStatus {
  if (!viewParam) {
    // Closed has no team overview — land admin on deliberations instead of an empty shell.
    return fallback === 'closed' ? 'deliberations' : fallback;
  }
  return parseAdminPhaseSlug(viewParam) ?? (fallback === 'closed' ? 'deliberations' : fallback);
}

export function parseAdminPhaseSlug(slug: string): RoundStatus | null {
  for (const [status, phaseSlug] of Object.entries(ADMIN_PHASE_SLUGS)) {
    if (phaseSlug === slug) return status as RoundStatus;
  }
  return null;
}

export function isAdminPhaseNavActive(pathname: string, phaseStatus: RoundStatus): boolean {
  // Dashboard is shared by several phases; sidebar picks the current pipeline phase instead.
  if (pathname === '/admin/dashboard') return false;
  const pattern = ADMIN_PHASE_PATH_PATTERNS[phaseStatus];
  if (pattern?.test(pathname)) return true;
  const href = adminPhaseHref(phaseStatus);
  if (href === '/admin/dashboard') return false;
  return pathname === href;
}

/** Team overview dashboard (phase-neutral). */
export function teamOverviewHref(teamId: number): string {
  return `/team/${teamId}`;
}

/** Exec team portal destination for a pipeline phase (null when not available to Exec). */
export function teamPhaseHref(teamId: number, status: RoundStatus): string | null {
  switch (status) {
    case 'pre_application':
      return '/coffee-chats';
    case 'application':
      return `/team/${teamId}/grade`;
    case 'first_round':
      return `/team/${teamId}/interviews/first_round`;
    case 'final_round':
      return `/team/${teamId}/interviews/final_round`;
    case 'deliberations':
      return `/team/${teamId}/deliberations`;
    default:
      return null;
  }
}

/** Default exec landing when opening a team — current phase work, not the overview dashboard. */
export function teamLandingHref(teamId: number, status: RoundStatus): string {
  return teamPhaseHref(teamId, status) ?? teamOverviewHref(teamId);
}

export function isTeamOverviewPath(pathname: string): boolean {
  return /^\/team\/\d+\/?$/.test(pathname);
}

const TEAM_PHASE_PATH_PATTERNS: Partial<Record<RoundStatus, RegExp>> = {
  pre_application: /^\/coffee-chats(?:\/|$)/,
  application: /^\/team\/\d+\/(?:grade(?:\/\d+)?|advancement)(?:\/|$)/,
  first_round: /^\/team\/\d+\/(?:interviews\/first_round|advancement\/first-round)(?:\/|$)/,
  final_round: /^\/team\/\d+\/interviews\/final_round(?:\/|$)/,
  deliberations: /^\/team\/\d+\/deliberations(?:\/|$)/,
};

export function isTeamPhaseNavActive(
  pathname: string,
  phaseStatus: RoundStatus,
  options?: { teamCurrentStatus?: RoundStatus | null },
): boolean {
  if (isTeamOverviewPath(pathname) && options?.teamCurrentStatus) {
    return phaseStatus === options.teamCurrentStatus;
  }
  const pattern = TEAM_PHASE_PATH_PATTERNS[phaseStatus];
  return pattern?.test(pathname) ?? false;
}

export function applicationStageLabel(stage: ApplicationStage): string {
  switch (stage) {
    case 'application':
      return 'Application';
    case 'first_round':
      return 'First Round Interview';
    case 'final_round':
      return 'Final Round Interview';
    case 'deliberations':
      return 'Deliberations';
    case 'advanced':
      return 'Advanced';
    case 'rejected':
      return 'Rejected';
    default:
      return stage;
  }
}
