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
import { getTeamPipelineProfile, teamUsesInterviewStage } from '@/lib/team-pipeline-profile';

export interface PhaseChecklistStep {
  id: string;
  title: string;
  description?: string;
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

function nextRoundLabel(stage: 'first_round' | 'final_round', teamName?: string): string {
  if (stage === 'first_round') {
    if (teamName && getTeamPipelineProfile(teamName).skipFinalRoundPhase) {
      return 'Deliberations';
    }
    return 'Final Round Interview';
  }
  return 'Deliberations';
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
  const pipeline = await getActiveRoundsByTeam();
  const withRound = pipeline.filter((t) => t.round);
  const teamCount = withRound.length;
  const teamsOnApplication = withRound.filter((t) =>
    isRoundAtOrPastStatus(t.round!.status, 'application'),
  ).length;
  const moveComplete = teamCount > 0 && teamsOnApplication === teamCount;

  return [
    {
      id: 'coffee-dates',
      title: 'Set coffee chat window',
      completed: orgDatesDone,
      actionLabel: 'Set dates',
      href: '/admin/coffee-chats',
      detail: formatCoffeeChatWindowDetail(orgDates),
    },
    {
      id: 'coffee-notes',
      title: 'Collect coffee chat notes',
      completed: coffeeChatCount > 0,
      actionLabel: 'View Submissions',
      href: '/admin/coffee-chats',
      detail: coffeeChatCount > 0 ? `${coffeeChatCount} logged` : undefined,
    },
    {
      id: 'move-to-application',
      title: 'Advance teams to Application',
      completed: moveComplete,
      actionLabel: 'Open Dashboard',
      href: '/admin/dashboard#pipeline-controls',
      detail: teamDetail(teamsOnApplication, teamCount),
    },
  ];
}

async function buildApplicationChecklist(
  withRound: Array<TeamPipelineRound & { round: NonNullable<TeamPipelineRound['round']> }>,
  unlockedStages: UnlockableStage[] = [],
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
  const gradingUnlocked = unlockedStages.includes('application');

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

  const designTeams = withRound.filter((t) => getTeamPipelineProfile(t.teamName).skipFinalRoundPhase);
  const settingsByTeamId = new Map(
    withRound.map((t, i) => [t.teamId, rubricResults[i]] as const),
  );
  const designPortfolioConfigured = designTeams.filter(
    (t) => (settingsByTeamId.get(t.teamId)?.portfolio_fields.length ?? 0) > 0,
  ).length;

  return [
    {
      id: 'import-apps',
      title: 'Upload Application CSV',
      completed: teamCount > 0 && importedCount === teamCount,
      actionLabel: 'Open Import Flow',
      href: '/admin/import',
      detail: teamDetail(importedCount, teamCount),
    },
    ...(designTeams.length > 0
      ? [
          {
            id: 'design-portfolio-rubric',
            title: 'Classify Design portfolio links at import',
            description:
              'Mark Google Drive / Figma / portfolio columns as portfolio fields (not context). Ask applicants to anonymize file names before grading.',
            completed: designPortfolioConfigured === designTeams.length,
            actionLabel: 'Open Import Flow',
            href: '/admin/import',
            detail: teamDetail(designPortfolioConfigured, designTeams.length),
          } satisfies PhaseChecklistStep,
        ]
      : []),
    {
      id: 'rubric',
      title: 'Configure Grading Rubric',
      completed: teamCount > 0 && rubricCount === teamCount,
      actionLabel: 'Team Setup',
      href: '/admin/dashboard',
      detail: teamDetail(rubricCount, teamCount),
    },
    {
      id: 'assignments',
      title: 'Generate Grader Assignments',
      completed: teamCount > 0 && assignedCount === teamCount,
      actionLabel: 'View Assignments',
      href: '/admin/dashboard',
      detail: teamDetail(assignedCount, teamCount),
    },
    {
      id: 'unlock-grading',
      title: 'Unlock Application for graders',
      completed: gradingUnlocked,
      actionLabel: 'Click to unlock each phase',
      href: '/admin/dashboard#pipeline-controls',
      description:
        'Keep this locked while you finish import and setup. Unlock when team members should start grading.',
      detail: gradingUnlocked ? 'Open for grading' : 'Locked',
    },
    {
      id: 'grading',
      title: 'Finish Application Grading',
      completed: totalAssignments > 0 && completedAssignments === totalAssignments,
      actionLabel: 'Track Progress',
      href: adminPhaseHref('application'),
      detail: `${completedAssignments}/${totalAssignments} assignments`,
    },
    {
      id: 'advance-submit',
      title: 'Directors submit advancement lists',
      completed: teamCount > 0 && submittedTeams === teamCount,
      actionLabel: 'View Submissions',
      href: '/admin/advancements',
      detail: teamDetail(submittedTeams, teamCount),
    },
    {
      id: 'advance-approve',
      title: 'Approve advancement lists',
      completed: teamCount > 0 && approvedTeams === teamCount && pending.length === 0,
      actionLabel: 'Review Queue',
      href: '/admin/advancements',
      detail:
        pending.length > 0
          ? `${pending.length} pending`
          : teamDetail(approvedTeams, teamCount),
    },
    {
      id: 'email-outcomes',
      title: 'Email Applicants',
      completed:
        teamCount > 0 &&
        approvedTeams === teamCount &&
        pending.length === 0 &&
        emailedTeams === teamCount,
      actionLabel: 'Send Emails',
      href: communicationsHref('application'),
      detail: teamDetail(emailedTeams, teamCount),
    },
  ];
}

async function buildInterviewChecklist(
  stage: 'first_round' | 'final_round',
  withRound: Array<TeamPipelineRound & { round: NonNullable<TeamPipelineRound['round']> }>,
): Promise<PhaseChecklistStep[]> {
  const eligibleTeams = withRound.filter((t) => teamUsesInterviewStage(t.teamName, stage));
  const label = phaseLabel(stage);
  const nextLabel = nextRoundLabel(stage);
  const teamProgress = await interviewProgressByTeam(eligibleTeams, stage);
  const teamCount = eligibleTeams.length;
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
      completed: teamCount > 0 && teamsScheduled === teamCount,
      actionLabel: 'Schedule Interviews',
      href: scheduleHref,
      detail: teamDetail(teamsScheduled, teamCount),
    },
  ];

  // First Round only: confirm every team's round status has left Application.
  if (stage === 'first_round') {
    const teamsOnStage = eligibleTeams.filter((t) =>
      isRoundAtOrPastStatus(t.round.status, 'first_round'),
    ).length;
    steps.push({
      id: `${stage}-move-teams`,
      title: 'Advance teams into First Round Interview',
      completed: teamCount > 0 && teamsOnStage === teamCount,
      actionLabel: 'Open Dashboard',
      href: `${adminPhaseHref('first_round')}#pipeline-controls`,
      detail: teamDetail(teamsOnStage, teamCount),
    });
  }

  for (const team of teamProgress) {
    const { total, completed } = team.scoring;
    steps.push({
      id: `${stage}-score-${team.teamId}`,
      title: `${team.teamName} Interviews Scored`,
      completed: team.scoringComplete,
      actionLabel: 'Track Scoring',
      href: dashboardHref,
      detail: total > 0 ? `${completed}/${total} scored` : 'No assignments yet',
    });
  }

  // First-round advancement (submit → approve → email) mirrors application flow.
  // Counts only from_stage = 'first_round' (not application → first_round lists).
  if (stage === 'first_round') {
    const allScoringDone =
      teamCount > 0 && teamProgress.every((t) => t.scoringComplete || t.candidateCount === 0);

    const roundIds = eligibleTeams.map((t) => t.round.id);
    const submittedTeams = await teamsWithSubmittedAdvancement(roundIds, 'first_round');
    const approvedTeams = await teamsWithApprovedAdvancement(roundIds, 'first_round');
    const pending = (await listPendingAdvancementSubmissions('first_round')).length;
    const emailedTeams = await countTeamsWithCompleteOutcomeEmails(
      eligibleTeams.map((t) => ({ teamId: t.teamId, roundId: t.round.id })),
      'first_round',
    );

    steps.push(
      {
        id: `${stage}-advance-submit`,
        title: 'Directors submit advancement lists',
        completed: teamCount > 0 && allScoringDone && submittedTeams === teamCount,
        actionLabel: 'View Submissions',
        href: '/admin/advancements',
        detail: allScoringDone
          ? teamDetail(submittedTeams, teamCount)
          : 'Finish scoring first',
      },
      {
        id: `${stage}-advance-approve`,
        title: 'Approve advancement lists',
        completed:
          teamCount > 0 &&
          allScoringDone &&
          approvedTeams === teamCount &&
          pending === 0,
        actionLabel: 'Review Queue',
        href: '/admin/advancements',
        detail: !allScoringDone
          ? 'Finish scoring first'
          : pending > 0
            ? `${pending} pending`
            : teamDetail(approvedTeams, teamCount),
      },
      {
        id: `${stage}-email-outcomes`,
        title: 'Email Applicants',
        completed:
          teamCount > 0 &&
          allScoringDone &&
          approvedTeams === teamCount &&
          pending === 0 &&
          emailedTeams === teamCount,
        actionLabel: 'Send Emails',
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
      title: 'Unlock Deliberations',
      completed: delibsUnlocked,
      actionLabel: 'Click to unlock each phase',
      href: `${adminPhaseHref('deliberations')}#pipeline-controls`,
      description:
        'Use the Team Phases cards on the dashboard to unlock Deliberations for each team when execs should start.',
      detail: delibsUnlocked ? 'Open for execs' : 'Locked',
    },
    {
      id: 'delib-teams',
      title: 'Begin Deliberations',
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
      completed: true,
      actionLabel: 'View offers',
      href: '/admin/final-selection',
    },
    {
      id: 'closed-email-outcomes',
      title: 'Email final outcomes',
      completed: teamCount > 0 && emailedTeams === teamCount,
      actionLabel: 'Send Emails',
      href: communicationsHref('final_round'),
      detail: teamDetail(emailedTeams, teamCount),
    },
    {
      id: 'closed-export',
      title: 'Export final results',
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
      return buildApplicationChecklist(withRound, unlockedStages);
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
