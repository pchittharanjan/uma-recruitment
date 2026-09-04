import { userHasTeamAccess } from '@/lib/access';
import { buildApplicationAdvancementContext, buildFirstRoundAdvancementContext } from '@/lib/advancement-interview-context';
import { isTeamDirector } from '@/lib/directors';
import { applicantDisplayId } from '@/lib/blind';
import { extractCandidateFromFields } from '@/lib/candidates';
import { getDb, getTeamById, type User } from '@/lib/db';
import {
  applyInterviewAdvancementSelection,
  computeInterviewRankings,
} from '@/lib/interview-results';
import { pipelineClosedEditLock } from '@/lib/pipeline-writable';
import { cachedPerRequest } from '@/lib/request-cache';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { statusIndex } from '@/lib/stages';
import {
  applyAdvancementSelection,
  computeNormalizedRankings,
  type RankedApplication,
} from '@/lib/team-dashboard';
import type {
  AdvancementCandidate,
  AdvancementCandidateBlind,
  AdvancementFromStage,
  AdvancementApplicationContext,
  AdvancementInterviewContext,
  AdvancementSubmission,
  AdvancementSubmissionBlind,
  AdvancementSubmissionStatus,
  GradingEditLock,
  GradingEditLockReason,
} from '@/lib/advancement-submissions-types';
import {
  resolveAdvancementCapMax,
  resolveAdvancementSelectionMax,
  resolveAdvancementSelectionMin,
  teamAllowsUncappedFirstRoundAdvancement,
} from '@/lib/advancement-cap-helpers';
import { getTeamAdvancementCapState } from '@/lib/team-advancement-caps';

export type {
  AdvancementCandidate,
  AdvancementCandidateBlind,
  AdvancementFromStage,
  AdvancementSubmission,
  AdvancementSubmissionBlind,
  AdvancementSubmissionStatus,
  GradingEditLock,
  GradingEditLockReason,
} from '@/lib/advancement-submissions-types';
export { advancementFromStageLabel } from '@/lib/advancement-submissions-types';
export {
  resolveRequiredAdvancementCount,
  resolveAdvancementSelectionMax,
  resolveAdvancementSelectionMin,
} from '@/lib/advancement-cap-helpers';

function poolNote(cap: number | null, totalRanked: number, official: number | null): string {
  return official !== null && cap !== null && official < cap
    ? ` (pool has only ${totalRanked}).`
    : '.';
}

/**
 * Selection count rules (see resolveAdvancementSelectionMin/Max):
 * - Normal: exactly min(N, pool)
 * - With overCapExtra: count >= min(N, pool) and count <= min(pool, N + extra)
 * - Lowered cap with pending over picks: official <= count <= previousSubmittedCount
 */
function validateAdvancementSelection(
  selectedIds: number[],
  options: {
    cap: number | null;
    totalRanked: number;
    overCapExtra: number;
    previousSubmittedCount?: number | null;
    allowUncapped?: boolean;
  },
): void {
  const { cap, totalRanked, overCapExtra, previousSubmittedCount, allowUncapped = false } =
    options;
  if (cap === null && !allowUncapped) {
    throw new Error('Advancement limit is not configured for this team. Contact an admin.');
  }

  const minRequired = resolveAdvancementSelectionMin({
    cap,
    totalRanked,
    overCapExtra,
    allowUncapped,
  });
  const maxAllowed = resolveAdvancementSelectionMax({
    cap,
    totalRanked,
    overCapExtra,
    previousSubmittedCount,
    allowUncapped,
  });
  if (minRequired === null || maxAllowed === null) {
    throw new Error('Advancement limit is not configured for this team. Contact an admin.');
  }

  const official = resolveAdvancementCapMax(cap, totalRanked);
  const count = selectedIds.length;

  if (count < minRequired) {
    if (minRequired === maxAllowed) {
      throw new Error(
        `Select exactly ${minRequired} applicant${minRequired === 1 ? '' : 's'} to advance` +
          poolNote(cap, totalRanked, official),
      );
    }
    throw new Error(
      `Select at least ${minRequired} applicant${minRequired === 1 ? '' : 's'} to advance` +
        poolNote(cap, totalRanked, official),
    );
  }

  if (count > maxAllowed) {
    if (overCapExtra > 0) {
      throw new Error(
        `Select at most ${maxAllowed} applicant${maxAllowed === 1 ? '' : 's'} to advance.`,
      );
    }
    if (
      previousSubmittedCount != null &&
      previousSubmittedCount > (official ?? 0) &&
      count > previousSubmittedCount
    ) {
      throw new Error(
        `Selection is over the current limit of ${official}. You may keep up to ${previousSubmittedCount} from your pending list, but cannot add more unless an admin raises the limit or you enter the go-over code.`,
      );
    }
    throw new Error(
      `Select exactly ${maxAllowed} applicant${maxAllowed === 1 ? '' : 's'} to advance` +
        poolNote(cap, totalRanked, official),
    );
  }
}

