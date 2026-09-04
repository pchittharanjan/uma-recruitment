import type {
  AdvancementFromStage,
  AdvancementPanelVerdict,
  AdvancementSubmission,
} from '@/lib/advancement-submissions-types';
import {
  getAdvancementPreview,
  getLatestAdvancementSubmission,
  isAdvancementReadOnly,
  listAdvancementSubmissionHistory,
} from '@/lib/advancement-submissions';
import { listAdminAdvancementVerdicts } from '@/lib/admin-advancement-verdicts';
import { listTeamAdvancementVerdicts } from '@/lib/advancement-verdicts';
import type { AdvancementVerdict } from '@/lib/advancement-verdict-types';
import {
  resolveAdvancementSelectionMax,
  resolveAdvancementSelectionMin,
  teamAllowsUncappedFirstRoundAdvancement,
} from '@/lib/advancement-cap-helpers';
import { getTeamAdvancementCapState } from '@/lib/team-advancement-caps';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { getRecruitmentCycleLabel } from '@/lib/org-recruitment-cycle-server';
import type { User } from '@/lib/db';
import { getDb, getTeamById } from '@/lib/db';
import { cachedPerRequest } from '@/lib/request-cache';
import {
  advancedStageForTeam,
  revertSourceStagesForTeam,
} from '@/lib/team-pipeline-profile';

export type AdvancementOutcomeLabel = 'advanced' | 'rejected' | 'on_list' | 'pending';

export interface AdminAdvancementApplicantRow {
  applicationId: number;
  rowIndex: number;
  candidateName: string;
  average: number;
  rawAverage?: number;
  rank: number;
  adminVerdict: AdvancementVerdict | null;
  panelVerdicts: AdvancementPanelVerdict[];
}

export interface AdminAdvancementWorkspace {
  teamId: number;
  teamName: string | null;
  fromStage: AdvancementFromStage;
  round: { id: number; label: string; status: string };
  advancementCap: number | null;
  overCapExtra: number;
  selectionMin: number | null;
  selectionMax: number | null;
  allowUncappedFirstRound: boolean;
  preview: {
    applications: AdminAdvancementApplicantRow[];
    incompleteCount: number;
    totalApplications: number;
  };
  submission: AdvancementSubmission | null;
  history: AdvancementSubmission[];
  readOnly: boolean;
  canAct: boolean;
}

export async function getAdminAdvancementWorkspace(
  admin: User,
  teamId: number,
  fromStage: AdvancementFromStage,
): Promise<AdminAdvancementWorkspace> {
  if (admin.role !== 'admin') {
    throw new Error('Only admins can access admin advancement workspace.');
  }

  const round = await getActiveRoundForTeam(teamId);
  if (!round) throw new Error('No active round for this team.');

  const previewRaw = await getAdvancementPreview(teamId, round.id, fromStage);
  const applicationIds = previewRaw.applications.map((app) => app.applicationId);

  const [panelByApp, adminByApp, submission, history, recruitmentCycleLabel, capState] =
    await Promise.all([
      listTeamAdvancementVerdicts(teamId, round.id, fromStage, applicationIds),
      listAdminAdvancementVerdicts(teamId, round.id, fromStage, admin.id, applicationIds),
      getLatestAdvancementSubmission(teamId, round.id, fromStage),
      listAdvancementSubmissionHistory(teamId, round.id, fromStage),
      getRecruitmentCycleLabel(),
      getTeamAdvancementCapState(teamId, fromStage),
    ]);

  const applications: AdminAdvancementApplicantRow[] = previewRaw.applications.map((app) => {
    const panelRows = panelByApp.get(app.applicationId) ?? [];
    const rawAverage = 'rawAverage' in app ? app.rawAverage : undefined;
    return {
      applicationId: app.applicationId,
      rowIndex: app.rowIndex,
      candidateName: app.candidateName ?? app.displayId,
      average: app.average,
      ...(rawAverage !== undefined ? { rawAverage } : {}),
      rank: app.rank,
      adminVerdict: adminByApp.get(app.applicationId) ?? null,
      panelVerdicts: panelRows.map((row) => ({
        name: row.name,
        verdict: row.verdict,
      })),
    };
  });

  const readOnly = isAdvancementReadOnly(round.status, fromStage);
  const canAct = !readOnly && submission?.status !== 'approved';
  const { cap: advancementCap, overCapExtra } = capState;
  const team = await getTeamById(teamId);
  const allowUncappedFirstRound =
    fromStage === 'first_round' &&
    Boolean(team?.name && teamAllowsUncappedFirstRoundAdvancement(team.name));
  const previousSubmittedCount =
    submission?.status === 'submitted' ? submission.candidates.length : null;
  const selectionMin = resolveAdvancementSelectionMin({
    cap: advancementCap,
    totalRanked: previewRaw.totalApplications,
    overCapExtra,
    allowUncapped: allowUncappedFirstRound,
  });
  const selectionMax = resolveAdvancementSelectionMax({
    cap: advancementCap,
    totalRanked: previewRaw.totalApplications,
    overCapExtra,
    previousSubmittedCount,
    allowUncapped: allowUncappedFirstRound,
  });

  return {
    teamId,
    teamName: team?.name ?? null,
    fromStage,
    round: { id: round.id, label: recruitmentCycleLabel, status: round.status },
    advancementCap,
    overCapExtra,
    selectionMin,
    selectionMax,
    allowUncappedFirstRound,
    preview: {
      applications,
      incompleteCount: previewRaw.incompleteCount,
      totalApplications: previewRaw.totalApplications,
    },
    submission,
    history,
    readOnly,
    canAct,
  };
}

