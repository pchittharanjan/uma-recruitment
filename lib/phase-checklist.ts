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
import { type TeamPipelineRound, getActiveRoundsByTeam } from '@/lib/pipeline-phase';
import {
  batchDeliberationsFinalSelectionComplete,
  getTeamInterviewRoundStatsBatch,
  getTeamRoundStatsBatch,
  teamRoundStatsMapKey,
} from '@/lib/batch-team-stats';
import { getRoundSettings } from '@/lib/rounds';
import type { RoundSettings } from '@/lib/rounds';
import type { InterviewGuideStage } from '@/lib/interview-guide';
import {
  adminPhaseHref,
  adminTeamPhaseHref,
  isRoundAtOrPastStatus,
  phaseLabel,
  type UnlockableStage,
} from '@/lib/stages';
import {
  DELIBERATIONS_WORKSPACE_PATH,
  openTeamDeliberationsHref,
} from '@/lib/deliberations-workspace';
import { teamUsesInterviewStage } from '@/lib/team-pipeline-profile';

/** Admin page section where all teams' advancement caps are configured. */
export const ADMIN_ADVANCEMENT_CAPS_HREF = '/admin/advancements#advancement-caps';

export interface PhaseChecklistStep {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  actionLabel: string;
  href: string;
  detail?: string;
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
  const keys = withRound.map((t) => ({ teamId: t.teamId, roundId: t.round.id }));
  const statsByKey = await getTeamInterviewRoundStatsBatch(keys, stage);

  return withRound.map((t) => {
    const stats = statsByKey.get(teamRoundStatsMapKey(t.teamId, t.round.id)) ?? {
      candidateCount: 0,
      slotCount: 0,
      scoring: { total: 0, completed: 0 },
    };
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
  });
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

/** Teams whose official phase has reached `status` (unlock-eligible for that phase). */
function countTeamsAtOrPastStatus(
  withRound: Array<TeamPipelineRound & { round: NonNullable<TeamPipelineRound['round']> }>,
  status: RoundStatus,
): number {
  return withRound.filter((t) => isRoundAtOrPastStatus(t.round.status, status)).length;
}

const PIPELINE_CONTROLS_HREF = '/admin/dashboard#pipeline-controls';

function advanceTeamsStep(
  phase: RoundStatus,
  teamsInPhase: number,
  teamCount: number,
): PhaseChecklistStep {
  const label = phaseLabel(phase);
  return {
    id: `advance-to-${phase}`,
    title: `Advance teams to ${label}`,
    completed: teamsInPhase > 0,
    actionLabel: 'Open Team Phases',
    href: PIPELINE_CONTROLS_HREF,
    description:
      teamsInPhase > 0
        ? `At least one team is in ${label}. Advance remaining teams when they are ready.`
        : `Move each team’s official phase to ${label} on the Team Phases cards above before unlocking exec access.`,
    detail: teamDetail(teamsInPhase, teamCount),
  };
}

function hasSavedInterviewGuide(
  settings: RoundSettings | null,
  stage: InterviewGuideStage,
): boolean {
  if (!settings) return false;
  if (settings.interview_guides?.trim()) {
    try {
      const parsed = JSON.parse(settings.interview_guides) as Partial<
        Record<InterviewGuideStage, unknown>
      >;
      if (parsed[stage] != null) return true;
    } catch {
      // ignore malformed JSON
    }
  }
  return stage === 'first_round' && Boolean(settings.interview_script_first_round?.trim());
}

async function countUsersWithTeamAccess(): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT COUNT(DISTINCT u.id) AS count
          FROM users u
          JOIN access_grants ag ON ag.user_id = u.id AND ag.revoked_at IS NULL
          WHERE u.role != 'admin'`,
  });
  return (result.rows[0]?.count as number) ?? 0;
}

async function teamsWithAdvancementCap(
  teamIds: number[],
  stage: 'application' | 'first_round',
): Promise<number> {
  if (teamIds.length === 0) return 0;
  const db = getDb();
  const column = stage === 'application' ? 'application_cap' : 'first_round_cap';
  const placeholders = teamIds.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS count
          FROM team_advancement_caps
          WHERE team_id IN (${placeholders})
            AND ${column} IS NOT NULL
            AND ${column} >= 1`,
    args: teamIds,
  });
  return (result.rows[0]?.count as number) ?? 0;
}

