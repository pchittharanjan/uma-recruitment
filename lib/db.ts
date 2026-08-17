import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient, type Client, type ResultSet, type Row } from '@libsql/client';
import { cachedPerRequest } from '@/lib/request-cache';
import { normalizeUserRole, type UserRole } from '@/lib/roles';

export type { UserRole } from '@/lib/roles';

let client: Client | null = null;

export function getDb(): Client {
  if (!client) {
    const rawUrl = process.env.TURSO_DATABASE_URL;
    const rawToken = process.env.TURSO_AUTH_TOKEN;
    const authToken = rawToken?.replace(/^<|>$/g, '');

    if (!rawUrl) {
      throw new Error('TURSO_DATABASE_URL environment variable is required');
    }

    // Force HTTPS transport — libsql:// tries WebSocket/hrana-v3 which fails
    // in serverless environments (Vercel). https:// uses plain HTTP.
    const url = rawUrl.startsWith('libsql://')
      ? rawUrl.replace('libsql://', 'https://')
      : rawUrl;

    client = createClient({ url, authToken, fetch: globalThis.fetch });
  }
  return client;
}

function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('--')) return '';
      const commentIndex = line.indexOf('--');
      return commentIndex === -1 ? line : line.slice(0, commentIndex);
    })
    .join('\n');
}

