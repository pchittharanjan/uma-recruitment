import 'server-only';

import { DEFAULT_GRADERS_PER_APPLICATION } from '@/lib/assignments';
import { deliberationsPendingStages } from '@/lib/team-pipeline-profile';
import { getDb } from '@/lib/db';
import type { InterviewSlotStage } from '@/lib/interview-slots';
import type { TeamInterviewRoundStats } from '@/lib/interview-slots';
import { cachedPerRequest } from '@/lib/request-cache';
import { getRoundSettings } from '@/lib/rounds';

export type TeamRoundKey = { teamId: number; roundId: number };

export type TeamRoundStats = {
  applicationCount: number;
  assignmentProgress: { total: number; completed: number };
  gradersPerApplication: number;
};

function teamRoundCacheKey(keys: TeamRoundKey[]): string {
  return keys
    .map((k) => `${k.teamId}:${k.roundId}`)
    .sort()
    .join(',');
}

function pairPlaceholders(count: number): string {
  return Array(count).fill('(?, ?)').join(', ');
}

function pairArgs(keys: TeamRoundKey[]): number[] {
  return keys.flatMap((k) => [k.teamId, k.roundId]);
}

export function teamRoundStatsMapKey(teamId: number, roundId: number): string {
  return `${teamId}:${roundId}`;
}

/** Application counts + assignment progress for many team/round pairs in two queries. */
export async function getTeamRoundStatsBatch(
  keys: TeamRoundKey[],
): Promise<Map<string, TeamRoundStats>> {
  const result = new Map<string, TeamRoundStats>();
  if (keys.length === 0) return result;

  const cacheKey = `teamRoundStatsBatch:${teamRoundCacheKey(keys)}`;
  return cachedPerRequest(cacheKey, async () => {
    const db = getDb();
    const pairs = pairPlaceholders(keys.length);
    const args = pairArgs(keys);

    const [apps, progress, settingsByRound] = await Promise.all([
      db.execute({
        sql: `SELECT team_id, round_id, COUNT(*) AS count
              FROM applications
              WHERE (team_id, round_id) IN (${pairs})
              GROUP BY team_id, round_id`,
        args,
      }),
      db.execute({
        sql: `SELECT app.team_id, app.round_id,
                     COUNT(*) AS total,
                     SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) AS completed
              FROM assignments a
              JOIN applications app ON app.id = a.application_id
              WHERE a.stage = 'application'
                AND (app.team_id, app.round_id) IN (${pairs})
              GROUP BY app.team_id, app.round_id`,
        args,
      }),
      loadGradersPerApplicationByRound(keys.map((k) => k.roundId)),
    ]);

    for (const key of keys) {
      const mapKey = teamRoundStatsMapKey(key.teamId, key.roundId);
      result.set(mapKey, {
        applicationCount: 0,
        assignmentProgress: { total: 0, completed: 0 },
        gradersPerApplication:
          settingsByRound.get(key.roundId) ?? DEFAULT_GRADERS_PER_APPLICATION,
      });
    }

    for (const row of apps.rows) {
      const mapKey = teamRoundStatsMapKey(row.team_id as number, row.round_id as number);
      const entry = result.get(mapKey);
      if (entry) entry.applicationCount = (row.count as number) ?? 0;
    }

    for (const row of progress.rows) {
      const mapKey = teamRoundStatsMapKey(row.team_id as number, row.round_id as number);
      const entry = result.get(mapKey);
      if (entry) {
        entry.assignmentProgress = {
          total: (row.total as number) ?? 0,
          completed: (row.completed as number) ?? 0,
        };
      }
    }

    return result;
  });
}

async function loadGradersPerApplicationByRound(
  roundIds: number[],
): Promise<Map<number, number>> {
  const unique = [...new Set(roundIds)];
  const byRound = new Map<number, number>();
  if (unique.length === 0) return byRound;

  await Promise.all(
    unique.map(async (roundId) => {
      const settings = await getRoundSettings(roundId);
      byRound.set(
        roundId,
        settings?.graders_per_application ?? DEFAULT_GRADERS_PER_APPLICATION,
      );
    }),
  );
  return byRound;
}

