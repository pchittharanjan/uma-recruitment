import { createHash, timingSafeEqual } from 'crypto';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import { getDb, getTeamById, getTeams } from '@/lib/db';
import { getTeamPipelineProfile } from '@/lib/team-pipeline-profile';

/** Stages that have an admin-configured advancement limit. */
export type AdvancementCapStage = AdvancementFromStage | 'deliberations';

export interface TeamAdvancementCaps {
  teamId: number;
  teamName: string;
  applicationCap: number | null;
  firstRoundCap: number | null;
  deliberationsCap: number | null;
  applicationOverCapExtra: number;
  firstRoundOverCapExtra: number;
  deliberationsOverCapExtra: number;
}

const STAGE_COLUMN: Record<
  AdvancementCapStage,
  'application_cap' | 'first_round_cap' | 'deliberations_cap'
> = {
  application: 'application_cap',
  first_round: 'first_round_cap',
  deliberations: 'deliberations_cap',
};

const STAGE_EXTRA_COLUMN: Record<
  AdvancementCapStage,
  | 'application_over_cap_extra'
  | 'first_round_over_cap_extra'
  | 'deliberations_over_cap_extra'
> = {
  application: 'application_over_cap_extra',
  first_round: 'first_round_over_cap_extra',
  deliberations: 'deliberations_over_cap_extra',
};