export interface TeamAdvancementOutcomeRow {
  applicationId: number;
  rowIndex: number;
  candidateName: string;
  stage: string;
  outcome: AdvancementOutcomeLabel;
  average: number | null;
  rank: number | null;
}

export interface TeamAdvancementOutcome {
  rows: TeamAdvancementOutcomeRow[];
  advancedCount: number;
  rejectedCount: number;
  onListCount: number;
  pendingCount: number;
  canRevert: boolean;
  revertBlockedReason: string | null;
}

function advancedStageFor(fromStage: AdvancementFromStage, teamName: string): string {
  return advancedStageForTeam(fromStage, teamName);
}

function outcomeForRow(
  stage: string,
  fromStage: AdvancementFromStage,
  teamName: string,
  onSubmittedList: boolean,
  submissionStatus: string | undefined,
): AdvancementOutcomeLabel {
  const advancedStage = advancedStageFor(fromStage, teamName);
  if (stage === advancedStage) return 'advanced';
  if (stage === 'rejected') return 'rejected';
  if (submissionStatus === 'submitted' && onSubmittedList) return 'on_list';
  return 'pending';
}

function outcomeSortRank(outcome: AdvancementOutcomeLabel): number {
  switch (outcome) {
    case 'advanced':
    case 'on_list':
      return 0;
    case 'rejected':
      return 1;
    default:
      return 2;
  }
}

function revertSourceStages(fromStage: AdvancementFromStage, teamName: string): string[] {
  return revertSourceStagesForTeam(fromStage, teamName);
}

function requiredGlobalStatus(fromStage: AdvancementFromStage): 'application' | 'first_round' {
  return fromStage;
}

export async function getTeamAdvancementOutcome(
  teamId: number,
  roundId: number,
  fromStage: AdvancementFromStage,
): Promise<TeamAdvancementOutcome> {
  return cachedPerRequest(
    `advancementOutcome:${teamId}:${roundId}:${fromStage}`,
    () => getTeamAdvancementOutcomeUncached(teamId, roundId, fromStage),
  );
}