function toBlindCandidate(candidate: AdvancementCandidate): AdvancementCandidateBlind {
  return {
    applicationId: candidate.applicationId,
    rowIndex: candidate.rowIndex,
    displayId: applicantDisplayId(candidate.rowIndex),
    average: candidate.average,
    ...(candidate.rawAverage !== undefined ? { rawAverage: candidate.rawAverage } : {}),
    rank: candidate.rank,
  };
}

export function blindAdvancementSubmission(
  submission: AdvancementSubmission,
): AdvancementSubmissionBlind {
  return {
    ...submission,
    candidates: submission.candidates.map(toBlindCandidate),
  };
}

function toCandidates(ranked: RankedApplication[], applicationIds: number[]): AdvancementCandidate[] {
  const idSet = new Set(applicationIds);
  return ranked
    .filter((app) => idSet.has(app.id))
    .map((app) => ({
      applicationId: app.id,
      rowIndex: app.rowIndex,
      candidateName: extractCandidateFromFields(app.fields).name,
      average: Math.round(app.average * 1000) / 1000,
      rawAverage: Math.round(app.rawAverage * 1000) / 1000,
      rank: app.rank,
    }));
}

function toInterviewCandidates(
  ranked: Awaited<ReturnType<typeof computeInterviewRankings>>['ranked'],
  applicationIds: number[],
): AdvancementCandidate[] {
  const idSet = new Set(applicationIds);
  return ranked
    .filter((app) => idSet.has(app.id))
    .map((app) => ({
      applicationId: app.id,
      rowIndex: app.rowIndex,
      candidateName: app.candidateName,
      average: app.average,
      rank: app.rank,
    }));
}

function parseFromStage(value: unknown): AdvancementFromStage {
  return value === 'first_round' ? 'first_round' : 'application';
}

function rowToSubmission(row: Record<string, unknown>): AdvancementSubmission {
  const candidates = JSON.parse(row.candidates as string) as AdvancementCandidate[];
  return {
    id: row.id as number,
    roundId: row.round_id as number,
    teamId: row.team_id as number,
    fromStage: parseFromStage(row.from_stage),
    topN: row.top_n as number,
    candidates,
    status: row.status as AdvancementSubmissionStatus,
    submittedBy: {
      id: row.submitted_by as number,
      name: row.submitter_name as string,
      email: row.submitter_email as string,
    },
    submittedAt: row.submitted_at as number,
    reviewedBy:
      row.reviewed_by === null
        ? null
        : {
            id: row.reviewed_by as number,
            name: row.reviewer_name as string,
            email: row.reviewer_email as string,
          },
    reviewedAt: (row.reviewed_at as number | null) ?? null,
  };
}

function advancementReadOnlyAfter(fromStage: AdvancementFromStage): 'application' | 'first_round' {
  return fromStage;
}