/** Interview schedule + scoring stats for one stage across many teams. */
export async function getTeamInterviewRoundStatsBatch(
  keys: TeamRoundKey[],
  stage: InterviewSlotStage,
): Promise<Map<string, TeamInterviewRoundStats>> {
  const result = new Map<string, TeamInterviewRoundStats>();
  if (keys.length === 0) return result;

  const cacheKey = `teamInterviewStatsBatch:${stage}:${teamRoundCacheKey(keys)}`;
  return cachedPerRequest(cacheKey, async () => {
    const db = getDb();
    const pairs = pairPlaceholders(keys.length);
    const pairArgsFlat = pairArgs(keys);

    const [candidates, slots, scoring] = await Promise.all([
      db.execute({
        sql: `SELECT team_id, round_id, COUNT(*) AS count FROM (
                SELECT team_id, round_id, id AS application_id FROM applications
                WHERE (team_id, round_id) IN (${pairs}) AND stage = ?
                UNION
                SELECT team_id, round_id, application_id FROM interview_slots
                WHERE (team_id, round_id) IN (${pairs}) AND stage = ?
              )
              GROUP BY team_id, round_id`,
        args: [...pairArgsFlat, stage, ...pairArgsFlat, stage],
      }),
      db.execute({
        sql: `SELECT team_id, round_id, COUNT(*) AS count
              FROM interview_slots
              WHERE (team_id, round_id) IN (${pairs}) AND stage = ?
              GROUP BY team_id, round_id`,
        args: [...pairArgsFlat, stage],
      }),
      db.execute({
        sql: `SELECT app.team_id, app.round_id,
                     COUNT(*) AS total,
                     SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) AS completed
              FROM assignments a
              JOIN applications app ON app.id = a.application_id
              WHERE a.stage = ?
                AND (app.team_id, app.round_id) IN (${pairs})
              GROUP BY app.team_id, app.round_id`,
        args: [stage, ...pairArgsFlat],
      }),
    ]);

    for (const key of keys) {
      result.set(teamRoundStatsMapKey(key.teamId, key.roundId), {
        candidateCount: 0,
        slotCount: 0,
        scoring: { total: 0, completed: 0 },
      });
    }

    for (const row of candidates.rows) {
      const mapKey = teamRoundStatsMapKey(row.team_id as number, row.round_id as number);
      const entry = result.get(mapKey);
      if (entry) entry.candidateCount = (row.count as number) ?? 0;
    }

    for (const row of slots.rows) {
      const mapKey = teamRoundStatsMapKey(row.team_id as number, row.round_id as number);
      const entry = result.get(mapKey);
      if (entry) entry.slotCount = (row.count as number) ?? 0;
    }

    for (const row of scoring.rows) {
      const mapKey = teamRoundStatsMapKey(row.team_id as number, row.round_id as number);
      const entry = result.get(mapKey);
      if (entry) {
        entry.scoring = {
          total: (row.total as number) ?? 0,
          completed: (row.completed as number) ?? 0,
        };
      }
    }

    return result;
  });
}

export async function getTeamInterviewRoundStatsBothStagesBatch(
  keys: TeamRoundKey[],
): Promise<
  Map<string, { first_round: TeamInterviewRoundStats; final_round: TeamInterviewRoundStats }>
> {
  const [first, final] = await Promise.all([
    getTeamInterviewRoundStatsBatch(keys, 'first_round'),
    getTeamInterviewRoundStatsBatch(keys, 'final_round'),
  ]);

  const result = new Map<
    string,
    { first_round: TeamInterviewRoundStats; final_round: TeamInterviewRoundStats }
  >();
  for (const key of keys) {
    const mapKey = teamRoundStatsMapKey(key.teamId, key.roundId);
    result.set(mapKey, {
      first_round: first.get(mapKey) ?? {
        candidateCount: 0,
        slotCount: 0,
        scoring: { total: 0, completed: 0 },
      },
      final_round: final.get(mapKey) ?? {
        candidateCount: 0,
        slotCount: 0,
        scoring: { total: 0, completed: 0 },
      },
    });
  }
  return result;
}

export type FinalSelectionEntry = { teamId: number; roundId: number; teamName: string };

/** Batched version of isDeliberationsFinalSelectionComplete — keyed by teamId. */
export async function batchDeliberationsFinalSelectionComplete(
  entries: FinalSelectionEntry[],
): Promise<Map<number, boolean>> {
  const result = new Map<number, boolean>();
  if (entries.length === 0) return result;

  const cacheKey = `finalSelectionBatch:${entries.map((e) => `${e.teamId}:${e.roundId}`).sort().join(',')}`;
  return cachedPerRequest(cacheKey, async () => {
    const db = getDb();
    const roundIds = [...new Set(entries.map((e) => e.roundId))];
    const roundPlaceholders = roundIds.map(() => '?').join(', ');

    const [roundRows, stageRows] = await Promise.all([
      db.execute({
        sql: `SELECT id, team_id, status FROM rounds WHERE id IN (${roundPlaceholders})`,
        args: roundIds,
      }),
      db.execute({
        sql: `SELECT team_id, round_id, stage, COUNT(*) AS count
              FROM applications
              WHERE (team_id, round_id) IN (${pairPlaceholders(entries.length)})
              GROUP BY team_id, round_id, stage`,
        args: pairArgs(entries),
      }),
    ]);

    const statusByRoundTeam = new Map<string, string>();
    for (const row of roundRows.rows) {
      statusByRoundTeam.set(`${row.team_id}:${row.id}`, row.status as string);
    }

    const countsByTeamRoundStage = new Map<string, number>();
    for (const row of stageRows.rows) {
      const key = `${row.team_id}:${row.round_id}:${row.stage}`;
      countsByTeamRoundStage.set(key, Number(row.count ?? 0));
    }

    for (const entry of entries) {
      const status = statusByRoundTeam.get(`${entry.teamId}:${entry.roundId}`);
      if (status !== 'deliberations' && status !== 'closed') {
        result.set(entry.teamId, false);
        continue;
      }

      const pendingStages = deliberationsPendingStages(entry.teamName);
      const hasPending = pendingStages.some(
        (stage) =>
          (countsByTeamRoundStage.get(`${entry.teamId}:${entry.roundId}:${stage}`) ?? 0) > 0,
      );
      if (hasPending) {
        result.set(entry.teamId, false);
        continue;
      }

      const offered =
        countsByTeamRoundStage.get(`${entry.teamId}:${entry.roundId}:advanced`) ?? 0;
      result.set(entry.teamId, offered > 0);
    }

    return result;
  });
}