function loadSchemaStatements(): string[] {
  const raw = readFileSync(join(process.cwd(), 'SCHEMA.sql'), 'utf-8');
  const sql = stripSqlComments(raw);

  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

let dbInitPromise: Promise<void> | null = null;

/** Run schema setup, seed, and migrations once per process. */
export function initDb(): Promise<void> {
  if (!dbInitPromise) {
    dbInitPromise = initDbOnce().catch((err) => {
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}

/**
 * Bump to force a full re-init when schema work happens outside SCHEMA.sql and
 * the MIGRATIONS list (e.g. editing a backfill function's logic).
 */
const INIT_REVISION = 1;

/** Fingerprint of everything initDbOnce runs; changes whenever schema work changes. */
function computeSchemaFingerprint(): string {
  const schema = readFileSync(join(process.cwd(), 'SCHEMA.sql'), 'utf-8');
  return createHash('sha256')
    .update(String(INIT_REVISION))
    .update(schema)
    .update(MIGRATIONS.join(';'))
    .digest('hex');
}

async function isDbUpToDate(db: Client, fingerprint: string): Promise<boolean> {
  try {
    const result = await db.execute('SELECT schema_hash FROM db_meta WHERE id = 1');
    return result.rows[0]?.schema_hash === fingerprint;
  } catch {
    return false; // db_meta missing → fresh or pre-fingerprint database
  }
}

async function markDbUpToDate(db: Client, fingerprint: string): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS db_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    schema_hash TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);
  await db.execute({
    sql: `INSERT INTO db_meta (id, schema_hash, updated_at) VALUES (1, ?, unixepoch())
          ON CONFLICT(id) DO UPDATE SET schema_hash = excluded.schema_hash, updated_at = unixepoch()`,
    args: [fingerprint],
  });
}

async function initDbOnce(): Promise<void> {
  const db = getDb();

  // Fast path: schema already matches — one query per cold start instead of ~70.
  const fingerprint = computeSchemaFingerprint();
  if (await isDbUpToDate(db, fingerprint)) return;

  const statements = loadSchemaStatements();

  for (let i = 0; i < statements.length; i++) {
    try {
      await db.execute(statements[i]);
    } catch (e) {
      console.error(`initDb: statement ${i} failed:`, statements[i].slice(0, 80), e);
      throw e;
    }
  }

  const { seedDb } = await import('@/lib/seed');
  await seedDb();
  await runMigrations(db);
  await markDbUpToDate(db, fingerprint);
}

const MIGRATIONS = [
    'ALTER TABLE applications ADD COLUMN row_index INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE round_settings ADD COLUMN context_fields TEXT NOT NULL DEFAULT '[]'",
    'ALTER TABLE round_settings ADD COLUMN graders_per_application INTEGER NOT NULL DEFAULT 3',
    `CREATE TABLE IF NOT EXISTS round_stage_unlocks (
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      stage TEXT NOT NULL CHECK (stage IN ('application', 'first_round', 'final_round', 'deliberations')),
      unlocked_at INTEGER NOT NULL DEFAULT (unixepoch()),
      unlocked_by INTEGER NOT NULL REFERENCES users(id),
      PRIMARY KEY (round_id, stage)
    )`,
    `CREATE TABLE IF NOT EXISTS org_rubric (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      score_fields TEXT NOT NULL DEFAULT '[]',
      custom_score_fields TEXT NOT NULL DEFAULT '[]',
      grader_instructions TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS interview_schedule_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      first_round_date TEXT,
      first_round_start_time TEXT NOT NULL DEFAULT '09:00',
      final_round_date TEXT,
      final_round_start_time TEXT NOT NULL DEFAULT '09:00',
      block_minutes INTEGER NOT NULL DEFAULT 30,
      group_size INTEGER NOT NULL DEFAULT 4,
      parallel_groups_per_block INTEGER NOT NULL DEFAULT 2
    )`,
    `CREATE TABLE IF NOT EXISTS team_interview_schedule_config (
      team_id INTEGER PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
      first_round_date TEXT,
      first_round_start_time TEXT NOT NULL DEFAULT '09:00',
      final_round_date TEXT,
      final_round_start_time TEXT NOT NULL DEFAULT '09:00',
      block_minutes INTEGER NOT NULL DEFAULT 30 CHECK (block_minutes >= 15)
    )`,
    'ALTER TABLE interview_schedule_config ADD COLUMN parallel_groups_per_block INTEGER NOT NULL DEFAULT 2',
    `CREATE TABLE IF NOT EXISTS round_communications (
      round_id INTEGER PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
      pass_subject TEXT,
      pass_body TEXT,
      reject_subject TEXT,
      reject_body TEXT,
      pass_notified_at INTEGER,
      reject_notified_at INTEGER
    )`,
    'ALTER TABLE round_communications ADD COLUMN pass_notified_at INTEGER',
    'ALTER TABLE round_communications ADD COLUMN reject_notified_at INTEGER',
    `CREATE TABLE IF NOT EXISTS round_outcome_emails (
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      from_stage TEXT NOT NULL
        CHECK (from_stage IN ('application', 'first_round', 'final_round')),
      pass_subject TEXT,
      pass_body TEXT,
      reject_subject TEXT,
      reject_body TEXT,
      pass_notified_at INTEGER,
      reject_notified_at INTEGER,
      PRIMARY KEY (round_id, from_stage)
    )`,
    'ALTER TABLE round_settings ADD COLUMN interview_script_first_round TEXT',
    'ALTER TABLE round_settings ADD COLUMN interview_guides TEXT',
    `CREATE TABLE IF NOT EXISTS interview_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      stage TEXT NOT NULL CHECK (stage IN ('first_round', 'final_round')),
      scheduled_at TEXT NOT NULL,
      location TEXT,
      logistics_note TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (application_id, stage)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_interview_slots_round_team ON interview_slots(round_id, team_id, stage)`,
    'ALTER TABLE interview_slots ADD COLUMN group_key TEXT',
    `CREATE TABLE IF NOT EXISTS interview_slot_interviewers (
      slot_id INTEGER NOT NULL REFERENCES interview_slots(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      PRIMARY KEY (slot_id, user_id)
    )`,
    'ALTER TABLE round_settings ADD COLUMN coffee_chat_start_date TEXT',
    'ALTER TABLE round_settings ADD COLUMN application_due_date TEXT',
    `CREATE TABLE IF NOT EXISTS org_coffee_chat_dates (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      coffee_chat_start_date TEXT,
      application_due_date TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS org_recruitment_cycle (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      semester TEXT NOT NULL CHECK (semester IN ('fall', 'spring')),
      year INTEGER NOT NULL CHECK (year >= 2026)
    )`,
    `CREATE TABLE IF NOT EXISTS team_advancement_caps (
      team_id INTEGER PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
      application_cap INTEGER CHECK (application_cap IS NULL OR application_cap >= 1),
      first_round_cap INTEGER CHECK (first_round_cap IS NULL OR first_round_cap >= 1),
      deliberations_cap INTEGER CHECK (deliberations_cap IS NULL OR deliberations_cap >= 1),
      application_allow_over_cap INTEGER NOT NULL DEFAULT 0
        CHECK (application_allow_over_cap IN (0, 1)),
      first_round_allow_over_cap INTEGER NOT NULL DEFAULT 0
        CHECK (first_round_allow_over_cap IN (0, 1)),
      deliberations_allow_over_cap INTEGER NOT NULL DEFAULT 0
        CHECK (deliberations_allow_over_cap IN (0, 1)),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_by INTEGER REFERENCES users(id)
    )`,
    'ALTER TABLE team_advancement_caps ADD COLUMN deliberations_cap INTEGER CHECK (deliberations_cap IS NULL OR deliberations_cap >= 1)',
    'ALTER TABLE team_advancement_caps ADD COLUMN application_allow_over_cap INTEGER NOT NULL DEFAULT 0 CHECK (application_allow_over_cap IN (0, 1))',
    'ALTER TABLE team_advancement_caps ADD COLUMN first_round_allow_over_cap INTEGER NOT NULL DEFAULT 0 CHECK (first_round_allow_over_cap IN (0, 1))',
    'ALTER TABLE team_advancement_caps ADD COLUMN deliberations_allow_over_cap INTEGER NOT NULL DEFAULT 0 CHECK (deliberations_allow_over_cap IN (0, 1))',
    "ALTER TABLE applications ADD COLUMN stage TEXT NOT NULL DEFAULT 'application'",
    `CREATE TABLE IF NOT EXISTS coffee_chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER REFERENCES rounds(id) ON DELETE SET NULL,
      chat_date TEXT NOT NULL,
      submitter_id INTEGER NOT NULL REFERENCES users(id),
      submitter_name TEXT NOT NULL,
      applicant_name TEXT NOT NULL,
      applicant_name_normalized TEXT NOT NULL,
      vibes TEXT,
      green_flags TEXT,
      red_flags TEXT,
      other_comments TEXT,
      conflict_of_interest TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE INDEX IF NOT EXISTS idx_coffee_chats_round ON coffee_chats(round_id)`,
    `CREATE INDEX IF NOT EXISTS idx_coffee_chats_submitter ON coffee_chats(submitter_id)`,
    `CREATE INDEX IF NOT EXISTS idx_coffee_chats_applicant_norm ON coffee_chats(round_id, applicant_name_normalized)`,
    `CREATE TABLE IF NOT EXISTS team_advancement_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      top_n INTEGER NOT NULL,
      application_ids TEXT NOT NULL,
      candidates TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'approved', 'withdrawn')),
      submitted_by INTEGER NOT NULL REFERENCES users(id),
      submitted_at INTEGER NOT NULL DEFAULT (unixepoch()),
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS idx_advancement_submissions_team_round
      ON team_advancement_submissions(team_id, round_id, status)`,
    "ALTER TABLE team_advancement_submissions ADD COLUMN from_stage TEXT NOT NULL DEFAULT 'application'",
    "ALTER TABLE assignments ADD COLUMN advancement_recommendation TEXT CHECK (advancement_recommendation IN ('advance', 'pass'))",
    "ALTER TABLE assignments ADD COLUMN advancement_verdict TEXT CHECK (advancement_verdict IN ('yes', 'maybe', 'no'))",
    'ALTER TABLE access_grants ADD COLUMN is_director INTEGER NOT NULL DEFAULT 0',
    `CREATE TABLE IF NOT EXISTS deliberation_boards (
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      layout_json TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_by INTEGER REFERENCES users(id),
      PRIMARY KEY (team_id, round_id)
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      href TEXT,
      team_id INTEGER REFERENCES teams(id),
      read_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_user_created
      ON notifications(user_id, created_at DESC)`,
    'ALTER TABLE scores ADD COLUMN note TEXT',
];

async function runMigrations(db: ReturnType<typeof getDb>): Promise<void> {
  for (const sql of MIGRATIONS) {
    try {
      await db.execute(sql);
    } catch {
      // Column already exists
    }
  }

  await backfillGradersPerApplication(db);
  await backfillApplicationStageUnlocks(db);
  await backfillApplicationRowIndexOneBased(db);
  await migrateTeamExecRoleToExec(db);
  await migrateAdvancementVerdictColors(db);
  await migrateCoffeeChatsNullableRoundId(db);
  await backfillCoffeeChatsNullRoundId(db);
  await migrateRoundCommunicationsToOutcomeEmails(db);
}

/** Copy legacy round_communications rows into application-stage outcome emails. */
async function migrateRoundCommunicationsToOutcomeEmails(
  db: ReturnType<typeof getDb>,
): Promise<void> {
  try {
    await db.execute({
      sql: `INSERT INTO round_outcome_emails (
              round_id, from_stage, pass_subject, pass_body, reject_subject, reject_body,
              pass_notified_at, reject_notified_at
            )
            SELECT round_id, 'application', pass_subject, pass_body, reject_subject, reject_body,
                   pass_notified_at, reject_notified_at
            FROM round_communications
            WHERE NOT EXISTS (
              SELECT 1 FROM round_outcome_emails e
              WHERE e.round_id = round_communications.round_id AND e.from_stage = 'application'
            )`,
    });
  } catch {
    // Table may not exist yet on brand-new DBs before CREATE runs; ignore.
  }
}

async function backfillApplicationRowIndexOneBased(db: ReturnType<typeof getDb>): Promise<void> {
  const zeroRows = await db.execute({
    sql: 'SELECT id, team_id, round_id FROM applications WHERE row_index = 0 ORDER BY id',
  });
  if (zeroRows.rows.length === 0) return;

  for (const row of zeroRows.rows) {
    const maxResult = await db.execute({
      sql: `SELECT COALESCE(MAX(row_index), 0) AS max_idx
            FROM applications
            WHERE team_id = ? AND round_id = ? AND row_index > 0`,
      args: [row.team_id as number, row.round_id as number],
    });
    const nextIndex = (maxResult.rows[0].max_idx as number) + 1;
    await db.execute({
      sql: 'UPDATE applications SET row_index = ? WHERE id = ?',
      args: [nextIndex, row.id as number],
    });
  }
}

async function assignmentsNeedsVerdictConstraintMigration(
  db: ReturnType<typeof getDb>,
): Promise<boolean> {
  const result = await db.execute({
    sql: `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'assignments'`,
  });
  const ddl = (result.rows[0]?.sql as string) ?? '';
  if (!ddl.includes('advancement_verdict')) return false;
  // Legacy ALTER TABLE constraint from before color verdicts.
  if (ddl.includes("'yes', 'maybe', 'no'")) return true;
  return !ddl.includes('high_yellow');
}

async function migrateAdvancementVerdictColors(db: ReturnType<typeof getDb>): Promise<void> {
  if (!(await assignmentsNeedsVerdictConstraintMigration(db))) return;

  await db.execute('PRAGMA foreign_keys=OFF');
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS assignments_verdict_mig (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      stage TEXT NOT NULL CHECK (stage IN ('application', 'first_round', 'final_round')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
      completed_at INTEGER,
      comment TEXT,
      advancement_recommendation TEXT CHECK (advancement_recommendation IN ('advance', 'pass')),
      advancement_verdict TEXT CHECK (advancement_verdict IN ('green', 'high_yellow', 'yellow', 'low_yellow', 'red')),
      UNIQUE (application_id, user_id, stage)
    )`);
    await db.execute(`INSERT INTO assignments_verdict_mig (
      id, application_id, user_id, stage, status, completed_at, comment,
      advancement_recommendation, advancement_verdict
    )
    SELECT id, application_id, user_id, stage, status, completed_at, comment,
      advancement_recommendation,
      CASE advancement_verdict
        WHEN 'yes' THEN 'green'
        WHEN 'maybe' THEN 'yellow'
        WHEN 'no' THEN 'red'
        ELSE advancement_verdict
      END
    FROM assignments`);
    await db.execute('DROP TABLE assignments');
    await db.execute('ALTER TABLE assignments_verdict_mig RENAME TO assignments');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id)');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_assignments_application ON assignments(application_id)',
    );
  } finally {
    await db.execute('PRAGMA foreign_keys=ON');
  }
}

/** Detach legacy coffee chat rows from team rounds (org-wide intake only). */
async function backfillCoffeeChatsNullRoundId(db: ReturnType<typeof getDb>): Promise<void> {
  const linked = await db.execute({
    sql: 'SELECT COUNT(*) AS count FROM coffee_chats WHERE round_id IS NOT NULL',
  });
  if ((linked.rows[0].count as number) === 0) return;

  await db.execute('UPDATE coffee_chats SET round_id = NULL WHERE round_id IS NOT NULL');
}

async function migrateCoffeeChatsNullableRoundId(db: ReturnType<typeof getDb>): Promise<void> {
  const tableInfo = await db.execute({ sql: 'PRAGMA table_info(coffee_chats)' });
  if (tableInfo.rows.length === 0) return;

  const roundCol = tableInfo.rows.find((row) => row.name === 'round_id');
  if (!roundCol || (roundCol.notnull as number) === 0) return;

  await db.execute('PRAGMA foreign_keys=OFF');
  try {
    await db.execute(`CREATE TABLE coffee_chats_round_nullable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER REFERENCES rounds(id) ON DELETE SET NULL,
      chat_date TEXT NOT NULL,
      submitter_id INTEGER NOT NULL REFERENCES users(id),
      submitter_name TEXT NOT NULL,
      applicant_name TEXT NOT NULL,
      applicant_name_normalized TEXT NOT NULL,
      vibes TEXT,
      green_flags TEXT,
      red_flags TEXT,
      other_comments TEXT,
      conflict_of_interest TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`);
    await db.execute(`INSERT INTO coffee_chats_round_nullable
      SELECT * FROM coffee_chats`);
    await db.execute('DROP TABLE coffee_chats');
    await db.execute('ALTER TABLE coffee_chats_round_nullable RENAME TO coffee_chats');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_coffee_chats_round ON coffee_chats(round_id)');
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_coffee_chats_submitter ON coffee_chats(submitter_id)',
    );
    await db.execute(
      'CREATE INDEX IF NOT EXISTS idx_coffee_chats_applicant_norm ON coffee_chats(round_id, applicant_name_normalized)',
    );
  } finally {
    await db.execute('PRAGMA foreign_keys=ON');
  }
}

async function migrateTeamExecRoleToExec(db: ReturnType<typeof getDb>): Promise<void> {
  const legacy = await db.execute({
    sql: `SELECT COUNT(*) AS count FROM users WHERE role = ?`,
    args: ['team_exec'],
  });
  if ((legacy.rows[0].count as number) === 0) return;

  try {
    await db.execute(`UPDATE users SET role = 'exec' WHERE role = 'team_exec'`);
    return;
  } catch {
    // CHECK constraint may still list team_exec — rebuild users table.
  }

  await db.execute('PRAGMA foreign_keys=OFF');
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS users_role_migration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'exec', 'ad_hoc_exec', 'general_member')),
      invited_by INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`);
    await db.execute(`INSERT INTO users_role_migration (id, email, name, role, invited_by, created_at)
      SELECT id, email, name,
        CASE WHEN role = 'team_exec' THEN 'exec' ELSE role END,
        invited_by, created_at
      FROM users`);
    await db.execute('DROP TABLE users');
    await db.execute('ALTER TABLE users_role_migration RENAME TO users');
  } finally {
    await db.execute('PRAGMA foreign_keys=ON');
  }
}

async function backfillApplicationStageUnlocks(db: ReturnType<typeof getDb>): Promise<void> {
  const rounds = await db.execute({
    sql: `SELECT r.id FROM rounds r
          JOIN round_settings rs ON rs.round_id = r.id
          WHERE r.status != 'closed'`,
  });
  for (const row of rounds.rows) {
    const roundId = row.id as number;
    const existing = await db.execute({
      sql: 'SELECT 1 FROM round_stage_unlocks WHERE round_id = ? AND stage = ?',
      args: [roundId, 'application'],
    });
    if (existing.rows.length > 0) continue;
    try {
      await db.execute({
        sql: `INSERT INTO round_stage_unlocks (round_id, stage, unlocked_by)
              SELECT ?, 'application', id FROM users WHERE role = 'admin' LIMIT 1
              ON CONFLICT(round_id, stage) DO NOTHING`,
        args: [roundId],
      });
    } catch (e) {
      console.warn(`backfillApplicationStageUnlocks: round ${roundId}`, e);
    }
  }
}

async function backfillGradersPerApplication(db: ReturnType<typeof getDb>): Promise<void> {
  const rounds = await db.execute('SELECT round_id FROM round_settings');
  for (const row of rounds.rows) {
    const roundId = row.round_id as number;
    const stats = await db.execute({
      sql: `SELECT
              (SELECT COUNT(*) FROM applications WHERE round_id = ?) AS apps,
              (SELECT COUNT(*) FROM assignments a
               JOIN applications app ON app.id = a.application_id
               WHERE app.round_id = ? AND a.stage = 'application') AS assignments`,
      args: [roundId, roundId],
    });
    const apps = stats.rows[0].apps as number;
    const assignments = stats.rows[0].assignments as number;
    if (apps > 0 && assignments > 0) {
      const perApp = Math.round(assignments / apps);
      await db.execute({
        sql: 'UPDATE round_settings SET graders_per_application = ? WHERE round_id = ?',
        args: [perApp, roundId],
      });
    }
  }
}

// ── v2 types ────────────────────────────────────────────────────────────────

export type TeamName = 'Strategy' | 'Events' | 'Design';
export type RoundStatus =
  | 'setup'
  | 'pre_application'
  | 'application'
  | 'first_round'
  | 'final_round'
  | 'deliberations'
  | 'closed';
export type ApplicationStage =
  | 'application'
  | 'first_round'
  | 'final_round'
  | 'deliberations'
  | 'advanced'
  | 'rejected';
export type AssignmentStage = 'application' | 'first_round' | 'final_round';
export type AssignmentStatus = 'pending' | 'completed';
export type FlagColor = 'red' | 'green';

export interface Team {
  id: number;
  name: TeamName;
}

export interface Round {
  id: number;
  team_id: number;
  label: string;
  status: RoundStatus;
  created_at: number;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  invited_by: number | null;
  created_at: number;
}

export interface AccessGrant {
  id: number;
  user_id: number;
  team_id: number;
  round_id: number | null;
  stage: AssignmentStage | null;
  is_director: boolean;
  granted_by: number;
  granted_at: number;
  revoked_at: number | null;
}

export interface Candidate {
  id: number;
  name: string;
  email: string;
  created_at: number;
}

export interface Application {
  id: number;
  candidate_id: number;
  round_id: number;
  team_id: number;
  fields: Record<string, string>;
  stage: ApplicationStage;
  admin_note: string | null;
  final_score: number | null;
  rank: number | null;
  row_index: number;
  created_at: number;
}

export interface Assignment {
  id: number;
  application_id: number;
  user_id: number;
  stage: AssignmentStage;
  status: AssignmentStatus;
  completed_at: number | null;
  comment: string | null;
}

export interface Score {
  id: number;
  assignment_id: number;
  field_name: string;
  score: number;
  note: string | null;
}

export interface Flag {
  id: number;
  application_id: number;
  author_id: number;
  color: FlagColor;
  note: string | null;
  created_at: number;
}

// ── row parsers ─────────────────────────────────────────────────────────────

function parseJsonFields(value: unknown): Record<string, string> {
  if (typeof value !== 'string' || value.length === 0) return {};
  return JSON.parse(value) as Record<string, string>;
}

export function rowToTeam(row: Row): Team {
  return {
    id: row.id as number,
    name: row.name as TeamName,
  };
}

export function rowToRound(row: Row): Round {
  return {
    id: row.id as number,
    team_id: row.team_id as number,
    label: row.label as string,
    status: row.status as RoundStatus,
    created_at: row.created_at as number,
  };
}

export function rowToUser(row: Row): User {
  return {
    id: row.id as number,
    email: row.email as string,
    name: row.name as string,
    role: normalizeUserRole(row.role as string),
    invited_by: (row.invited_by as number | null) ?? null,
    created_at: row.created_at as number,
  };
}

export function rowToAccessGrant(row: Row): AccessGrant {
  return {
    id: row.id as number,
    user_id: row.user_id as number,
    team_id: row.team_id as number,
    round_id: (row.round_id as number | null) ?? null,
    stage: (row.stage as AssignmentStage | null) ?? null,
    is_director: Boolean(row.is_director),
    granted_by: row.granted_by as number,
    granted_at: row.granted_at as number,
    revoked_at: (row.revoked_at as number | null) ?? null,
  };
}

export function rowToCandidate(row: Row): Candidate {
  return {
    id: row.id as number,
    name: row.name as string,
    email: row.email as string,
    created_at: row.created_at as number,
  };
}

export function rowToApplication(row: Row): Application {
  return {
    id: row.id as number,
    candidate_id: row.candidate_id as number,
    round_id: row.round_id as number,
    team_id: row.team_id as number,
    fields: parseJsonFields(row.fields),
    stage: row.stage as ApplicationStage,
    admin_note: (row.admin_note as string | null) ?? null,
    final_score: (row.final_score as number | null) ?? null,
    rank: (row.rank as number | null) ?? null,
    row_index: (row.row_index as number | null) ?? 0,
    created_at: row.created_at as number,
  };
}

export function rowToAssignment(row: Row): Assignment {
  return {
    id: row.id as number,
    application_id: row.application_id as number,
    user_id: row.user_id as number,
    stage: row.stage as AssignmentStage,
    status: row.status as AssignmentStatus,
    completed_at: (row.completed_at as number | null) ?? null,
    comment: (row.comment as string | null) ?? null,
  };
}

export function rowToScore(row: Row): Score {
  return {
    id: row.id as number,
    assignment_id: row.assignment_id as number,
    field_name: row.field_name as string,
    score: row.score as number,
    note: (row.note as string | null) ?? null,
  };
}

export function rowToFlag(row: Row): Flag {
  return {
    id: row.id as number,
    application_id: row.application_id as number,
    author_id: row.author_id as number,
    color: row.color as FlagColor,
    note: (row.note as string | null) ?? null,
    created_at: row.created_at as number,
  };
}

// ── query helpers ───────────────────────────────────────────────────────────

export async function getTeams(): Promise<Team[]> {
  return cachedPerRequest('teams', async () => {
    const db = getDb();
    const result = await db.execute('SELECT * FROM teams ORDER BY id');
    return result.rows.map(rowToTeam);
  });
}

export async function getTeamById(id: number): Promise<Team | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM teams WHERE id = ?',
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return rowToTeam(result.rows[0]);
}

