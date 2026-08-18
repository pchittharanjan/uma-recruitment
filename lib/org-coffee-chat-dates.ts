import { getDb } from '@/lib/db';
import { DEFAULT_GRADERS_PER_APPLICATION } from '@/lib/assignments';
import { getRecruitmentCycleShortLabel } from '@/lib/org-recruitment-cycle-server';

export interface OrgCoffeeChatDates {
  coffeeChatStartDate: string | null;
  applicationDueDate: string | null;
}

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function validateCoffeeChatDates(dates: OrgCoffeeChatDates): void {
  if (dates.coffeeChatStartDate && !isValidIsoDate(dates.coffeeChatStartDate)) {
    throw new Error('Coffee chat start date must be YYYY-MM-DD.');
  }
  if (dates.applicationDueDate && !isValidIsoDate(dates.applicationDueDate)) {
    throw new Error('Application due date must be YYYY-MM-DD.');
  }
  if (
    dates.coffeeChatStartDate &&
    dates.applicationDueDate &&
    dates.coffeeChatStartDate > dates.applicationDueDate
  ) {
    throw new Error('Coffee chat start date must be on or before application due date.');
  }
}

export async function getActiveRoundCount(): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS count FROM rounds WHERE status != 'closed'`,
  });
  return Number(result.rows[0]?.count ?? 0);
}

export async function getOrgCoffeeChatDates(): Promise<OrgCoffeeChatDates> {
  const db = getDb();
  const result = await db.execute('SELECT * FROM org_coffee_chat_dates WHERE id = 1');
  const row = result.rows[0];
  if (!row) {
    return { coffeeChatStartDate: null, applicationDueDate: null };
  }
  return {
    coffeeChatStartDate: (row.coffee_chat_start_date as string | null) ?? null,
    applicationDueDate: (row.application_due_date as string | null) ?? null,
  };
}

/** Persist org defaults and copy onto every non-closed round's settings. */
export async function saveOrgCoffeeChatDates(dates: OrgCoffeeChatDates): Promise<OrgCoffeeChatDates> {
  validateCoffeeChatDates(dates);

  const db = getDb();
  await db.execute({
    sql: `INSERT INTO org_coffee_chat_dates (id, coffee_chat_start_date, application_due_date)
          VALUES (1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            coffee_chat_start_date = excluded.coffee_chat_start_date,
            application_due_date = excluded.application_due_date`,
    args: [dates.coffeeChatStartDate, dates.applicationDueDate],
  });

  await db.execute({
    sql: `UPDATE round_settings
          SET coffee_chat_start_date = ?, application_due_date = ?
          WHERE round_id IN (SELECT id FROM rounds WHERE status != 'closed')`,
    args: [dates.coffeeChatStartDate, dates.applicationDueDate],
  });

  const activeRounds = await db.execute({
    sql: `SELECT id, team_id FROM rounds WHERE status != 'closed'`,
  });

  // Before applications are imported, initialize one pre-application round per team
  // so coffee chat submissions can run independently of CSV import.
  if (activeRounds.rows.length === 0) {
    const roundLabel = await getRecruitmentCycleShortLabel();
    const teams = await db.execute({ sql: 'SELECT id FROM teams' });
    for (const teamRow of teams.rows) {
      const teamId = teamRow.id as number;
      const roundInsert = await db.execute({
        sql: `INSERT INTO rounds (team_id, label, status)
              VALUES (?, ?, 'pre_application')`,
        args: [teamId, roundLabel],
      });
      const roundId = Number(roundInsert.lastInsertRowid);
      await db.execute({
        sql: `INSERT INTO round_settings (
                round_id, csv_headers, score_fields, custom_score_fields, context_fields,
                portfolio_fields, graders_per_application, coffee_chat_start_date, application_due_date
              ) VALUES (?, '[]', '[]', '[]', '[]', '[]', ?, ?, ?)`,
        args: [
          roundId,
          DEFAULT_GRADERS_PER_APPLICATION,
          dates.coffeeChatStartDate,
          dates.applicationDueDate,
        ],
      });
    }
  }

  return dates;
}

/** If org row is empty but active rounds already have dates, backfill org from the first round. */
export async function ensureOrgCoffeeChatDatesFromRounds(): Promise<OrgCoffeeChatDates> {
  const org = await getOrgCoffeeChatDates();
  if (org.coffeeChatStartDate || org.applicationDueDate) return org;

  const db = getDb();
  const result = await db.execute({
    sql: `SELECT rs.coffee_chat_start_date, rs.application_due_date
          FROM rounds r
          JOIN round_settings rs ON rs.round_id = r.id
          WHERE r.status != 'closed'
            AND (rs.coffee_chat_start_date IS NOT NULL OR rs.application_due_date IS NOT NULL)
          ORDER BY r.id
          LIMIT 1`,
  });
  const row = result.rows[0];
  if (!row) return org;

  const fromRounds: OrgCoffeeChatDates = {
    coffeeChatStartDate: (row.coffee_chat_start_date as string | null) ?? null,
    applicationDueDate: (row.application_due_date as string | null) ?? null,
  };
  await db.execute({
    sql: `INSERT INTO org_coffee_chat_dates (id, coffee_chat_start_date, application_due_date)
          VALUES (1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            coffee_chat_start_date = excluded.coffee_chat_start_date,
            application_due_date = excluded.application_due_date`,
    args: [fromRounds.coffeeChatStartDate, fromRounds.applicationDueDate],
  });
  return fromRounds;
}