async function buildPreApplicationChecklist(): Promise<PhaseChecklistStep[]> {
  const pipeline = await getActiveRoundsByTeam();
  const withRound = pipeline.filter((t) => t.round);
  const teamCount = withRound.length;
  const teamsOnApplication = withRound.filter((t) =>
    isRoundAtOrPastStatus(t.round!.status, 'application'),
  ).length;
  const moveComplete = teamCount > 0 && teamsOnApplication === teamCount;

  return [
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
  const keys = withRound.map((t) => ({ teamId: t.teamId, roundId: t.round.id }));

  const [statsByKey, rubricResults, cappedTeams, usersWithAccess] = await Promise.all([
    getTeamRoundStatsBatch(keys),
    Promise.all(withRound.map((t) => getRoundSettings(t.round.id))),
    teamsWithAdvancementCap(withRound.map((t) => t.teamId), 'application'),
    countUsersWithTeamAccess(),
  ]);
  const stats = withRound.map((t) =>
    statsByKey.get(teamRoundStatsMapKey(t.teamId, t.round.id)) ?? {
      applicationCount: 0,
      assignmentProgress: { total: 0, completed: 0 },
      gradersPerApplication: 3,
    },
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
  // Prefer a team that still needs work; when all complete, send to the phase hub.
  const rubricTarget = withRound.find(
    (t, i) => (rubricResults[i]?.score_fields.length ?? 0) === 0,
  );
  const rubricHref =
    rubricTarget != null
      ? `/admin/teams/${rubricTarget.teamId}?tab=grading`
      : adminPhaseHref('application');
  const assignmentTarget = withRound.find((t, i) => stats[i].assignmentProgress.total === 0);
  const assignmentsHref =
    assignmentTarget != null
      ? `/admin/teams/${assignmentTarget.teamId}/assignments`
      : adminPhaseHref('application');

  return [
    {
      id: 'add-graders',
      title: 'Add graders in Users',
      completed: usersWithAccess > 0,
      actionLabel: 'Open Users',
      href: '/admin/users',
      description: 'Add execs and graders with team access before import.',
      detail: usersWithAccess > 0 ? `${usersWithAccess} with team access` : 'None yet',
    },
    {
      id: 'import-apps',
      title: 'Upload Application CSV',
      completed: teamCount > 0 && importedCount === teamCount,
      actionLabel: 'Open Import Flow',
      href: '/admin/import',
      detail: teamDetail(importedCount, teamCount),
    },
    {
      id: 'rubric',
      title: 'Review rubric (criteria set during import)',
      completed: teamCount > 0 && rubricCount === teamCount,
      actionLabel: 'Review rubric',
      href: rubricHref,
      detail: teamDetail(rubricCount, teamCount),
    },
    {
      id: 'assignments',
      title: 'Review grader assignments (created on Assign)',
      completed: teamCount > 0 && assignedCount === teamCount,
      actionLabel: 'View Assignments',
      href: assignmentsHref,
      detail: teamDetail(assignedCount, teamCount),
    },
    {
      id: 'unlock-grading',
      title: 'Unlock Application for graders',
      completed: gradingUnlocked,
      actionLabel: 'Unlock grading on dashboard',
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
      id: 'advancement-caps',
      title: 'Set advancement limits',
      completed: teamCount > 0 && cappedTeams === teamCount,
      actionLabel: 'Configure caps',
      href: ADMIN_ADVANCEMENT_CAPS_HREF,
      description:
        'Set each team’s application advancement limit on the Advancements page before directors can submit their list.',
      detail: teamDetail(cappedTeams, teamCount),
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
  unlockedStages: UnlockableStage[] = [],
): Promise<PhaseChecklistStep[]> {
  const eligibleTeams = withRound.filter((t) => teamUsesInterviewStage(t.teamName, stage));
  const teamProgress = await interviewProgressByTeam(eligibleTeams, stage);
  const teamCount = eligibleTeams.length;
  const teamsInPhase = countTeamsAtOrPastStatus(eligibleTeams, stage);
  const stageUnlocked = unlockedStages.includes(stage);
  const teamsScheduled = teamProgress.filter((t) => t.scheduledComplete).length;
  const guideSettings = await Promise.all(
    eligibleTeams.map((t) => getRoundSettings(t.round.id)),
  );
  const teamsWithGuide = eligibleTeams.filter((t, index) =>
    hasSavedInterviewGuide(guideSettings[index], stage),
  ).length;
  const dashboardHref = interviewDashboardHref(stage);
  // Prefer a team that still needs setup; when all complete, use the phase overview hub.
  const guideTarget = eligibleTeams.find(
    (t, index) => !hasSavedInterviewGuide(guideSettings[index], stage),
  );
  const guideHref = guideTarget
    ? `/admin/teams/${guideTarget.teamId}/interview-setup`
    : dashboardHref;
  const scheduleTarget = teamProgress.find((t) => !t.scheduledComplete);
  const scheduleHref = scheduleTarget
    ? interviewScheduleHref(stage, scheduleTarget.teamId)
    : dashboardHref;
  const label = phaseLabel(stage);
  const notAdvancedYet = teamsInPhase === 0;

  const steps: PhaseChecklistStep[] = [
    advanceTeamsStep(stage, teamsInPhase, teamCount),
    {
      id: `${stage}-unlock`,
      title: `Unlock ${label}`,
      completed: teamsInPhase > 0 && stageUnlocked,
      actionLabel: notAdvancedYet ? 'Advance teams first' : 'Unlock on dashboard',
      href: PIPELINE_CONTROLS_HREF,
      description: notAdvancedYet
        ? `No teams are in ${label} yet. Advance teams on the Team Phases cards above first — unlock is only available after a team reaches this phase.`
        : `Use the Team Phases cards to unlock ${label} for each team when interviewers should start.`,
      detail: notAdvancedYet
        ? 'Advance first'
        : stageUnlocked
          ? 'Open for execs'
          : 'Locked',
    },
    {
      id: `${stage}-guide`,
      title: 'Configure interview guide',
      completed: teamCount > 0 && teamsWithGuide === teamCount,
      actionLabel: 'Open interview setup',
      href: guideHref,
      detail: teamDetail(teamsWithGuide, teamCount),
    },
    {
      id: `${stage}-schedule`,
      title: 'Save interview schedule',
      completed: teamCount > 0 && teamsScheduled === teamCount,
      actionLabel: 'Schedule Interviews',
      href: scheduleHref,
      detail: teamDetail(teamsScheduled, teamCount),
    },
  ];

  for (const team of teamProgress) {
    const { total, completed } = team.scoring;
    steps.push({
      id: `${stage}-score-${team.teamId}`,
      title: `${team.teamName} Interviews Scored`,
      completed: team.scoringComplete,
      actionLabel: 'Track Scoring',
      // Team phase page — not the dashboard overview (same-page no-op when already there).
      href: adminTeamPhaseHref(team.teamId, stage),
      detail: total > 0 ? `${completed}/${total} scored` : 'No assignments yet',
    });
  }

  // First-round advancement (submit → approve → email) mirrors application flow.
  // Counts only from_stage = 'first_round' (not application → first_round lists).
  if (stage === 'first_round') {
    const allScoringDone =
      teamCount > 0 && teamProgress.every((t) => t.scoringComplete || t.candidateCount === 0);

    const roundIds = eligibleTeams.map((t) => t.round.id);
    const teamIds = eligibleTeams.map((t) => t.teamId);
    const [submittedTeams, approvedTeams, pendingCount, emailedTeams, cappedTeams] =
      await Promise.all([
        teamsWithSubmittedAdvancement(roundIds, 'first_round'),
        teamsWithApprovedAdvancement(roundIds, 'first_round'),
        listPendingAdvancementSubmissions('first_round').then((rows) => rows.length),
        countTeamsWithCompleteOutcomeEmails(
          eligibleTeams.map((t) => ({ teamId: t.teamId, roundId: t.round.id })),
          'first_round',
        ),
        teamsWithAdvancementCap(teamIds, 'first_round'),
      ]);
    const pending = pendingCount;
    steps.push(
      {
        id: `${stage}-advancement-caps`,
        title: 'Set advancement limits',
        completed: teamCount > 0 && cappedTeams === teamCount,
        actionLabel: 'Configure caps',
        href: ADMIN_ADVANCEMENT_CAPS_HREF,
        description:
          'Set each team’s first-round advancement limit on the Advancements page before directors can submit their list.',
        detail: teamDetail(cappedTeams, teamCount),
      },
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
  const teamsInPhase = countTeamsAtOrPastStatus(withRound, 'deliberations');
  const delibsUnlocked = unlockedStages.includes('deliberations');
  const notAdvancedYet = teamsInPhase === 0;
  const teamKeys = withRound.map((t) => ({
    teamId: t.teamId,
    roundId: t.round.id,
    teamName: t.teamName,
  }));
  const finalSelectionByTeam = await batchDeliberationsFinalSelectionComplete(teamKeys);
  const finalizedTeams = [...finalSelectionByTeam.values()].filter(Boolean).length;
  // Prefer a team that still needs final selection; when all done (or none), use the hub.
  const incompleteTeam = withRound.find((t) => !finalSelectionByTeam.get(t.teamId));
  const openDeliberationsHref = incompleteTeam
    ? openTeamDeliberationsHref(incompleteTeam.teamId)
    : DELIBERATIONS_WORKSPACE_PATH;

  return [
    advanceTeamsStep('deliberations', teamsInPhase, teamCount),
    {
      id: 'delib-unlock',
      title: 'Unlock Deliberations',
      completed: teamsInPhase > 0 && delibsUnlocked,
      actionLabel: notAdvancedYet ? 'Advance teams first' : 'Unlock on dashboard',
      href: PIPELINE_CONTROLS_HREF,
      description: notAdvancedYet
        ? 'No teams have been advanced to Deliberations yet. Advance teams on the Team Phases cards above first — unlock is only available after a team reaches this phase.'
        : 'Use the Team Phases cards to unlock Deliberations for each team when execs should start.',
      detail: notAdvancedYet
        ? 'Advance first'
        : delibsUnlocked
          ? 'Open for execs'
          : 'Locked',
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
      // No dedicated export pipeline yet — keep copy honest with the destination.
      title: 'Review closed cycle',
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
      return buildInterviewChecklist('first_round', withRound, unlockedStages);
    case 'final_round':
      return buildInterviewChecklist('final_round', withRound, unlockedStages);
    case 'deliberations':
      return buildDeliberationsChecklist(withRound, unlockedStages);
    case 'closed':
      return buildClosedChecklist(withRound);
    default:
      return [];
  }
}
