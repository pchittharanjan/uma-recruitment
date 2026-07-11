import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import { getLatestAdvancementSubmission } from '@/lib/advancement-submissions';
import type { User } from '@/lib/db';
import { getDb } from '@/lib/db';
import { getGlobalPipelineState } from '@/lib/pipeline-phase';

export type AdvancementOutcomeLabel = 'advanced' | 'rejected' | 'pending';

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
  pendingCount: number;
  canRevert: boolean;
  revertBlockedReason: string | null;
}

function advancedStageFor(fromStage: AdvancementFromStage): string {
  return fromStage === 'application' ? 'first_round' : 'final_round';
}

function outcomeForStage(
  stage: string,
  fromStage: AdvancementFromStage,
): AdvancementOutcomeLabel {
  const advancedStage = advancedStageFor(fromStage);
  if (stage === advancedStage) return 'advanced';
  if (stage === 'rejected') return 'rejected';
  return 'pending';
}

function revertSourceStages(fromStage: AdvancementFromStage): string[] {
  return fromStage === 'application' ? ['first_round', 'rejected'] : ['final_round', 'rejected'];
}

function requiredGlobalStatus(fromStage: AdvancementFromStage): 'application' | 'first_round' {
  return fromStage;
}

export async function getTeamAdvancementOutcome(
  teamId: number,
  roundId: number,
  fromStage: AdvancementFromStage,
): Promise<TeamAdvancementOutcome> {
  const db = getDb();
  const [result, globalState, submission] = await Promise.all([
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
      args: [teamId, roundId, advancedStageFor(fromStage)],
    }),
    getGlobalPipelineState(),
    getLatestAdvancementSubmission(teamId, roundId, fromStage),
  ]);

  const rows: TeamAdvancementOutcomeRow[] = result.rows.map((row) => {
    const stage = row.stage as string;
    const average =
      row.final_score === null || row.final_score === undefined
        ? null
        : Math.round((row.final_score as number) * 1000) / 1000;
    return {
      applicationId: row.id as number,
      rowIndex: (row.row_index as number | null) ?? 0,
      candidateName: row.candidate_name as string,
      stage,
      outcome: outcomeForStage(stage, fromStage),
      average,
      rank: (row.rank as number | null) ?? null,
    };
  });

  const advancedCount = rows.filter((row) => row.outcome === 'advanced').length;
  const rejectedCount = rows.filter((row) => row.outcome === 'rejected').length;
  const pendingCount = rows.filter((row) => row.outcome === 'pending').length;
  const hasMoved = advancedCount + rejectedCount > 0;

  let canRevert = hasMoved;
  let revertBlockedReason: string | null = null;
  if (globalState.status !== requiredGlobalStatus(fromStage)) {
    canRevert = false;
    revertBlockedReason = `The global pipeline has already moved past ${requiredGlobalStatus(fromStage).replace('_', ' ')}.`;
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

  const db = getDb();
  const targetStage = requiredGlobalStatus(fromStage);
  const sourceStages = revertSourceStages(fromStage);
  const placeholders = sourceStages.map(() => '?').join(', ');

  const updateResult = await db.execute({
    sql: `UPDATE applications
          SET stage = ?, final_score = NULL, rank = NULL
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