export async function getAdvancementPreview(
  teamId: number,
  roundId: number,
  fromStage: AdvancementFromStage = 'application',
  options?: { viewerUserId?: number },
) {
  if (fromStage === 'first_round') {
    const { ranked, incompleteCount } = await computeInterviewRankings(
      teamId,
      roundId,
      'first_round',
    );
    const applications = ranked.map((app) => ({
      applicationId: app.id,
      rowIndex: app.rowIndex,
      displayId: app.candidateName,
      candidateName: app.candidateName,
      average: app.average,
      rank: app.rank,
    }));

    let interviewContext: Record<number, AdvancementInterviewContext> | undefined;
    if (options?.viewerUserId) {
      const contextMap = await buildFirstRoundAdvancementContext(
        teamId,
        roundId,
        options.viewerUserId,
        applications.map((app) => app.applicationId),
      );
      interviewContext = Object.fromEntries(contextMap);
    }

    return {
      applications,
      incompleteCount,
      totalApplications: ranked.length,
      interviewContext,
    };
  }

  const { ranked, incompleteCount } = await computeNormalizedRankings(teamId, roundId);
  const applications = ranked.map((app) => ({
    applicationId: app.id,
    rowIndex: app.rowIndex,
    displayId: applicantDisplayId(app.rowIndex),
    candidateName: extractCandidateFromFields(app.fields).name,
    average: Math.round(app.average * 1000) / 1000,
    rawAverage: Math.round(app.rawAverage * 1000) / 1000,
    rank: app.rank,
  }));

  let applicationContext: Record<number, AdvancementApplicationContext> | undefined;
  if (options?.viewerUserId) {
    const contextMap = await buildApplicationAdvancementContext(
      teamId,
      roundId,
      options.viewerUserId,
      applications.map((app) => app.applicationId),
    );
    applicationContext = Object.fromEntries(contextMap);
  }

  return {
    applications,
    incompleteCount,
    totalApplications: ranked.length,
    applicationContext,
  };
}

export async function getLatestAdvancementSubmission(
  teamId: number,
  roundId: number,
  fromStage: AdvancementFromStage = 'application',
): Promise<AdvancementSubmission | null> {
  return cachedPerRequest(
    `latestAdvancementSubmission:${teamId}:${roundId}:${fromStage}`,
    async () => {
      const history = await listAdvancementSubmissionHistory(teamId, roundId, fromStage);
      return history[0] ?? null;
    },
  );
}

function lockMessages(fromStage: AdvancementFromStage): {
  approved: string;
  submitted: string;
} {
  if (fromStage === 'first_round') {
    return {
      approved:
        "Admin approved your team's advancement list. First Round Interview scores and comments can no longer be changed.",
      submitted:
        "Your team submitted its advancement list for admin review. First Round Interview scores and comments are locked until admin approves or the list is updated.",
    };
  }
  return {
    approved:
      "Admin approved your team's advancement list. Scores and comments can no longer be changed.",
    submitted:
      "Your team submitted its advancement list for admin review. Scores and comments are locked until admin approves or the list is updated.",
  };
}

/** Scores/comments lock once the team submits advancement; stays locked after approval. */
export async function getGradingEditLock(
  teamId: number,
  roundId: number,
  fromStage: AdvancementFromStage = 'application',
): Promise<GradingEditLock> {
  const closedLock = await pipelineClosedEditLock();
  if (closedLock) return closedLock;

  const submission = await getLatestAdvancementSubmission(teamId, roundId, fromStage);
  if (!submission || submission.status === 'withdrawn') {
    return { locked: false, reason: null, message: '' };
  }
  const messages = lockMessages(fromStage);
  if (submission.status === 'approved') {
    return {
      locked: true,
      reason: 'approved',
      message: messages.approved,
    };
  }
  return {
    locked: true,
    reason: 'submitted',
    message: messages.submitted,
  };
}

export async function listAdvancementSubmissionHistory(
  teamId: number,
  roundId: number,
  fromStage?: AdvancementFromStage,
): Promise<AdvancementSubmission[]> {
  return cachedPerRequest(`advSubHistory:${teamId}:${roundId}:${fromStage ?? 'all'}`, () =>
    listAdvancementSubmissionHistoryUncached(teamId, roundId, fromStage),
  );
}

