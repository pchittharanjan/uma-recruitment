/**
 * Route-keyed product tour steps. Copy is action-only: short title + optional
 * one imperative line. No welcome fluff.
 */

export type PageTourStep = {
  /** Matches `[data-tour="…"]` on the page. */
  id: string;
  /** 2–6 word action or region label. */
  title: string;
  /** Optional single imperative / explanatory sentence. */
  description?: string;
};

export type PageTourDefinition = {
  /** Pathname pattern; `:param` matches one segment. */
  pattern: string;
  steps: PageTourStep[];
};

function normalizePathname(pathname: string): string {
  if (!pathname) return '/';
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Convert `/team/:teamId/grade` → regex that matches one segment per `:param`. */
function patternToRegex(pattern: string): RegExp {
  const normalized = normalizePathname(pattern);
  const parts = normalized.split('/').map((part) => {
    if (part.startsWith(':')) return '[^/]+';
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return new RegExp(`^${parts.join('/')}$`);
}

export function matchPageTour(pathname: string): PageTourDefinition | null {
  const path = normalizePathname(pathname);
  for (const tour of PAGE_TOURS) {
    if (patternToRegex(tour.pattern).test(path)) return tour;
  }
  return null;
}

export function hasPageTour(pathname: string): boolean {
  return matchPageTour(pathname) != null;
}

/**
 * Registry order matters for overlapping patterns — more specific routes first
 * when patterns could collide (they generally don't here).
 */
export const PAGE_TOURS: PageTourDefinition[] = [
  // ── Batch A: grading + advancement ───────────────────────────────────────
  {
    pattern: '/team/:teamId/grade',
    steps: [
      {
        id: 'grade-overview',
        title: 'Back to overview',
        description: 'Return to your team home for this phase.',
      },
      {
        id: 'grade-progress',
        title: 'Track progress',
        description: 'See how many assigned applications you have left.',
      },
      {
        id: 'grade-start',
        title: 'Start grading',
        description: 'Open the next pending application.',
      },
      {
        id: 'grade-queue',
        title: 'Open an application',
        description: 'Grade or edit any assigned file from this list.',
      },
      {
        id: 'grade-next-step',
        title: 'Next phase action',
        description: 'Continue to color recommendations when grading is done.',
      },
    ],
  },
  {
    pattern: '/team/:teamId/grade/:applicationId',
    steps: [
      {
        id: 'grade-form-nav',
        title: 'Queue navigation',
        description: 'Jump to the next assignment or back to the queue.',
      },
      {
        id: 'grade-form-progress',
        title: 'Scoring progress',
        description: 'Watch how many required fields still need scores.',
      },
      {
        id: 'grade-form-scores',
        title: 'Enter scores',
        description: 'Read each response and fill its scoring field.',
      },
      {
        id: 'grade-form-portfolio',
        title: 'Portfolio links',
        description: 'Open supplementary links when present.',
      },
      {
        id: 'grade-form-comments',
        title: 'Add comments',
        description: 'Note flags or context for later reviewers.',
      },
      {
        id: 'grade-form-submit',
        title: 'Submit scores',
        description: 'Save when every required field is complete.',
      },
    ],
  },
  {
    pattern: '/admin/teams/:teamId/grader-preview/:applicationId',
    steps: [
      {
        id: 'grade-form-nav',
        title: 'Leave preview',
        description: 'Return to team setup when finished.',
      },
      {
        id: 'grade-form-scores',
        title: 'Preview scores',
        description: 'See the grader form for this application.',
      },
    ],
  },
  {
    pattern: '/team/:teamId/advancement',
    steps: [
      {
        id: 'advancement-bulk',
        title: 'Bulk select',
        description: 'Mark top applicants by score or clear the list.',
      },
      {
        id: 'advancement-over-cap',
        title: 'Go over limit',
        description: 'Request extra seats past the usual advancement cap.',
      },
      {
        id: 'advancement-count',
        title: 'Selection count',
        description: 'Track how many you have marked against the required total.',
      },
      {
        id: 'advancement-submit',
        title: 'Submit list',
        description: 'Directors send the advancement list for admin approval.',
      },
      {
        id: 'advancement-filter',
        title: 'Filter list',
        description: 'Narrow to your interviewees or graded apps.',
      },
      {
        id: 'advancement-verdicts',
        title: 'Set verdicts',
        description: 'Mark Advance / Hold / Reject on applicants you graded.',
      },
      {
        id: 'advancement-advance',
        title: 'Final advance',
        description: 'Toggle who is on the final list sent to admin.',
      },
      {
        id: 'advancement-detail',
        title: 'Open detail',
        description: 'Expand a row to review scores and notes.',
      },
    ],
  },
  {
    pattern: '/team/:teamId/advancement/first-round',
    steps: [
      {
        id: 'advancement-bulk',
        title: 'Bulk select',
        description: 'Mark top interviewees by score or clear the list.',
      },
      {
        id: 'advancement-over-cap',
        title: 'Go over limit',
        description: 'Request extra seats past the usual advancement cap.',
      },
      {
        id: 'advancement-count',
        title: 'Selection count',
        description: 'Track how many you have marked against the required total.',
      },
      {
        id: 'advancement-submit',
        title: 'Submit list',
        description: 'Directors send the final-round advancement list.',
      },
      {
        id: 'advancement-filter',
        title: 'Filter list',
        description: 'Show only your interviewees when needed.',
      },
      {
        id: 'advancement-verdicts',
        title: 'Set verdicts',
        description: 'Mark Advance / Hold / Reject on people you interviewed.',
      },
      {
        id: 'advancement-advance',
        title: 'Final advance',
        description: 'Toggle who advances to the next round.',
      },
      {
        id: 'advancement-detail',
        title: 'Open detail',
        description: 'Expand a row for interview scores and notes.',
      },
    ],
  },
  {
    pattern: '/admin/advancements',
    steps: [
      {
        id: 'admin-advancement-approve',
        title: 'Approve lists',
        description: 'Approve or send back submitted advancement lists.',
      },
      {
        id: 'admin-advancement-teams',
        title: 'Review teams',
        description: 'Check each team’s readiness and pending lists.',
      },
      {
        id: 'admin-advancement-activity',
        title: 'Submission log',
        description: 'See recent submits, approvals, and send-backs.',
      },
      {
        id: 'admin-advancement-caps',
        title: 'Edit caps',
        description: 'Set how many each team may advance per stage.',
      },
    ],
  },

  // ── Batch B: interviews + deliberations ──────────────────────────────────
  {
    pattern: '/team/:teamId/interviews/:stage',
    steps: [
      {
        id: 'interview-queue-progress',
        title: 'Track progress',
        description: 'See completed vs remaining interviews.',
      },
      {
        id: 'interview-queue-next',
        title: 'Next interview',
        description: 'Jump straight into the next pending slot.',
      },
      {
        id: 'interview-queue',
        title: 'Open interview',
        description: 'Pick a candidate or slot to score.',
      },
    ],
  },
  {
    pattern: '/team/:teamId/interviews/:stage/:applicationId',
    steps: [
      {
        id: 'interview-timer',
        title: 'Interview timer',
        description: 'Start, pause, or reset the elapsed timer.',
      },
      {
        id: 'interview-layout',
        title: 'Change layout',
        description: 'Switch group-interview panel arrangement.',
      },
      {
        id: 'interview-autosave',
        title: 'Auto-save status',
        description: 'Confirm drafts are saving as you type.',
      },
      {
        id: 'interview-fullscreen',
        title: 'Go fullscreen',
        description: 'Hide chrome for focused interviewing.',
      },
      {
        id: 'interview-case',
        title: 'Toggle case',
        description: 'Open or close the case PDF beside scoring.',
      },
      {
        id: 'interview-next',
        title: 'Next candidate',
        description: 'Move to the next assigned interview.',
      },
      {
        id: 'interview-scores',
        title: 'Score answers',
        description: 'Fill notes and score fields for this interview.',
      },
      {
        id: 'interview-submit',
        title: 'Submit scores',
        description: 'Save when scoring is complete.',
      },
    ],
  },
  {
    pattern: '/admin/teams/:teamId/interview-preview/:stage',
    steps: [
      {
        id: 'interview-timer',
        title: 'Interview timer',
        description: 'Preview the elapsed timer controls.',
      },
      {
        id: 'interview-layout',
        title: 'Change layout',
        description: 'Preview group-interview panel arrangement.',
      },
      {
        id: 'interview-scores',
        title: 'Preview scoring',
        description: 'Walk the interviewer form without saving.',
      },
      {
        id: 'interview-case',
        title: 'Toggle case',
        description: 'Open or close the case PDF.',
      },
    ],
  },
  {
    pattern: '/team/:teamId/deliberations',
    steps: [
      {
        id: 'deliberations-sort',
        title: 'Sort board',
        description: 'Rank cards by a score metric, or keep manual order.',
      },
      {
        id: 'deliberations-save',
        title: 'Save board',
        description: 'Persist column moves before leaving.',
      },
      {
        id: 'deliberations-finalize',
        title: 'Complete selection',
        description: 'Lock Accept as final offers for this team.',
      },
      {
        id: 'deliberations-compare',
        title: 'Compare candidates',
        description: 'Open side-by-side compare for selected cards.',
      },
      {
        id: 'deliberations-board',
        title: 'Move cards',
        description: 'Drag candidates across columns to decide.',
      },
      {
        id: 'deliberations-cap',
        title: 'Set accept limit',
        description: 'Adjust how many can land in Accept.',
      },
      {
        id: 'deliberations-over-cap',
        title: 'Go over limit',
        description: 'Request extra Accept seats past the offer limit.',
      },
      {
        id: 'deliberations-card',
        title: 'Open candidate',
        description: 'Click a card for scores, flags, and notes.',
      },
    ],
  },
  {
    pattern: '/admin/deliberations',
    steps: [
      {
        id: 'deliberations-sort',
        title: 'Sort board',
        description: 'Rank cards by a score metric, or keep manual order.',
      },
      {
        id: 'deliberations-save',
        title: 'Save board',
        description: 'Persist column moves before leaving.',
      },
      {
        id: 'deliberations-finalize',
        title: 'Complete selection',
        description: 'Lock Accept as final offers for the team.',
      },
      {
        id: 'deliberations-compare',
        title: 'Compare candidates',
        description: 'Open side-by-side compare for selected cards.',
      },
      {
        id: 'deliberations-board',
        title: 'Move cards',
        description: 'Drag candidates across decision columns.',
      },
      {
        id: 'deliberations-cap',
        title: 'Set accept limit',
        description: 'Set per-team Accept caps from the board.',
      },
      {
        id: 'deliberations-over-cap',
        title: 'Go over limit',
        description: 'Grant directors extra Accept seats when needed.',
      },
      {
        id: 'deliberations-card',
        title: 'Open candidate',
        description: 'Inspect merged scores and notes.',
      },
    ],
  },
  {
    pattern: '/admin/teams/:teamId/deliberations',
    steps: [
      {
        id: 'deliberations-sort',
        title: 'Sort board',
        description: 'Rank cards by a score metric, or keep manual order.',
      },
      {
        id: 'deliberations-save',
        title: 'Save board',
        description: 'Persist column moves before leaving.',
      },
      {
        id: 'deliberations-finalize',
        title: 'Complete selection',
        description: 'Lock Accept as final offers for this team.',
      },
      {
        id: 'deliberations-compare',
        title: 'Compare candidates',
        description: 'Open side-by-side compare for selected cards.',
      },
      {
        id: 'deliberations-board',
        title: 'Move cards',
        description: 'Drag this team’s candidates across columns.',
      },
      {
        id: 'deliberations-cap',
        title: 'Set accept limit',
        description: 'Adjust the Accept column cap.',
      },
      {
        id: 'deliberations-over-cap',
        title: 'Go over limit',
        description: 'Request extra Accept seats past the offer limit.',
      },
      {
        id: 'deliberations-card',
        title: 'Open candidate',
        description: 'Click a card for the full merge view.',
      },
    ],
  },

  // ── Batch C: admin hub ───────────────────────────────────────────────────
  {
    pattern: '/admin/dashboard',
    steps: [
      {
        id: 'admin-cycle',
        title: 'Cycle settings',
        description: 'Edit recruitment cycle label and dates.',
      },
      {
        id: 'admin-phase',
        title: 'Control phases',
        description: 'Open, advance, or close the global pipeline phase.',
      },
      {
        id: 'admin-teams-overview',
        title: 'Scan teams',
        description: 'Check each team’s progress for the current phase.',
      },
    ],
  },
  {
    pattern: '/admin/applications',
    steps: [
      {
        id: 'apps-search',
        title: 'Search apps',
        description: 'Find by name, email, Application ID, or applicant #.',
      },
      {
        id: 'apps-filters',
        title: 'Filter apps',
        description: 'Narrow by team or stage.',
      },
      {
        id: 'apps-table',
        title: 'Open a file',
        description: 'Select a row for detail and actions.',
      },
      {
        id: 'apps-actions',
        title: 'Run actions',
        description: 'Open the team page or delete from the detail panel.',
      },
    ],
  },
  {
    pattern: '/admin/import',
    steps: [
      {
        id: 'import-steps',
        title: 'Wizard steps',
        description: 'See where you are in the import flow.',
      },
      {
        id: 'import-upload',
        title: 'Upload file',
        description: 'Choose the CSV or spreadsheet to import.',
      },
      {
        id: 'import-teams',
        title: 'Split by team',
        description: 'Confirm how rows map to Strategy, Events, and Design.',
      },
      {
        id: 'import-map',
        title: 'Tag questions',
        description: 'Choose which columns are scored for each team.',
      },
      {
        id: 'import-graders',
        title: 'Assign graders',
        description: 'Distribute applications across users per team.',
      },
      {
        id: 'import-confirm',
        title: 'Confirm import',
        description: 'Review the preview, then commit the import.',
      },
    ],
  },
  {
    pattern: '/admin/users',
    steps: [
      {
        id: 'users-add',
        title: 'Add user',
        description: 'Invite a new grader, exec, or admin.',
      },
      {
        id: 'users-list',
        title: 'Browse users',
        description: 'Scan accounts by name, email, role, and teams.',
      },
      {
        id: 'users-role',
        title: 'Role column',
        description: 'See each person’s platform role at a glance.',
      },
      {
        id: 'users-edit',
        title: 'Edit access',
        description: 'Change role, team, or grants on a row.',
      },
    ],
  },
  {
    pattern: '/admin/users/new',
    steps: [
      {
        id: 'users-form',
        title: 'Fill details',
        description: 'Enter email, name, role, and team.',
      },
      {
        id: 'users-save',
        title: 'Save user',
        description: 'Create the account after fields look right.',
      },
    ],
  },

  // ── Batch D: schedule, setup, comms, coffee, final selection ─────────────
  {
    pattern: '/admin/teams/:teamId/schedule/first-round',
    steps: [
      {
        id: 'schedule-day',
        title: 'Interview day',
        description: 'Set the date, start time, and block length.',
      },
      {
        id: 'schedule-editor',
        title: 'Edit slots',
        description: 'Add or change interview times and rooms.',
      },
      {
        id: 'schedule-simulate',
        title: 'Simulate schedule',
        description: 'Auto-fill a test schedule with applicants and interviewers.',
      },
      {
        id: 'schedule-assign',
        title: 'Assign people',
        description: 'Place candidates and interviewers into slots.',
      },
      {
        id: 'schedule-save',
        title: 'Save schedule',
        description: 'Persist slot changes when ready.',
      },
    ],
  },
  {
    pattern: '/admin/teams/:teamId/schedule/final-round',
    steps: [
      {
        id: 'schedule-day',
        title: 'Interview day',
        description: 'Set the date, start time, and block length.',
      },
      {
        id: 'schedule-editor',
        title: 'Edit slots',
        description: 'Add or change final-round times and rooms.',
      },
      {
        id: 'schedule-simulate',
        title: 'Simulate schedule',
        description: 'Auto-fill a test schedule with applicants and interviewers.',
      },
      {
        id: 'schedule-assign',
        title: 'Assign people',
        description: 'Place candidates and interviewers into slots.',
      },
      {
        id: 'schedule-save',
        title: 'Save schedule',
        description: 'Persist slot changes when ready.',
      },
    ],
  },
  {
    pattern: '/admin/teams/:teamId/interview-setup',
    steps: [
      {
        id: 'interview-setup-guide',
        title: 'Edit guide',
        description: 'Update questions, format, and case materials.',
      },
      {
        id: 'interview-setup-preview',
        title: 'Preview guide',
        description: 'Open the interviewer view before publishing.',
      },
      {
        id: 'interview-setup-save',
        title: 'Save guide',
        description: 'Publish guide changes for interviewers.',
      },
    ],
  },
  {
    pattern: '/admin/teams/:teamId/communications',
    steps: [
      {
        id: 'comms-compose',
        title: 'Compose message',
        description: 'Write the email for this team audience.',
      },
      {
        id: 'comms-audience',
        title: 'Choose audience',
        description: 'Pick who receives this send.',
      },
      {
        id: 'comms-send',
        title: 'Send or schedule',
        description: 'Deliver when the copy is ready.',
      },
    ],
  },
  {
    pattern: '/admin/communications',
    steps: [
      {
        id: 'comms-audience',
        title: 'Choose audience',
        description: 'Select teams or stages to include.',
      },
      {
        id: 'comms-compose',
        title: 'Compose message',
        description: 'Write org-wide or multi-team outreach.',
      },
    ],
  },
  {
    pattern: '/admin/coffee-chats',
    steps: [
      {
        id: 'coffee-dates',
        title: 'Set dates',
        description: 'Configure coffee chat windows.',
      },
      {
        id: 'coffee-save',
        title: 'Save settings',
        description: 'Persist date changes.',
      },
    ],
  },
  {
    pattern: '/coffee-chats',
    steps: [
      {
        id: 'coffee-signup',
        title: 'Fill chat form',
        description: 'Enter date, applicant, and notes for the coffee chat.',
      },
      {
        id: 'coffee-submit',
        title: 'Submit chat',
        description: 'Save the coffee chat entry.',
      },
      {
        id: 'coffee-schedule',
        title: 'View schedule',
        description: 'See your booked and submitted chats.',
      },
    ],
  },
  {
    pattern: '/admin/final-selection',
    steps: [
      {
        id: 'final-offers',
        title: 'Manage offers',
        description: 'Update offer status across teams.',
      },
      {
        id: 'final-actions',
        title: 'Run actions',
        description: 'Send or update final selection decisions.',
      },
    ],
  },
  {
    pattern: '/team/final-selection',
    steps: [
      {
        id: 'final-offers',
        title: 'Review offers',
        description: 'See final selection status for your team.',
      },
      {
        id: 'final-actions',
        title: 'Update status',
        description: 'Record accept / decline where allowed.',
      },
    ],
  },
  {
    pattern: '/admin/teams/:teamId/finalize',
    steps: [
      {
        id: 'finalize-actions',
        title: 'Export results',
        description: 'Download the team export when ready.',
      },
      {
        id: 'finalize-review',
        title: 'Review results',
        description: 'Confirm team outcomes before closing.',
      },
    ],
  },
  {
    pattern: '/admin/teams/:teamId/interview-results',
    steps: [
      {
        id: 'results-table',
        title: 'Scan results',
        description: 'Review interview scores for this team.',
      },
    ],
  },
  {
    pattern: '/admin/teams/:teamId/assignments',
    steps: [
      {
        id: 'assignments-actions',
        title: 'Adjust assignments',
        description: 'Rebalance or reassign grader work.',
      },
      {
        id: 'assignments-table',
        title: 'Review assignments',
        description: 'See grader load and coverage.',
      },
    ],
  },
  {
    pattern: '/team',
    steps: [
      {
        id: 'team-picker',
        title: 'Pick a team',
        description: 'Open the team you need to work in.',
      },
    ],
  },
  {
    pattern: '/team/:teamId',
    steps: [
      {
        id: 'team-overview-progress',
        title: 'Check progress',
        description: 'See your personal and team status.',
      },
      {
        id: 'team-overview-work',
        title: 'Your work',
        description: 'Open grading, interviews, or advancement from each card.',
      },
      {
        id: 'team-overview-next',
        title: 'Continue work',
        description: 'Jump to the next action for this phase.',
      },
    ],
  },
  {
    pattern: '/admin/teams/:teamId',
    steps: [
      {
        id: 'team-admin-nav',
        title: 'Team tools',
        description: 'Open setup, schedule, or results for this team.',
      },
      {
        id: 'team-admin-phase',
        title: 'Phase controls',
        description: 'Adjust this team’s stage settings.',
      },
    ],
  },
];
