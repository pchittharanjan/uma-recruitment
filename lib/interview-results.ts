import { getDb, getTeamById } from '@/lib/db';
import { advancedStageForTeam } from '@/lib/team-pipeline-profile';
import { interviewScoreFieldsFromGuide, interviewWeightedTotal } from '@/lib/interview-guide';
import {
  getInterviewGuideForRound,
  type InterviewSlotStage,
} from '@/lib/interview-slots';

export interface InterviewResultsAssignment {
  assignmentId: number;
  userId: number;
  interviewerName: string;
  status: string;
  scores: Record<string, number>;
  total: number | null;
  comment: string | null;
}

export interface InterviewResultsCandidate {
  applicationId: number;
  rowIndex: number;
  candidateName: string;
  assignments: InterviewResultsAssignment[];
  average: number | null;
  rank: number | null;
}

export interface InterviewResultsData {
  teamId: number;
  roundId: number;
  stage: InterviewSlotStage;
  scoreFields: string[];
  candidates: InterviewResultsCandidate[];
  progress: { total: number; completed: number };
}

function assignmentTotal(
  scores: Record<string, number>,
  guide: Parameters<typeof interviewWeightedTotal>[1],
  scoreFields: string[],
): number | null {
  const weighted = interviewWeightedTotal(scores, guide);
  if (weighted !== null) return weighted;
  if (scoreFields.length === 0) return null;
  const values = scoreFields.map((field) => scores[field]).filter((v) => v !== undefined);
  if (values.length !== scoreFields.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function rankCandidates(
  candidates: Array<Omit<InterviewResultsCandidate, 'rank'>>,
): InterviewResultsCandidate[] {
  const scored = candidates
    .filter((c) => c.average !== null)
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  const unscored = candidates
    .filter((c) => c.average === null)
    .sort((a, b) => a.rowIndex - b.rowIndex);

  let currentRank = 1;
  const ranked: InterviewResultsCandidate[] = [];

  for (let i = 0; i < scored.length; i++) {
    if (i > 0 && scored[i].average !== scored[i - 1].average) {
      currentRank = i + 1;
    }
    ranked.push({ ...scored[i], rank: currentRank });
  }

  for (const candidate of unscored) {
    ranked.push({ ...candidate, rank: null });
  }

  return ranked;
}

export async function buildInterviewResults(
  teamId: number,
  roundId: number,
  stage: InterviewSlotStage,
): Promise<InterviewResultsData> {
  const db = getDb();
  const interviewGuide = await getInterviewGuideForRound(roundId, stage);
  const scoreFields = interviewScoreFieldsFromGuide(interviewGuide);

  const appsResult = await db.execute({
    sql: `SELECT app.id, app.row_index, c.name as candidate_name,
                 asgn.id as assignment_id, asgn.user_id, asgn.status as asgn_status, asgn.comment as asgn_comment,
                 u.name as interviewer_name
          FROM applications app
          JOIN candidates c ON c.id = app.candidate_id
          LEFT JOIN assignments asgn ON asgn.application_id = app.id AND asgn.stage = ?
          LEFT JOIN users u ON u.id = asgn.user_id
          WHERE app.team_id = ? AND app.round_id = ? AND app.stage = ?
          ORDER BY app.row_index ASC, asgn.id ASC`,
    args: [stage, teamId, roundId, stage],
  });

  const scoresResult = await db.execute({
    sql: `SELECT s.assignment_id, s.field_name, s.score
          FROM scores s
          JOIN assignments asgn ON asgn.id = s.assignment_id
          JOIN applications app ON app.id = asgn.application_id
          WHERE app.team_id = ? AND app.round_id = ? AND asgn.stage = ? AND app.stage = ?`,
    args: [teamId, roundId, stage, stage],
  });

  const scoresByAssignment: Record<number, Record<string, number>> = {};
  for (const row of scoresResult.rows) {
    const assignmentId = row.assignment_id as number;
    const score = row.score as number | null;
    if (score == null) continue;
    if (!scoresByAssignment[assignmentId]) scoresByAssignment[assignmentId] = {};
    scoresByAssignment[assignmentId][row.field_name as string] = score;
  }

  const candidateMap = new Map<number, Omit<InterviewResultsCandidate, 'rank' | 'average'>>();

  for (const row of appsResult.rows) {
    const applicationId = row.id as number;
    if (!candidateMap.has(applicationId)) {
      candidateMap.set(applicationId, {
        applicationId,
        rowIndex: (row.row_index as number | null) ?? 0,
        candidateName: row.candidate_name as string,
        assignments: [],
      });
    }

    if (row.assignment_id !== null) {
      const assignmentId = row.assignment_id as number;
      const scores = scoresByAssignment[assignmentId] ?? {};
      candidateMap.get(applicationId)!.assignments.push({
        assignmentId,
        userId: row.user_id as number,
        interviewerName: row.interviewer_name as string,
        status: row.asgn_status as string,
        scores,
        total: assignmentTotal(scores, interviewGuide, scoreFields),
        comment: (row.asgn_comment as string | null) ?? null,
      });
    }
  }

  const withAverages = Array.from(candidateMap.values()).map((candidate) => {
    const completedTotals = candidate.assignments
      .map((assignment) => assignment.total)
      .filter((total): total is number => total !== null);
    const average =
      completedTotals.length > 0
        ? completedTotals.reduce((sum, total) => sum + total, 0) / completedTotals.length
        : null;
    return { ...candidate, average };
  });

  const progressResult = await db.execute({
    sql: `SELECT COUNT(*) as total,
                 SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed
          FROM assignments a
          JOIN applications app ON app.id = a.application_id
          WHERE app.team_id = ? AND app.round_id = ? AND a.stage = ? AND app.stage = ?`,
    args: [teamId, roundId, stage, stage],
  });

  return {
    teamId,
    roundId,
    stage,
    scoreFields,
    candidates: rankCandidates(withAverages),
    progress: {
      total: (progressResult.rows[0]?.total as number) ?? 0,
      completed: (progressResult.rows[0]?.completed as number) ?? 0,
    },
  };
}

export interface RankedInterviewCandidate {
  id: number;
  rowIndex: number;
  candidateName: string;
  average: number;
  rank: number;
}

export async function computeInterviewRankings(
  teamId: number,
  roundId: number,
  stage: InterviewSlotStage,
): Promise<{
  ranked: RankedInterviewCandidate[];
  incompleteCount: number;
}> {
  const results = await buildInterviewResults(teamId, roundId, stage);
  const incompleteCount = results.progress.total - results.progress.completed;

  const ranked: RankedInterviewCandidate[] = results.candidates
    .filter((c) => c.average !== null && c.rank !== null)
    .map((c) => ({
      id: c.applicationId,
      rowIndex: c.rowIndex,
      candidateName: c.candidateName,
      average: Math.round((c.average as number) * 1000) / 1000,
      rank: c.rank as number,
    }));

  return { ranked, incompleteCount };
}

export async function applyInterviewAdvancementSelection(
  teamId: number,
  roundId: number,
  advancedApplicationIds: number[],
): Promise<void> {
  const team = await getTeamById(teamId);
  const teamName = team?.name ?? 'Strategy';
  const targetStage = advancedStageForTeam('first_round', teamName);
  const { ranked } = await computeInterviewRankings(teamId, roundId, 'first_round');
  const advancedSet = new Set(advancedApplicationIds);
  const db = getDb();

  for (const app of ranked) {
    const stage = advancedSet.has(app.id) ? targetStage : 'rejected';
    await db.execute({
      sql: `UPDATE applications SET final_score = ?, rank = ?, stage = ?
            WHERE id = ? AND team_id = ? AND stage = 'first_round'`,
      args: [app.average, app.rank, stage, app.id, teamId],
    });
  }
}