async function listAdvancementSubmissionHistoryUncached(
  teamId: number,
  roundId: number,
  fromStage?: AdvancementFromStage,
): Promise<AdvancementSubmission[]> {
  const db = getDb();
  const args: (number | string)[] = [teamId, roundId];
  let stageFilter = '';
  if (fromStage) {
    stageFilter = ' AND s.from_stage = ?';
    args.push(fromStage);
  }
  const result = await db.execute({
    sql: `SELECT s.*, u.name as submitter_name, u.email as submitter_email,
                 r.name as reviewer_name, r.email as reviewer_email
          FROM team_advancement_submissions s
          JOIN users u ON u.id = s.submitted_by
          LEFT JOIN users r ON r.id = s.reviewed_by
          WHERE s.team_id = ? AND s.round_id = ?${stageFilter}
          ORDER BY s.submitted_at DESC, s.id DESC`,
    args,
  });
  return result.rows.map((row) => rowToSubmission(row as Record<string, unknown>));
}

export async function listAdvancementSubmissionActivity(): Promise<
  Array<AdvancementSubmission & { teamName: string; roundLabel: string }>
> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT s.*, u.name as submitter_name, u.email as submitter_email,
                 r.name as reviewer_name, r.email as reviewer_email,
                 t.name as team_name, rd.label as round_label
          FROM team_advancement_submissions s
          JOIN users u ON u.id = s.submitted_by
          LEFT JOIN users r ON r.id = s.reviewed_by
          JOIN teams t ON t.id = s.team_id
          JOIN rounds rd ON rd.id = s.round_id
          ORDER BY COALESCE(s.reviewed_at, s.submitted_at) DESC, s.submitted_at DESC`,
  });

  return result.rows.map((row) => ({
    ...rowToSubmission(row as Record<string, unknown>),
    teamName: row.team_name as string,
    roundLabel: row.round_label as string,
  }));
}

function requiredPipelineStatus(fromStage: AdvancementFromStage): 'application' | 'first_round' {
  return fromStage;
}

export async function submitTeamAdvancement(
  user: User,
  teamId: number,
  fromStage: AdvancementFromStage = 'application',
  applicationIds?: number[],
): Promise<AdvancementSubmission> {
  if (user.role !== 'exec') {
    throw new Error('Only team Directors can submit advancement lists.');
  }
  if (!(await isTeamDirector(user.id, teamId))) {
    throw new Error('Only team Directors can submit advancement lists.');
  }
  if (!(await userHasTeamAccess(user, teamId))) {
    throw new Error('You do not have access to this team.');
  }

  const round = await getActiveRoundForTeam(teamId);
  if (!round) throw new Error('No active round for this team.');

  const requiredStatus = requiredPipelineStatus(fromStage);
  if (round.status !== requiredStatus) {
    throw new Error(`Advancement can only be submitted during the ${requiredStatus.replace('_', ' ')} stage.`);
  }

  const existing = await getLatestAdvancementSubmission(teamId, round.id, fromStage);
  if (existing?.status === 'approved') {
    throw new Error('Advancement for this round has already been approved.');
  }

  const { cap, overCapExtra } = await getTeamAdvancementCapState(teamId, fromStage);
  const team = await getTeamById(teamId);
  const allowUncapped =
    fromStage === 'first_round' &&
    Boolean(team?.name && teamAllowsUncappedFirstRoundAdvancement(team.name));

  if (cap === null && !allowUncapped) {
    throw new Error('Advancement limit is not configured for this team. Contact an admin.');
  }

  let candidates: AdvancementCandidate[];
  let incompleteCount: number;
  let totalRanked: number;
  let rankedIds: Set<number>;
  let ranked: RankedApplication[] | Awaited<
    ReturnType<typeof computeInterviewRankings>
  >['ranked'];

  if (fromStage === 'first_round') {
    const rankings = await computeInterviewRankings(teamId, round.id, 'first_round');
    incompleteCount = rankings.incompleteCount;
    ranked = rankings.ranked;
    totalRanked = ranked.length;
    rankedIds = new Set(ranked.map((app) => app.id));
  } else {
    const rankings = await computeNormalizedRankings(teamId, round.id);
    incompleteCount = rankings.incompleteCount;
    ranked = rankings.ranked;
    totalRanked = ranked.length;
    rankedIds = new Set(ranked.map((app) => app.id));
  }

  const previousSubmittedCount =
    existing?.status === 'submitted' ? existing.candidates.length : null;
  const minRequired = resolveAdvancementSelectionMin({
    cap,
    totalRanked,
    overCapExtra,
    allowUncapped,
  });
  const maxAllowed = resolveAdvancementSelectionMax({
    cap,
    totalRanked,
    overCapExtra,
    previousSubmittedCount,
    allowUncapped,
  });

  if (!applicationIds || applicationIds.length === 0) {
    if (minRequired === null || maxAllowed === null) {
      throw new Error('Advancement limit is not configured for this team. Contact an admin.');
    }
    const guidance =
      minRequired === maxAllowed
        ? `Select exactly ${minRequired} applicant${minRequired === 1 ? '' : 's'} to submit.`
        : `Select at least ${minRequired} applicant${minRequired === 1 ? '' : 's'} to submit (up to ${maxAllowed}).`;
    throw new Error(`${guidance} Panel color ratings are advisory — only your Advance selections are submitted.`);
  }
  const uniqueIds = [...new Set(applicationIds)];
  if (uniqueIds.length !== applicationIds.length) {
    throw new Error('Duplicate applicants in selection.');
  }
  validateAdvancementSelection(uniqueIds, {
    cap,
    totalRanked,
    overCapExtra,
    previousSubmittedCount,
    allowUncapped,
  });

  for (const id of uniqueIds) {
    if (!rankedIds.has(id)) {
      throw new Error('One or more selected applicants are invalid for this team.');
    }
  }

  if (fromStage === 'first_round') {
    candidates = toInterviewCandidates(
      ranked as Awaited<ReturnType<typeof computeInterviewRankings>>['ranked'],
      uniqueIds,
    );
  } else {
    candidates = toCandidates(ranked as RankedApplication[], uniqueIds);
  }

  if (incompleteCount > 0) {
    const pendingNoun =
      fromStage === 'first_round' ? 'interview' : 'application';
    throw new Error(
      `${incompleteCount} ${pendingNoun}${incompleteCount === 1 ? '' : 's'} still need ${fromStage === 'first_round' ? 'scoring' : 'grading'}.`,
    );
  }

  const topN = candidates.length;
  const db = getDb();

  // Keep an event trail: supersede the pending row, then insert a new submission.
  if (existing?.status === 'submitted') {
    await db.execute({
      sql: `UPDATE team_advancement_submissions
            SET status = 'withdrawn', reviewed_at = unixepoch()
            WHERE id = ? AND status = 'submitted'`,
      args: [existing.id],
    });
  }

  const result = await db.execute({
    sql: `INSERT INTO team_advancement_submissions
            (round_id, team_id, from_stage, top_n, application_ids, candidates, status, submitted_by)
          VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?)`,
    args: [
      round.id,
      teamId,
      fromStage,
      topN,
      JSON.stringify(uniqueIds),
      JSON.stringify(candidates),
      user.id,
    ],
  });

  const inserted = await db.execute({
    sql: `SELECT s.*, u.name as submitter_name, u.email as submitter_email,
                 r.name as reviewer_name, r.email as reviewer_email
          FROM team_advancement_submissions s
          JOIN users u ON u.id = s.submitted_by
          LEFT JOIN users r ON r.id = s.reviewed_by
          WHERE s.id = ?`,
    args: [Number(result.lastInsertRowid)],
  });

  return rowToSubmission(inserted.rows[0] as Record<string, unknown>);
}

/** Admin submits and optionally applies advancement without waiting for a Director. */
export async function submitAdminTeamAdvancement(
  admin: User,
  teamId: number,
  fromStage: AdvancementFromStage = 'application',
  applicationIds: number[],
  options: { autoApprove?: boolean; force?: boolean } = {},
): Promise<AdvancementSubmission> {
  if (admin.role !== 'admin') {
    throw new Error('Only admins can submit advancement on behalf of a team.');
  }

  const round = await getActiveRoundForTeam(teamId);
  if (!round) throw new Error('No active round for this team.');

  const requiredStatus = requiredPipelineStatus(fromStage);
  if (round.status !== requiredStatus) {
    throw new Error(
      `Advancement can only be submitted during the ${requiredStatus.replace('_', ' ')} stage.`,
    );
  }

  const existing = await getLatestAdvancementSubmission(teamId, round.id, fromStage);
  if (existing?.status === 'approved') {
    throw new Error('Advancement for this round has already been approved.');
  }

  const { cap, overCapExtra } = await getTeamAdvancementCapState(teamId, fromStage);
  const team = await getTeamById(teamId);
  const allowUncapped =
    fromStage === 'first_round' &&
    Boolean(team?.name && teamAllowsUncappedFirstRoundAdvancement(team.name));
  if (cap === null && !allowUncapped) {
    throw new Error('Advancement limit is not configured for this team.');
  }

  let candidates: AdvancementCandidate[];
  let incompleteCount: number;
  let totalRanked: number;
  let rankedIds: Set<number>;
  let ranked: RankedApplication[] | Awaited<
    ReturnType<typeof computeInterviewRankings>
  >['ranked'];

  if (fromStage === 'first_round') {
    const rankings = await computeInterviewRankings(teamId, round.id, 'first_round');
    incompleteCount = rankings.incompleteCount;
    ranked = rankings.ranked;
    totalRanked = ranked.length;
    rankedIds = new Set(ranked.map((app) => app.id));
  } else {
    const rankings = await computeNormalizedRankings(teamId, round.id);
    incompleteCount = rankings.incompleteCount;
    ranked = rankings.ranked;
    totalRanked = ranked.length;
    rankedIds = new Set(ranked.map((app) => app.id));
  }

  const previousSubmittedCount =
    existing?.status === 'submitted' ? existing.candidates.length : null;

  if (!applicationIds || applicationIds.length === 0) {
    const minRequired = resolveAdvancementSelectionMin({
      cap,
      totalRanked,
      overCapExtra,
      allowUncapped,
    });
    const maxAllowed = resolveAdvancementSelectionMax({
      cap,
      totalRanked,
      overCapExtra,
      previousSubmittedCount,
      allowUncapped,
    });
    if (minRequired === null || maxAllowed === null) {
      throw new Error('Advancement limit is not configured for this team.');
    }
    const guidance =
      minRequired === maxAllowed
        ? `Select exactly ${minRequired} applicant${minRequired === 1 ? '' : 's'}.`
        : `Select at least ${minRequired} applicant${minRequired === 1 ? '' : 's'} (up to ${maxAllowed}).`;
    throw new Error(guidance);
  }

  const uniqueIds = [...new Set(applicationIds)];
  if (uniqueIds.length !== applicationIds.length) {
    throw new Error('Duplicate applicants in selection.');
  }
  validateAdvancementSelection(uniqueIds, {
    cap,
    totalRanked,
    overCapExtra,
    previousSubmittedCount,
    allowUncapped,
  });

  for (const id of uniqueIds) {
    if (!rankedIds.has(id)) {
      throw new Error('One or more selected applicants are invalid for this team.');
    }
  }

  if (fromStage === 'first_round') {
    candidates = toInterviewCandidates(
      ranked as Awaited<ReturnType<typeof computeInterviewRankings>>['ranked'],
      uniqueIds,
    );
  } else {
    candidates = toCandidates(ranked as RankedApplication[], uniqueIds);
  }

  const force = options.force ?? true;
  if (incompleteCount > 0 && !force) {
    const pendingNoun = fromStage === 'first_round' ? 'interview' : 'application';
    throw new Error(
      `${incompleteCount} ${pendingNoun}${incompleteCount === 1 ? '' : 's'} still need ${fromStage === 'first_round' ? 'scoring' : 'grading'}.`,
    );
  }

  const autoApprove = options.autoApprove ?? true;
  const topN = candidates.length;
  const db = getDb();

  if (existing?.status === 'submitted') {
    await db.execute({
      sql: `UPDATE team_advancement_submissions
            SET status = 'withdrawn', reviewed_at = unixepoch()
            WHERE id = ? AND status = 'submitted'`,
      args: [existing.id],
    });
  }

  const initialStatus = autoApprove ? 'approved' : 'submitted';
  const result = await db.execute({
    sql: `INSERT INTO team_advancement_submissions
            (round_id, team_id, from_stage, top_n, application_ids, candidates, status, submitted_by, reviewed_by, reviewed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      round.id,
      teamId,
      fromStage,
      topN,
      JSON.stringify(uniqueIds),
      JSON.stringify(candidates),
      initialStatus,
      admin.id,
      autoApprove ? admin.id : null,
      autoApprove ? Math.floor(Date.now() / 1000) : null,
    ],
  });

  const submissionId = Number(result.lastInsertRowid);

  if (autoApprove) {
    if (fromStage === 'first_round') {
      await applyInterviewAdvancementSelection(teamId, round.id, uniqueIds);
    } else {
      await applyAdvancementSelection(teamId, round.id, uniqueIds);
    }
  }

  const inserted = await db.execute({
    sql: `SELECT s.*, u.name as submitter_name, u.email as submitter_email,
                 r.name as reviewer_name, r.email as reviewer_email
          FROM team_advancement_submissions s
          JOIN users u ON u.id = s.submitted_by
          LEFT JOIN users r ON r.id = s.reviewed_by
          WHERE s.id = ?`,
    args: [submissionId],
  });

  return rowToSubmission(inserted.rows[0] as Record<string, unknown>);
}