function parseCap(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function parseExtra(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function hashOverCapCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
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

export async function getTeamAdvancementCapState(
  teamId: number,
  fromStage: AdvancementCapStage,
): Promise<{ cap: number | null; overCapExtra: number }> {
  const db = getDb();
  const capCol = STAGE_COLUMN[fromStage];
  const extraCol = STAGE_EXTRA_COLUMN[fromStage];
  const result = await db.execute({
    sql: `SELECT ${capCol} AS cap, ${extraCol} AS over_extra FROM team_advancement_caps WHERE team_id = ?`,
    args: [teamId],
  });
  if (result.rows.length === 0) return { cap: null, overCapExtra: 0 };
  return {
    cap: parseCap(result.rows[0].cap),
    overCapExtra: parseExtra(result.rows[0].over_extra),
  };
}

export async function isOverCapCodeSet(): Promise<boolean> {
  const db = getDb();
  const result = await db.execute(
    `SELECT code_hash FROM org_over_cap_code WHERE id = 1`,
  );
  const hash = result.rows[0]?.code_hash;
  return typeof hash === 'string' && hash.length > 0;
}

/** Admin-only: plaintext go-over code when available (null if set before plain storage). */
export async function getOrgOverCapCodePlain(): Promise<string | null> {
  const db = getDb();
  const result = await db.execute(
    `SELECT code_plain FROM org_over_cap_code WHERE id = 1`,
  );
  const plain = result.rows[0]?.code_plain;
  return typeof plain === 'string' && plain.length > 0 ? plain : null;
}

export async function setOrgOverCapCode(code: string, updatedBy: number): Promise<void> {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new Error('Go-over code cannot be empty.');
  }
  if (trimmed.length < 4) {
    throw new Error('Go-over code must be at least 4 characters.');
  }
  const db = getDb();
  const codeHash = hashOverCapCode(trimmed);
  await db.execute({
    sql: `INSERT INTO org_over_cap_code (id, code_hash, code_plain, updated_at, updated_by)
          VALUES (1, ?, ?, unixepoch(), ?)
          ON CONFLICT(id) DO UPDATE SET
            code_hash = excluded.code_hash,
            code_plain = excluded.code_plain,
            updated_at = unixepoch(),
            updated_by = excluded.updated_by`,
    args: [codeHash, trimmed, updatedBy],
  });
}

/** Returns true if the plaintext code matches the stored hash. */
export async function verifyOrgOverCapCode(code: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute(
    `SELECT code_hash FROM org_over_cap_code WHERE id = 1`,
  );
  const stored = result.rows[0]?.code_hash;
  if (typeof stored !== 'string' || stored.length === 0) return false;

  const candidate = hashOverCapCode(code.trim());
  try {
    const a = Buffer.from(stored, 'utf8');
    const b = Buffer.from(candidate, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function setTeamOverCapExtra(
  teamId: number,
  fromStage: AdvancementCapStage,
  extraCount: number,
  updatedBy: number,
): Promise<{ cap: number | null; overCapExtra: number }> {
  if (!Number.isInteger(extraCount) || extraCount < 1) {
    throw new Error('Extra count must be a positive whole number.');
  }

  const team = await getTeamById(teamId);
  if (!team) throw new Error('Team not found.');

  const db = getDb();
  const extraCol = STAGE_EXTRA_COLUMN[fromStage];
  const capCol = STAGE_COLUMN[fromStage];

  const existing = await db.execute({
    sql: `SELECT ${capCol} AS cap, ${extraCol} AS over_extra FROM team_advancement_caps WHERE team_id = ?`,
    args: [teamId],
  });

  if (existing.rows.length === 0) {
    await db.execute({
      sql: `INSERT INTO team_advancement_caps (
              team_id, ${extraCol}, updated_at, updated_by
            ) VALUES (?, ?, unixepoch(), ?)`,
      args: [teamId, extraCount, updatedBy],
    });
    return { cap: null, overCapExtra: extraCount };
  }

  await db.execute({
    sql: `UPDATE team_advancement_caps
          SET ${extraCol} = ?, updated_at = unixepoch(), updated_by = ?
          WHERE team_id = ?`,
    args: [extraCount, updatedBy, teamId],
  });

  return {
    cap: parseCap(existing.rows[0].cap),
    overCapExtra: extraCount,
  };
}

export async function listTeamAdvancementCaps(): Promise<TeamAdvancementCaps[]> {
  const teams = await getTeams();
  const db = getDb();
  const result = await db.execute(
    `SELECT team_id, application_cap, first_round_cap, deliberations_cap,
            application_over_cap_extra, first_round_over_cap_extra, deliberations_over_cap_extra
     FROM team_advancement_caps`,
  );
  const byTeamId = new Map(
    result.rows.map((row) => [
      row.team_id as number,
      {
        applicationCap: parseCap(row.application_cap),
        firstRoundCap: parseCap(row.first_round_cap),
        deliberationsCap: parseCap(row.deliberations_cap),
        applicationOverCapExtra: parseExtra(row.application_over_cap_extra),
        firstRoundOverCapExtra: parseExtra(row.first_round_over_cap_extra),
        deliberationsOverCapExtra: parseExtra(row.deliberations_over_cap_extra),
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
      applicationOverCapExtra: caps?.applicationOverCapExtra ?? 0,
      firstRoundOverCapExtra: caps?.firstRoundOverCapExtra ?? 0,
      deliberationsOverCapExtra: caps?.deliberationsOverCapExtra ?? 0,
    };
  });
}

export async function upsertTeamAdvancementCaps(
  teamId: number,
  caps: {
    applicationCap?: number | null;
    firstRoundCap?: number | null;
    deliberationsCap?: number | null;
    /** When true, reset that stage's over-cap extra to 0. */
    clearApplicationOverCapExtra?: boolean;
    clearFirstRoundOverCapExtra?: boolean;
    clearDeliberationsOverCapExtra?: boolean;
  },
  updatedBy: number,
): Promise<TeamAdvancementCaps> {
  const team = await getTeamById(teamId);
  if (!team) throw new Error('Team not found.');

  const usesFirstRoundCap = !getTeamPipelineProfile(team.name).skipFinalRoundPhase;

  const applicationCap =
    caps.applicationCap !== undefined ? parseCap(caps.applicationCap) : undefined;
  const firstRoundCap = !usesFirstRoundCap
    ? null
    : caps.firstRoundCap !== undefined
      ? parseCap(caps.firstRoundCap)
      : undefined;
  const deliberationsCap =
    caps.deliberationsCap !== undefined ? parseCap(caps.deliberationsCap) : undefined;

  if (caps.applicationCap !== undefined && caps.applicationCap !== null && applicationCap === null) {
    throw new Error('Application advancement limit must be a positive whole number.');
  }
  if (
    usesFirstRoundCap &&
    caps.firstRoundCap !== undefined &&
    caps.firstRoundCap !== null &&
    firstRoundCap === null
  ) {
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
                 application_over_cap_extra, first_round_over_cap_extra, deliberations_over_cap_extra
          FROM team_advancement_caps WHERE team_id = ?`,
    args: [teamId],
  });

  const nextApplicationCap =
    applicationCap !== undefined
      ? applicationCap
      : existing.rows.length > 0
        ? parseCap(existing.rows[0].application_cap)
        : null;
  const nextFirstRoundCap = !usesFirstRoundCap
    ? null
    : firstRoundCap !== undefined
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

  const existingAppExtra =
    existing.rows.length > 0 ? parseExtra(existing.rows[0].application_over_cap_extra) : 0;
  const existingFrExtra =
    existing.rows.length > 0 ? parseExtra(existing.rows[0].first_round_over_cap_extra) : 0;
  const existingDelibsExtra =
    existing.rows.length > 0 ? parseExtra(existing.rows[0].deliberations_over_cap_extra) : 0;

  const nextApplicationExtra = caps.clearApplicationOverCapExtra ? 0 : existingAppExtra;
  const nextFirstRoundExtra = !usesFirstRoundCap
    ? 0
    : caps.clearFirstRoundOverCapExtra
      ? 0
      : existingFrExtra;
  const nextDeliberationsExtra = caps.clearDeliberationsOverCapExtra ? 0 : existingDelibsExtra;

  if (existing.rows.length === 0) {
    await db.execute({
      sql: `INSERT INTO team_advancement_caps (
              team_id, application_cap, first_round_cap, deliberations_cap,
              application_over_cap_extra, first_round_over_cap_extra, deliberations_over_cap_extra,
              updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), ?)`,
      args: [
        teamId,
        nextApplicationCap,
        nextFirstRoundCap,
        nextDeliberationsCap,
        nextApplicationExtra,
        nextFirstRoundExtra,
        nextDeliberationsExtra,
        updatedBy,
      ],
    });
  } else {
    await db.execute({
      sql: `UPDATE team_advancement_caps
            SET application_cap = ?, first_round_cap = ?, deliberations_cap = ?,
                application_over_cap_extra = ?, first_round_over_cap_extra = ?,
                deliberations_over_cap_extra = ?,
                updated_at = unixepoch(), updated_by = ?
            WHERE team_id = ?`,
      args: [
        nextApplicationCap,
        nextFirstRoundCap,
        nextDeliberationsCap,
        nextApplicationExtra,
        nextFirstRoundExtra,
        nextDeliberationsExtra,
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
    applicationOverCapExtra: nextApplicationExtra,
    firstRoundOverCapExtra: nextFirstRoundExtra,
    deliberationsOverCapExtra: nextDeliberationsExtra,
  };
}
