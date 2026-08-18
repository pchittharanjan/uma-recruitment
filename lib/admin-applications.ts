import { isPlaceholderCandidateEmail, resolveApplicantEmail } from '@/lib/candidates';
import { getDb, getTeams, type ApplicationStage, type Team } from '@/lib/db';
import type { AdminApplicationDetail, AdminApplicationRow } from '@/lib/admin-application-types';

export type { AdminApplicationDetail, AdminApplicationRow } from '@/lib/admin-application-types';

export { displayApplicantId } from '@/lib/applicant-id';

export interface ListAdminApplicationsOptions {
  q?: string;
  teamId?: number;
  stage?: ApplicationStage;
  /** Max rows to return (default 150). */
  limit?: number;
  /** Offset for pagination (default 0). */
  offset?: number;
}

const DEFAULT_LIST_LIMIT = 150;
const MAX_LIST_LIMIT = 500;

function searchPattern(q: string): string {
  return `%${q.trim().toLowerCase()}%`;
}

export async function listAdminApplications(
  options: ListAdminApplicationsOptions = {},
): Promise<{
  applications: AdminApplicationRow[];
  teams: Team[];
  total: number;
  allCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}> {
  const db = getDb();
  const teams = await getTeams();
  const q = options.q?.trim() ?? '';
  const hasSearch = q.length > 0;
  const pattern = hasSearch ? searchPattern(q) : null;
  const limit = Math.min(
    Math.max(options.limit ?? DEFAULT_LIST_LIMIT, 1),
    MAX_LIST_LIMIT,
  );
  const offset = Math.max(options.offset ?? 0, 0);

  const args: (string | number)[] = [];
  let where = `WHERE r.status != 'closed'`;

  if (options.teamId != null) {
    where += ' AND app.team_id = ?';
    args.push(options.teamId);
  }

  if (options.stage) {
    where += ' AND app.stage = ?';
    args.push(options.stage);
  }

  if (hasSearch && pattern) {
    where += ` AND (
      LOWER(c.name) LIKE ? OR
      LOWER(c.email) LIKE ? OR
      CAST(app.row_index AS TEXT) LIKE ?`;
    args.push(pattern, pattern, pattern);
    if (/^\d+$/.test(q)) {
      where += ' OR app.id = ?';
      args.push(Number.parseInt(q, 10));
    }
    if (q.length >= 3) {
      where += ' OR LOWER(app.fields) LIKE ?';
      args.push(pattern);
    }
    where += ')';
  }

  const countResult = await db.execute({
    sql: `SELECT COUNT(*) AS total
          FROM applications app
          JOIN candidates c ON c.id = app.candidate_id
          JOIN teams t ON t.id = app.team_id
          JOIN rounds r ON r.id = app.round_id
          ${where}`,
    args,
  });
  const total = (countResult.rows[0]?.total as number) ?? 0;

  const allCountResult = await db.execute({
    sql: `SELECT COUNT(*) AS total
          FROM applications app
          JOIN rounds r ON r.id = app.round_id
          WHERE r.status != 'closed'`,
  });
  const allCount = (allCountResult.rows[0]?.total as number) ?? total;

  // List payload skips app.fields when candidate email is usable — detail fetch loads fields.
  const result = await db.execute({
    sql: `SELECT app.id, app.row_index, app.stage, app.team_id, app.round_id,
                 app.final_score, app.rank, app.admin_note,
                 CASE
                   WHEN c.email IS NULL OR TRIM(c.email) = '' OR LOWER(c.email) LIKE '%@unknown.local'
                   THEN app.fields
                   ELSE NULL
                 END AS fields,
                 c.id AS candidate_id, c.name AS candidate_name, c.email AS candidate_email,
                 t.name AS team_name
          FROM applications app
          JOIN candidates c ON c.id = app.candidate_id
          JOIN teams t ON t.id = app.team_id
          JOIN rounds r ON r.id = app.round_id
          ${where}
          ORDER BY t.name ASC, app.row_index ASC
          LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  });

  const appIds = result.rows.map((r) => r.id as number);
  const progressByApp = new Map<number, { completed: number; total: number }>();

  if (appIds.length > 0) {
    const placeholders = appIds.map(() => '?').join(',');
    const progress = await db.execute({
      sql: `SELECT application_id,
                   COUNT(*) AS total,
                   SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
            FROM assignments
            WHERE application_id IN (${placeholders})
            GROUP BY application_id`,
      args: appIds,
    });
    for (const row of progress.rows) {
      progressByApp.set(row.application_id as number, {
        total: (row.total as number) ?? 0,
        completed: (row.completed as number) ?? 0,
      });
    }
  }

  const applications: AdminApplicationRow[] = result.rows.map((row) => {
    const id = row.id as number;
    const prog = progressByApp.get(id) ?? { completed: 0, total: 0 };
    const candidateEmailRaw = (row.candidate_email as string | null) ?? '';
    const fields = row.fields != null ? parseApplicationFields(row.fields) : {};
    const candidateEmail =
      candidateEmailRaw && !isPlaceholderCandidateEmail(candidateEmailRaw)
        ? candidateEmailRaw
        : resolveApplicantEmail(fields, candidateEmailRaw);
    return {
      id,
      rowIndex: (row.row_index as number | null) ?? 0,
      stage: row.stage as ApplicationStage,
      teamId: row.team_id as number,
      teamName: row.team_name as string,
      roundId: row.round_id as number,
      candidateId: row.candidate_id as number,
      candidateName: row.candidate_name as string,
      candidateEmail,
      finalScore: (row.final_score as number | null) ?? null,
      rank: (row.rank as number | null) ?? null,
      adminNote: (row.admin_note as string | null) ?? null,
      graderCompleted: prog.completed,
      graderTotal: prog.total,
    };
  });

  return {
    applications,
    teams,
    total,
    allCount,
    limit,
    offset,
    hasMore: offset + applications.length < total,
  };
}

export async function getAdminApplication(
  applicationId: number,
): Promise<AdminApplicationDetail | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT app.id, app.row_index, app.stage, app.team_id, app.round_id,
                 app.final_score, app.rank, app.admin_note, app.fields,
                 c.id AS candidate_id, c.name AS candidate_name, c.email AS candidate_email,
                 t.name AS team_name
          FROM applications app
          JOIN candidates c ON c.id = app.candidate_id
          JOIN teams t ON t.id = app.team_id
          WHERE app.id = ?`,
    args: [applicationId],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const id = row.id as number;
  const fields = parseApplicationFields(row.fields);

  const progress = await db.execute({
    sql: `SELECT COUNT(*) AS total,
                 SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
          FROM assignments WHERE application_id = ?`,
    args: [id],
  });

  return {
    id,
    rowIndex: (row.row_index as number | null) ?? 0,
    stage: row.stage as ApplicationStage,
    teamId: row.team_id as number,
    teamName: row.team_name as string,
    roundId: row.round_id as number,
    candidateId: row.candidate_id as number,
    candidateName: row.candidate_name as string,
    candidateEmail: resolveApplicantEmail(
      fields,
      (row.candidate_email as string | null) ?? '',
    ),
    finalScore: (row.final_score as number | null) ?? null,
    rank: (row.rank as number | null) ?? null,
    adminNote: (row.admin_note as string | null) ?? null,
    graderCompleted: (progress.rows[0].completed as number) ?? 0,
    graderTotal: (progress.rows[0].total as number) ?? 0,
    fields,
  };
}

function parseApplicationFields(raw: unknown): Record<string, string> {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
          key,
          value == null ? '' : String(value),
        ]),
      );
    }
  } catch {
    // fall through
  }
  return {};
}

export async function reclaimApplicationIds(): Promise<void> {
  const db = getDb();
  const max = await db.execute({
    sql: 'SELECT COALESCE(MAX(id), 0) AS max_id FROM applications',
  });
  const seq = (max.rows[0]?.max_id as number) ?? 0;
  const updated = await db.execute({
    sql: `UPDATE sqlite_sequence SET seq = ? WHERE name = 'applications'`,
    args: [seq],
  });
  if (updated.rowsAffected === 0) {
    await db.execute({
      sql: `INSERT INTO sqlite_sequence (name, seq) VALUES ('applications', ?)`,
      args: [seq],
    });
  }
}

export async function deleteAdminApplication(
  applicationId: number,
  teamId: number,
): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: 'DELETE FROM applications WHERE id = ? AND team_id = ?',
    args: [applicationId, teamId],
  });
  if (result.rowsAffected > 0) {
    await reclaimApplicationIds();
  }
  return result.rowsAffected > 0;
}