export async function listPendingAdvancementSubmissions(
  fromStage?: AdvancementFromStage,
): Promise<Array<AdvancementSubmission & { teamName: string; roundLabel: string }>> {
  const db = getDb();
  const args: (number | string)[] = [];
  let stageFilter = '';
  if (fromStage) {
    stageFilter = ' AND s.from_stage = ?';
    args.push(fromStage);
  }
  const result = await db.execute({
    sql: `SELECT s.*, u.name as submitter_name, u.email as submitter_email,
                 r.name as reviewer_name, r.email as reviewer_email,
                 t.name as team_name, rd.label as round_label
          FROM team_advancement_submissions s
          JOIN users u ON u.id = s.submitted_by
          LEFT JOIN users r ON r.id = s.reviewed_by
          JOIN teams t ON t.id = s.team_id
          JOIN rounds rd ON rd.id = s.round_id
          WHERE s.status = 'submitted'${stageFilter}
          ORDER BY s.submitted_at ASC`,
    args,
  });

  return result.rows.map((row) => ({
    ...rowToSubmission(row as Record<string, unknown>),
    teamName: row.team_name as string,
    roundLabel: row.round_label as string,
  }));
}

export function isAdvancementReadOnly(
  globalStatus: string | null,
  fromStage: AdvancementFromStage,
): boolean {
  if (!globalStatus) return false;
  if (globalStatus === 'closed') return true;
  return statusIndex(globalStatus as Parameters<typeof statusIndex>[0]) >
    statusIndex(advancementReadOnlyAfter(fromStage));
}

