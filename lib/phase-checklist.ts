/**
 * Admin phase checklists — tasks shown on the dashboard phase tracker.
 *
 * To add or edit steps: update the build*Checklist functions below.
 * Each step can use live DB checks (completed) or static copy (title, description, href).
 */
import { listPendingAdvancementSubmissions } from '@/lib/advancement-submissions';
import { countTeamsWithCompleteOutcomeEmails } from '@/lib/communications';
import { communicationsHref } from '@/lib/communications-stages';
import { getDb, type RoundStatus } from '@/lib/db';
import { getOrgCoffeeChatDates, type OrgCoffeeChatDates } from '@/lib/org-coffee-chat-dates';
import { type TeamPipelineRound, getActiveRoundsByTeam } from '@/lib/pipeline-phase';
import { getTeamInterviewRoundStats } from '@/lib/interview-slots';
import { getRoundSettings, getTeamRoundStats } from '@/lib/rounds';
import {
  adminPhaseHref,
  isRoundAtOrPastStatus,
  phaseLabel,
  type UnlockableStage,
} from '@/lib/stages';
import { countTeamsWithCompleteFinalSelection } from '@/lib/deliberations';
import {
  DELIBERATIONS_WORKSPACE_PATH,
  openTeamDeliberationsHref,
} from '@/lib/deliberations-workspace';

export interface PhaseChecklistStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  actionLabel: string;
  href: string;
  detail?: string;
}

async function countCoffeeChats(): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM coffee_chats',
  });
  return (result.rows[0]?.count as number) ?? 0;
}

interface TeamInterviewProgress {
  teamId: number;
  teamName: string;
  candidateCount: number;
  slotCount: number;
  scoring: { total: number; completed: number };
  scheduledComplete: boolean;
  scoringComplete: boolean;
}

async function interviewProgressByTeam(
  withRound: Array<TeamPipelineRound & { round: NonNullable<TeamPipelineRound['round']> }>,
  stage: 'first_round' | 'final_round',
): Promise<TeamInterviewProgress[]> {
  return Promise.all(
    withRound.map(async (t) => {
      const stats = await getTeamInterviewRoundStats(t.teamId, t.round.id, stage);
      const scheduledComplete =
        stats.candidateCount > 0 && stats.slotCount >= stats.candidateCount;
      const scoringComplete =
        stats.scoring.total > 0 && stats.scoring.completed === stats.scoring.total;
      return {
        teamId: t.teamId,
        teamName: t.teamName,
        ...stats,
        scheduledComplete,
        scoringComplete,
      };
    }),
  );
}

function nextRoundLabel(stage: 'first_round' | 'final_round'): string {
  return stage === 'first_round' ? 'Final Round Interview' : 'Deliberations';
}

function interviewDashboardHref(stage: 'first_round' | 'final_round'): string {
  const view = stage === 'first_round' ? 'first-round' : 'final-round';
  return `/admin/dashboard?view=${view}#interview-overview`;
}

function interviewScheduleHref(stage: 'first_round' | 'final_round', teamId: number): string {
  const view = stage === 'first_round' ? 'first-round' : 'final-round';
  return `/admin/teams/${teamId}/schedule/${view}`;
}

async function teamsWithApprovedAdvancement(
  roundIds: number[],
  fromStage: 'application' | 'first_round',
): Promise<number> {
  if (roundIds.length === 0) return 0;
  const db = getDb();
  const placeholders = roundIds.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `SELECT COUNT(DISTINCT s.team_id) as count
          FROM team_advancement_submissions s
          WHERE s.round_id IN (${placeholders}) AND s.status = 'approved' AND s.from_stage = ?`,
    args: [...roundIds, fromStage],
  });
  return (result.rows[0]?.count as number) ?? 0;
}

async function teamsWithSubmittedAdvancement(
  roundIds: number[],
  fromStage: 'application' | 'first_round',
): Promise<number> {
  if (roundIds.length === 0) return 0;
  const db = getDb();
  const placeholders = roundIds.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `SELECT COUNT(DISTINCT s.team_id) as count
          FROM team_advancement_submissions s
          WHERE s.round_id IN (${placeholders}) AND s.status IN ('submitted', 'approved') AND s.from_stage = ?`,
    args: [...roundIds, fromStage],
  });
  return (result.rows[0]?.count as number) ?? 0;
}

function teamDetail(done: number, total: number): string {
  return total === 0 ? 'No teams yet' : `${done}/${total} teams`;
}