async function getTeamAdvancementOutcomeUncached(
  teamId: number,
  roundId: number,
  fromStage: AdvancementFromStage,
): Promise<TeamAdvancementOutcome> {
  const team = await getTeamById(teamId);
  const teamName = team?.name ?? 'Strategy';
  const db = getDb();
  const [result, roundRow, submission] = await Promise.all([
    db.execute({
      sql: `SELECT app.id, app.row_index, app.stage, app.final_score, app.rank, c.name as candidate_name
            FROM applications app
            JOIN candidates c ON c.id = app.candidate_id
            WHERE app.team_id = ? AND app.round_id = ?
            ORDER BY
              CASE app.stage
                WHEN ? THEN 0
                WHEN 'rejected' THEN 1
                ELSE 2
              END,
              app.rank ASC,
              app.row_index ASC`,
      args: [teamId, roundId, advancedStageFor(fromStage, teamName)],
    }),
    db.execute({
      sql: 'SELECT status FROM rounds WHERE id = ?',
      args: [roundId],
    }),
    getLatestAdvancementSubmission(teamId, roundId, fromStage),
  ]);

  const teamRoundStatus = (roundRow.rows[0]?.status as string | undefined) ?? null;

  const submittedIds = new Set(
    submission && (submission.status === 'submitted' || submission.status === 'approved')
      ? submission.candidates.map((candidate) => candidate.applicationId)
      : [],
  );

  const rows: TeamAdvancementOutcomeRow[] = result.rows.map((row) => {
    const stage = row.stage as string;
    const applicationId = row.id as number;
    const average =
      row.final_score === null || row.final_score === undefined
        ? null
        : Math.round((row.final_score as number) * 1000) / 1000;
    return {
      applicationId,
      rowIndex: (row.row_index as number | null) ?? 0,
      candidateName: row.candidate_name as string,
      stage,
      outcome: outcomeForRow(
        stage,
        fromStage,
        teamName,
        submittedIds.has(applicationId),
        submission?.status,
      ),
      average,
      rank: (row.rank as number | null) ?? null,
    };
  });

  rows.sort((a, b) => {
    const rankDelta = outcomeSortRank(a.outcome) - outcomeSortRank(b.outcome);
    if (rankDelta !== 0) return rankDelta;
    if ((a.rank ?? Infinity) !== (b.rank ?? Infinity)) {
      return (a.rank ?? Infinity) - (b.rank ?? Infinity);
    }
    return a.rowIndex - b.rowIndex;
  });

  const advancedCount = rows.filter((row) => row.outcome === 'advanced').length;
  const rejectedCount = rows.filter((row) => row.outcome === 'rejected').length;
  const onListCount = rows.filter((row) => row.outcome === 'on_list').length;
  const pendingCount = rows.filter((row) => row.outcome === 'pending').length;
  const hasMoved = advancedCount + rejectedCount > 0;

  let canRevert = hasMoved;
  let revertBlockedReason: string | null = null;
  if (teamRoundStatus !== requiredGlobalStatus(fromStage)) {
    canRevert = false;
    revertBlockedReason = `${teamName} has already moved past ${requiredGlobalStatus(fromStage).replace('_', ' ')}.`;
  } else if (!hasMoved) {
    canRevert = false;
    revertBlockedReason = 'No applicants have been advanced or rejected yet.';
  } else if (submission?.status === 'submitted') {
    canRevert = false;
    revertBlockedReason =
      'A Director submission is pending review. Approve or ask the team to update it before reverting.';
  }

  return {
    rows,
    advancedCount,
    rejectedCount,
    onListCount,
    pendingCount,
    canRevert,
    revertBlockedReason,
  };
}

export async function revertTeamAdvancement(
  admin: User,
  teamId: number,
  roundId: number,
  fromStage: AdvancementFromStage,
): Promise<{ revertedCount: number }> {
  const outcome = await getTeamAdvancementOutcome(teamId, roundId, fromStage);
  if (!outcome.canRevert) {
    throw new Error(outcome.revertBlockedReason ?? 'This advancement cannot be reverted.');
  }

  const team = await getTeamById(teamId);
  const teamName = team?.name ?? 'Strategy';
  const db = getDb();
  const targetStage = requiredGlobalStatus(fromStage);
  const sourceStages = revertSourceStages(fromStage, teamName);
  const placeholders = sourceStages.map(() => '?').join(', ');

  const updateResult = await db.execute({
    sql: `UPDATE applications
          SET stage = ?, final_score = NULL, rank = NULL, rejected_from_stage = NULL
          WHERE team_id = ? AND round_id = ? AND stage IN (${placeholders})`,
    args: [targetStage, teamId, roundId, ...sourceStages],
  });

  const submission = await getLatestAdvancementSubmission(teamId, roundId, fromStage);
  if (submission && (submission.status === 'approved' || submission.status === 'submitted')) {
    await db.execute({
      sql: `UPDATE team_advancement_submissions
            SET status = 'withdrawn', reviewed_by = ?, reviewed_at = unixepoch()
            WHERE id = ?`,
      args: [admin.id, submission.id],
    });
  }

  return { revertedCount: updateResult.rowsAffected ?? 0 };
}
