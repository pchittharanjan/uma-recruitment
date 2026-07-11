import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import { getDb, getTeamById, getTeams } from '@/lib/db';

/** Stages that have an admin-configured advancement limit. */
export type AdvancementCapStage = AdvancementFromStage | 'deliberations';

export interface TeamAdvancementCaps {
  teamId: number;
  teamName: string;
  applicationCap: number | null;
  firstRoundCap: number | null;
  deliberationsCap: number | null;
  applicationAllowOverCap: boolean;
  firstRoundAllowOverCap: boolean;
  deliberationsAllowOverCap: boolean;
}

const STAGE_COLUMN: Record<
  AdvancementCapStage,
  'application_cap' | 'first_round_cap' | 'deliberations_cap'
> = {
  application: 'application_cap',
  first_round: 'first_round_cap',
  deliberations: 'deliberations_cap',
};

const STAGE_OVERRIDE_COLUMN: Record<
  AdvancementCapStage,
  | 'application_allow_over_cap'
  | 'first_round_allow_over_cap'
  | 'deliberations_allow_over_cap'
> = {
  application: 'application_allow_over_cap',
  first_round: 'first_round_allow_over_cap',
  deliberations: 'deliberations_allow_over_cap',
};

function parseCap(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function parseAllowOver(value: unknown): boolean {
  return value === 1 || value === true || value === '1';
}

export async function getTeamAdvancementCap(
  teamId: number,
  fromStage: AdvancementCapStage,
): Promise<number | null> {
  const db = getDb();
  const column = STAGE_COLUMN[fromStage];
  const result = await db.execute({
    sql: `SELECT ${column} AS cap FROM team_advancement_caps WHERE team_id = ?`,
    args: [teamId],
  });
  if (result.rows.length === 0) return null;
  return parseCap(result.rows[0].cap);
}

export async function getTeamAdvancementAllowOverCap(
  teamId: number,
  fromStage: AdvancementCapStage,
): Promise<boolean> {
  const db = getDb();
  const column = STAGE_OVERRIDE_COLUMN[fromStage];
  const result = await db.execute({
    sql: `SELECT ${column} AS allow_over FROM team_advancement_caps WHERE team_id = ?`,
    args: [teamId],
  });
  if (result.rows.length === 0) return false;
  return parseAllowOver(result.rows[0].allow_over);
}

export async function getTeamAdvancementCapState(
  teamId: number,
  fromStage: AdvancementCapStage,
): Promise<{ cap: number | null; allowOverCap: boolean }> {
  const db = getDb();
  const capCol = STAGE_COLUMN[fromStage];
  const overCol = STAGE_OVERRIDE_COLUMN[fromStage];
  const result = await db.execute({
    sql: `SELECT ${capCol} AS cap, ${overCol} AS allow_over FROM team_advancement_caps WHERE team_id = ?`,
    args: [teamId],
  });
  if (result.rows.length === 0) return { cap: null, allowOverCap: false };
  return {
    cap: parseCap(result.rows[0].cap),
    allowOverCap: parseAllowOver(result.rows[0].allow_over),
  };
}

export async function listTeamAdvancementCaps(): Promise<TeamAdvancementCaps[]> {
  const teams = await getTeams();
  const db = getDb();
  const result = await db.execute(
    `SELECT team_id, application_cap, first_round_cap, deliberations_cap,
            application_allow_over_cap, first_round_allow_over_cap, deliberations_allow_over_cap
     FROM team_advancement_caps`,
  );
  const byTeamId = new Map(
    result.rows.map((row) => [
      row.team_id as number,
      {
        applicationCap: parseCap(row.application_cap),
        firstRoundCap: parseCap(row.first_round_cap),
        deliberationsCap: parseCap(row.deliberations_cap),
        applicationAllowOverCap: parseAllowOver(row.application_allow_over_cap),
        firstRoundAllowOverCap: parseAllowOver(row.first_round_allow_over_cap),
        deliberationsAllowOverCap: parseAllowOver(row.deliberations_allow_over_cap),
      },
    ]),
  );

  return teams.map((team) => {
    const caps = byTeamId.get(team.id);
    return {
      teamId: team.id,
      teamName: team.name,
      applicationCap: caps?.applicationCap ?? null,
      firstRoundCap: caps?.firstRoundCap ?? null,
      deliberationsCap: caps?.deliberationsCap ?? null,
      applicationAllowOverCap: caps?.applicationAllowOverCap ?? false,
      firstRoundAllowOverCap: caps?.firstRoundAllowOverCap ?? false,
      deliberationsAllowOverCap: caps?.deliberationsAllowOverCap ?? false,
    };
  });
}

export async function upsertTeamAdvancementCaps(
  teamId: number,
  caps: {
    applicationCap?: number | null;
    firstRoundCap?: number | null;
    deliberationsCap?: number | null;
    applicationAllowOverCap?: boolean;
    firstRoundAllowOverCap?: boolean;
    deliberationsAllowOverCap?: boolean;
  },
  updatedBy: number,
): Promise<TeamAdvancementCaps> {
  const team = await getTeamById(teamId);
  if (!team) throw new Error('Team not found.');

  const applicationCap =
    caps.applicationCap !== undefined ? parseCap(caps.applicationCap) : undefined;
  const firstRoundCap =
    caps.firstRoundCap !== undefined ? parseCap(caps.firstRoundCap) : undefined;
  const deliberationsCap =
    caps.deliberationsCap !== undefined ? parseCap(caps.deliberationsCap) : undefined;

  if (caps.applicationCap !== undefined && caps.applicationCap !== null && applicationCap === null) {
    throw new Error('Application advancement limit must be a positive whole number.');
  }
  if (caps.firstRoundCap !== undefined && caps.firstRoundCap !== null && firstRoundCap === null) {
    throw new Error('First round advancement limit must be a positive whole number.');
  }
  if (
    caps.deliberationsCap !== undefined &&
    caps.deliberationsCap !== null &&
    deliberationsCap === null
  ) {
    throw new Error('Deliberations advancement limit must be a positive whole number.');
  }

  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT application_cap, first_round_cap, deliberations_cap,
                 application_allow_over_cap, first_round_allow_over_cap, deliberations_allow_over_cap
          FROM team_advancement_caps WHERE team_id = ?`,
    args: [teamId],
  });

  const nextApplicationCap =
    applicationCap !== undefined
      ? applicationCap
      : existing.rows.length > 0
        ? parseCap(existing.rows[0].application_cap)
        : null;
  const nextFirstRoundCap =
    firstRoundCap !== undefined
      ? firstRoundCap
      : existing.rows.length > 0
        ? parseCap(existing.rows[0].first_round_cap)
        : null;
  const nextDeliberationsCap =
    deliberationsCap !== undefined
      ? deliberationsCap
      : existing.rows.length > 0
        ? parseCap(existing.rows[0].deliberations_cap)
        : null;

  const nextApplicationAllowOver =
    caps.applicationAllowOverCap !== undefined
      ? caps.applicationAllowOverCap
      : existing.rows.length > 0
        ? parseAllowOver(existing.rows[0].application_allow_over_cap)
        : false;
  const nextFirstRoundAllowOver =
    caps.firstRoundAllowOverCap !== undefined
      ? caps.firstRoundAllowOverCap
      : existing.rows.length > 0
        ? parseAllowOver(existing.rows[0].first_round_allow_over_cap)
        : false;
  const nextDeliberationsAllowOver =
    caps.deliberationsAllowOverCap !== undefined
      ? caps.deliberationsAllowOverCap
      : existing.rows.length > 0
        ? parseAllowOver(existing.rows[0].deliberations_allow_over_cap)
        : false;

  if (existing.rows.length === 0) {
    await db.execute({
      sql: `INSERT INTO team_advancement_caps (
              team_id, application_cap, first_round_cap, deliberations_cap,
              application_allow_over_cap, first_round_allow_over_cap, deliberations_allow_over_cap,
              updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), ?)`,
      args: [
        teamId,
        nextApplicationCap,
        nextFirstRoundCap,
        nextDeliberationsCap,
        nextApplicationAllowOver ? 1 : 0,
        nextFirstRoundAllowOver ? 1 : 0,
        nextDeliberationsAllowOver ? 1 : 0,
        updatedBy,
      ],
    });
  } else {
    await db.execute({
      sql: `UPDATE team_advancement_caps
            SET application_cap = ?, first_round_cap = ?, deliberations_cap = ?,
                application_allow_over_cap = ?, first_round_allow_over_cap = ?,
                deliberations_allow_over_cap = ?,
                updated_at = unixepoch(), updated_by = ?
            WHERE team_id = ?`,
      args: [
        nextApplicationCap,
        nextFirstRoundCap,
        nextDeliberationsCap,
        nextApplicationAllowOver ? 1 : 0,
        nextFirstRoundAllowOver ? 1 : 0,
        nextDeliberationsAllowOver ? 1 : 0,
        updatedBy,
        teamId,
      ],
    });
  }

  return {
    teamId: team.id,
    teamName: team.name,
    applicationCap: nextApplicationCap,
    firstRoundCap: nextFirstRoundCap,
    deliberationsCap: nextDeliberationsCap,
    applicationAllowOverCap: nextApplicationAllowOver,
    firstRoundAllowOverCap: nextFirstRoundAllowOver,
    deliberationsAllowOverCap: nextDeliberationsAllowOver,
  };
}