function formatCoffeeChatWindowDetail(dates: OrgCoffeeChatDates): string | undefined {
  if (!dates.coffeeChatStartDate || !dates.applicationDueDate) return undefined;
  const start = new Date(`${dates.coffeeChatStartDate}T00:00:00`);
  const end = new Date(`${dates.applicationDueDate}T00:00:00`);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

async function buildPreApplicationChecklist(): Promise<PhaseChecklistStep[]> {
  const orgDates = await getOrgCoffeeChatDates();
  const orgDatesDone = Boolean(orgDates.coffeeChatStartDate && orgDates.applicationDueDate);
  const coffeeChatCount = await countCoffeeChats();

  return [
    {
      id: 'coffee-dates',
      title: 'Set coffee chat window',
      description: 'Set the org-wide coffee chat window before applications open.',
      completed: orgDatesDone,
      actionLabel: 'Set dates',
      href: '/admin/coffee-chats',
      detail: formatCoffeeChatWindowDetail(orgDates),
    },
    {
      id: 'coffee-notes',
      title: 'Collect coffee chat notes',
      description: 'Review coffee chat notes submitted by members across all teams.',
      completed: coffeeChatCount > 0,
      actionLabel: 'View submissions',
      href: '/admin/coffee-chats',
      detail: coffeeChatCount > 0 ? `${coffeeChatCount} logged` : undefined,
    },
  ];
}

async function buildApplicationChecklist(
  withRound: Array<TeamPipelineRound & { round: NonNullable<TeamPipelineRound['round']> }>,
): Promise<PhaseChecklistStep[]> {
  const roundIds = withRound.map((t) => t.round.id);
  const teamCount = withRound.length;

  const stats = await Promise.all(
    withRound.map((t) => getTeamRoundStats(t.teamId, t.round.id)),
  );
  const rubricResults = await Promise.all(
    withRound.map((t) => getRoundSettings(t.round.id)),
  );

  const importedCount = stats.filter((s) => s.applicationCount > 0).length;
  const rubricCount = rubricResults.filter((s) => (s?.score_fields.length ?? 0) > 0).length;
  const assignedCount = stats.filter((s) => s.assignmentProgress.total > 0).length;

  const submittedTeams = await teamsWithSubmittedAdvancement(roundIds, 'application');
  const approvedTeams = await teamsWithApprovedAdvancement(roundIds, 'application');
  const pending = (await listPendingAdvancementSubmissions()).filter(
    (s) => s.fromStage === 'application',
  );
  const emailedTeams = await countTeamsWithCompleteOutcomeEmails(
    withRound.map((t) => ({ teamId: t.teamId, roundId: t.round.id })),
    'application',
  );

  const totalAssignments = stats.reduce((sum, s) => sum + s.assignmentProgress.total, 0);
  const completedAssignments = stats.reduce((sum, s) => sum + s.assignmentProgress.completed, 0);

  return [
    {
      id: 'import-apps',
      title: 'Upload Application CSV',
      description:
        'Start here in Application phase: upload one CSV with all applicants. We split it into Strategy, Events, and Design and create grader assignments. Remove and re-upload anytime before you finish import.',
      completed: teamCount > 0 && importedCount === teamCount,
      actionLabel: 'Open import flow',
      href: '/admin/import',
      detail: teamDetail(importedCount, teamCount),
    },
    {
      id: 'rubric',
      title: 'Configure grading rubric',
      description: 'Set which CSV columns each team scores during blind review.',
      completed: teamCount > 0 && rubricCount === teamCount,
      actionLabel: 'Team setup',
      href: '/admin/dashboard',
      detail: teamDetail(rubricCount, teamCount),
    },
    {
      id: 'assignments',
      title: 'Generate grader assignments',
      description: 'Confirm each team has graders assigned to imported applications.',
      completed: teamCount > 0 && assignedCount === teamCount,
      actionLabel: 'View assignments',
      href: '/admin/dashboard',
      detail: teamDetail(assignedCount, teamCount),
    },
    {
      id: 'grading',
      title: 'Finish Application grading',
      description:
        'All assigned application reviews should be scored before Directors submit advancement lists.',
      completed: totalAssignments > 0 && completedAssignments === totalAssignments,
      actionLabel: 'Track progress',
      href: adminPhaseHref('application'),
      detail: `${completedAssignments}/${totalAssignments} assignments`,
    },
    {
      id: 'advance-submit',
      title: 'Directors submit advancement lists',
      description:
        'Each team\'s Director selects who advances to First Round Interview and submits the list to Admin.',
      completed: teamCount > 0 && submittedTeams === teamCount,
      actionLabel: 'View submissions',
      href: '/admin/advancements',
      detail: teamDetail(submittedTeams, teamCount),
    },
    {
      id: 'advance-approve',
      title: 'Approve advancement lists',
      description:
        'Review each team\'s submitted list and approve advancing applicants to First Round Interview.',
      completed: teamCount > 0 && approvedTeams === teamCount && pending.length === 0,
      actionLabel: 'Review queue',
      href: '/admin/advancements',
      detail:
        pending.length > 0
          ? `${pending.length} pending`
          : teamDetail(approvedTeams, teamCount),
    },
    {
      id: 'email-outcomes',
      title: 'Email applicants',
      description:
        'Email each applicant whether they advanced to First Round Interview. Templates are pre-filled for your email client.',
      completed:
        teamCount > 0 &&
        approvedTeams === teamCount &&
        pending.length === 0 &&
        emailedTeams === teamCount,
      actionLabel: 'Send emails',
      href: communicationsHref('application'),
      detail: teamDetail(emailedTeams, teamCount),
    },
  ];
}

async function buildInterviewChecklist(
  stage: 'first_round' | 'final_round',
  withRound: Array<TeamPipelineRound & { round: NonNullable<TeamPipelineRound['round']> }>,
): Promise<PhaseChecklistStep[]> {
  const label = phaseLabel(stage);
  const nextLabel = nextRoundLabel(stage);
  const teamProgress = await interviewProgressByTeam(withRound, stage);
  const teamCount = withRound.length;
  const teamsScheduled = teamProgress.filter((t) => t.scheduledComplete).length;
  const dashboardHref = interviewDashboardHref(stage);
  // Prefer a team that still needs slots; fall back to first team / dashboard overview.
  const scheduleTarget =
    teamProgress.find((t) => !t.scheduledComplete) ?? teamProgress[0];
  const scheduleHref = scheduleTarget
    ? interviewScheduleHref(stage, scheduleTarget.teamId)
    : dashboardHref;

  const steps: PhaseChecklistStep[] = [
    {
      id: `${stage}-schedule`,
      title: `Schedule ${label}`,
      description: 'Assign every advancing applicant to an interview slot before interviewers score.',
      completed: teamCount > 0 && teamsScheduled === teamCount,
      actionLabel: 'Schedule interviews',
      href: scheduleHref,
      detail: teamDetail(teamsScheduled, teamCount),
    },
  ];

  // First Round only: confirm every team's round status has left Application.
  if (stage === 'first_round') {
    const teamsOnStage = withRound.filter((t) =>
      isRoundAtOrPastStatus(t.round.status, 'first_round'),
    ).length;
    steps.push({
      id: `${stage}-move-teams`,
      title: 'Move all teams into First Round Interview',
      description:
        "Advance every team's pipeline into First Round Interview so interviewers can score.",
      completed: teamCount > 0 && teamsOnStage === teamCount,
      actionLabel: 'Move teams',
      // Keep First Round view (bare /admin/dashboard falls back to live pipeline = Application).
      href: `${adminPhaseHref('first_round')}#move-all-teams`,
      detail: teamDetail(teamsOnStage, teamCount),
    });
  }

  for (const team of teamProgress) {
    const { total, completed } = team.scoring;
    steps.push({
      id: `${stage}-score-${team.teamId}`,
      title: `${team.teamName} interviews scored`,
      description: `All ${label} interview assignments for ${team.teamName} should be scored.`,
      completed: team.scoringComplete,
      actionLabel: 'Track scoring',
      href: dashboardHref,
      detail: total > 0 ? `${completed}/${total} scored` : 'No assignments yet',
    });
  }

  // First-round advancement (submit → approve → email) mirrors application flow.
  // Counts only from_stage = 'first_round' (not application → first_round lists).
  if (stage === 'first_round') {
    const allScoringDone =
      teamCount > 0 && teamProgress.every((t) => t.scoringComplete || t.candidateCount === 0);

    const roundIds = withRound.map((t) => t.round.id);
    const submittedTeams = await teamsWithSubmittedAdvancement(roundIds, 'first_round');
    const approvedTeams = await teamsWithApprovedAdvancement(roundIds, 'first_round');
    const pending = (await listPendingAdvancementSubmissions('first_round')).length;
    const emailedTeams = await countTeamsWithCompleteOutcomeEmails(
      withRound.map((t) => ({ teamId: t.teamId, roundId: t.round.id })),
      'first_round',
    );

    steps.push(
      {
        id: `${stage}-advance-submit`,
        title: 'Directors submit advancement lists',
        description: `Each team's Director selects who advances to ${nextLabel} and submits the list to Admin.`,
        completed: teamCount > 0 && allScoringDone && submittedTeams === teamCount,
        actionLabel: 'View submissions',
        href: '/admin/advancements',
        detail: allScoringDone
          ? teamDetail(submittedTeams, teamCount)
          : 'Finish scoring first',
      },
      {
        id: `${stage}-advance-approve`,
        title: 'Approve advancement lists',
        description: `Review each team's submitted list and approve advancing applicants to ${nextLabel}.`,
        completed:
          teamCount > 0 &&
          allScoringDone &&
          approvedTeams === teamCount &&
          pending === 0,
        actionLabel: 'Review queue',
        href: '/admin/advancements',
        detail: !allScoringDone
          ? 'Finish scoring first'
          : pending > 0
            ? `${pending} pending`
            : teamDetail(approvedTeams, teamCount),
      },
      {
        id: `${stage}-email-outcomes`,
        title: 'Email applicants',
        description: `Email each applicant whether they advanced to ${nextLabel}.`,
        completed:
          teamCount > 0 &&
          allScoringDone &&
          approvedTeams === teamCount &&
          pending === 0 &&
          emailedTeams === teamCount,
        actionLabel: 'Send emails',
        href: communicationsHref('first_round'),
        detail: teamDetail(emailedTeams, teamCount),
      },
    );
  }

  return steps;
}

async function buildDeliberationsChecklist(
  withRound: Array<TeamPipelineRound & { round: NonNullable<TeamPipelineRound['round']> }>,
  unlockedStages: UnlockableStage[],
): Promise<PhaseChecklistStep[]> {
  const teamCount = withRound.length;
  const delibsUnlocked = unlockedStages.includes('deliberations');
  const teamKeys = withRound.map((t) => ({ teamId: t.teamId, roundId: t.round.id }));
  const finalizedTeams = await countTeamsWithCompleteFinalSelection(teamKeys);
  // Workspace hub; optionally open the first team as a tab.
  const firstTeam = withRound[0];
  const openDeliberationsHref = firstTeam
    ? openTeamDeliberationsHref(firstTeam.teamId)
    : DELIBERATIONS_WORKSPACE_PATH;

  return [
    {
      id: 'delib-unlock',
      title: 'Turn on Deliberations for execs',
      description:
        'Execs cannot open their team boards until Deliberations is checked under Stage access on the dashboard.',
      completed: delibsUnlocked,
      actionLabel: 'Go to dashboard',
      href: `${adminPhaseHref('deliberations')}#stage-access`,
    },
    {
      id: 'delib-teams',
      title: 'Complete final selection',
      description:
        'Lock each team’s Accept column into offers. Remaining applicants are marked not selected.',
      completed: teamCount > 0 && finalizedTeams === teamCount,
      actionLabel: 'Open Deliberations',
      href: openDeliberationsHref,
      detail: teamDetail(finalizedTeams, teamCount),
    },
  ];
}

async function buildClosedChecklist(
  withRound: Array<TeamPipelineRound & { round: NonNullable<TeamPipelineRound['round']> }>,
): Promise<PhaseChecklistStep[]> {
  const teamCount = withRound.length;
  const teamKeys = withRound.map((t) => ({ teamId: t.teamId, roundId: t.round.id }));
  const emailedTeams = await countTeamsWithCompleteOutcomeEmails(teamKeys, 'final_round');

  return [
    {
      id: 'closed-final-selection',
      title: 'View final selection',
      description: 'See who received offers across all teams.',
      completed: true,
      actionLabel: 'View offers',
      href: '/admin/final-selection',
    },
    {
      id: 'closed-email-outcomes',
      title: 'Email final outcomes',
      description: 'Email final offers and rejections.',
      completed: teamCount > 0 && emailedTeams === teamCount,
      actionLabel: 'Send emails',
      href: communicationsHref('final_round'),
      detail: teamDetail(emailedTeams, teamCount),
    },
    {
      id: 'closed-export',
      title: 'Export final results',
      description: 'Download final outcomes from each team dashboard if needed.',
      completed: false,
      actionLabel: 'Open dashboard',
      href: '/admin/dashboard',
    },
  ];
}

export async function getPhaseChecklistForStatus(
  status: RoundStatus,
  options: { unlockedStages?: UnlockableStage[] } = {},
): Promise<PhaseChecklistStep[]> {
  const unlockedStages = options.unlockedStages ?? [];
  const teams = await getActiveRoundsByTeam();
  const withRound = teams.filter((t) => t.round) as Array<
    TeamPipelineRound & { round: NonNullable<TeamPipelineRound['round']> }
  >;

  switch (status) {
    case 'pre_application':
      return buildPreApplicationChecklist();
    case 'application':
      return buildApplicationChecklist(withRound);
    case 'first_round':
      return buildInterviewChecklist('first_round', withRound);
    case 'final_round':
      return buildInterviewChecklist('final_round', withRound);
    case 'deliberations':
      return buildDeliberationsChecklist(withRound, unlockedStages); // async
    case 'closed':
      return buildClosedChecklist(withRound);
    default:
      return [];
  }
}