export async function approveAdvancementSubmission(
  admin: User,
  submissionId: number,
  options: { force?: boolean } = {},
): Promise<void> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT s.*, u.name as submitter_name, u.email as submitter_email
          FROM team_advancement_submissions s
          JOIN users u ON u.id = s.submitted_by
          WHERE s.id = ?`,
    args: [submissionId],
  });
  if (result.rows.length === 0) throw new Error('Submission not found.');

  const row = result.rows[0];
  const status = row.status as AdvancementSubmissionStatus;
  if (status !== 'submitted') throw new Error('This submission is not pending review.');

  const teamId = row.team_id as number;
  const roundId = row.round_id as number;
  const fromStage = parseFromStage(row.from_stage);
  const applicationIds = JSON.parse(row.application_ids as string) as number[];

  if (fromStage === 'first_round') {
    const { incompleteCount } = await computeInterviewRankings(teamId, roundId, 'first_round');
    if (incompleteCount > 0 && !options.force) {
      throw new Error(`${incompleteCount} assignments are still pending.`);
    }
    await applyInterviewAdvancementSelection(teamId, roundId, applicationIds);
  } else {
    const { incompleteCount } = await computeNormalizedRankings(teamId, roundId);
    if (incompleteCount > 0 && !options.force) {
      throw new Error(`${incompleteCount} assignments are still pending.`);
    }
    await applyAdvancementSelection(teamId, roundId, applicationIds);
  }

  await db.execute({
    sql: `UPDATE team_advancement_submissions
          SET status = 'approved', reviewed_by = ?, reviewed_at = unixepoch()
          WHERE id = ?`,
    args: [admin.id, submissionId],
  });
}