export async function getTeamByName(name: TeamName): Promise<Team | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM teams WHERE name = ?',
    args: [name],
  });
  if (result.rows.length === 0) return null;
  return rowToTeam(result.rows[0]);
}

export async function getUserById(id: number): Promise<User | null> {
  return cachedPerRequest(`user:${id}`, async () => {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [id],
    });
    if (result.rows.length === 0) return null;
    return rowToUser(result.rows[0]);
  });
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE email = ?',
    args: [email],
  });
  if (result.rows.length === 0) return null;
  return rowToUser(result.rows[0]);
}

export async function getRoundById(id: number): Promise<Round | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM rounds WHERE id = ?',
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return rowToRound(result.rows[0]);
}

export async function getRoundsForTeam(teamId: number): Promise<Round[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM rounds WHERE team_id = ? ORDER BY created_at DESC',
    args: [teamId],
  });
  return result.rows.map(rowToRound);
}

export async function getApplicationById(id: number): Promise<Application | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM applications WHERE id = ?',
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return rowToApplication(result.rows[0]);
}

export async function getActiveAccessGrantsForUser(userId: number): Promise<AccessGrant[]> {
  return cachedPerRequest(`grants:${userId}`, async () => {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM access_grants WHERE user_id = ? AND revoked_at IS NULL',
      args: [userId],
    });
    return result.rows.map(rowToAccessGrant);
  });
}

export type { ResultSet };
