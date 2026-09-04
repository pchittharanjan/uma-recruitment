import { getDb, type ResultSet, type User } from '@/lib/db';
import {
  canEditCoffeeChat,
  isWithinCoffeeChatWindow,
  normalizeApplicantName,
  parseTeamsInterested,
  serializeTeamsInterested,
  validateApplicantGradeLevel,
  validateApplicantEmail,
  validateTeamsInterested,
  type CoffeeChat,
  type CoffeeChatInput,
  type CoffeeChatUpdateInput,
  type CoffeeChatWithMeta,
} from '@/lib/coffee-chats';
import { getOrgCoffeeChatDates } from '@/lib/org-coffee-chat-dates';

export type {
  CoffeeChat,
  CoffeeChatInput,
  CoffeeChatUpdateInput,
  CoffeeChatWithMeta,
} from '@/lib/coffee-chats';

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function rowToCoffeeChat(row: ResultSet['rows'][number]): CoffeeChat {
  return {
    id: row.id as number,
    chat_date: row.chat_date as string,
    submitter_id: row.submitter_id as number,
    submitter_name: row.submitter_name as string,
    applicant_name: row.applicant_name as string,
    applicant_name_normalized: row.applicant_name_normalized as string,
    applicant_email: (row.applicant_email as string | null) ?? null,
    applicant_grade_level: (row.applicant_grade_level as CoffeeChat['applicant_grade_level']) ?? null,
    teams_interested: parseTeamsInterested(row.teams_interested as string | null | undefined),
    vibes: (row.vibes as string | null) ?? null,
    green_flags: (row.green_flags as string | null) ?? null,
    red_flags: (row.red_flags as string | null) ?? null,
    other_comments: (row.other_comments as string | null) ?? null,
    conflict_of_interest: (row.conflict_of_interest as string | null) ?? null,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  };
}

function rowToCoffeeChatWithMeta(row: ResultSet['rows'][number], now: number): CoffeeChatWithMeta {
  const chat = rowToCoffeeChat(row);
  return {
    ...chat,
    editable: canEditCoffeeChat(chat, now),
  };
}

/** Strip team/round fields before returning coffee chats to user-facing clients. */
export function serializeUserCoffeeChat(chat: CoffeeChatWithMeta) {
  return {
    id: chat.id,
    chat_date: chat.chat_date,
    applicant_name: chat.applicant_name,
    applicant_email: chat.applicant_email,
    applicant_grade_level: chat.applicant_grade_level,
    teams_interested: chat.teams_interested,
    vibes: chat.vibes,
    green_flags: chat.green_flags,
    red_flags: chat.red_flags,
    other_comments: chat.other_comments,
    conflict_of_interest: chat.conflict_of_interest,
    editable: chat.editable,
  };
}

export function serializeAdminCoffeeChat(
  chat: CoffeeChatWithMeta,
  applicantMatch?: {
    status: 'matched' | 'unmatched';
    candidateId: number | null;
    candidateName: string | null;
    detail: string;
  },
) {
  return {
    id: chat.id,
    chat_date: chat.chat_date,
    submitter_id: chat.submitter_id,
    submitter_name: chat.submitter_name,
    applicant_name: chat.applicant_name,
    applicant_email: chat.applicant_email,
    applicant_grade_level: chat.applicant_grade_level,
    teams_interested: chat.teams_interested,
    vibes: chat.vibes,
    green_flags: chat.green_flags,
    red_flags: chat.red_flags,
    other_comments: chat.other_comments,
    conflict_of_interest: chat.conflict_of_interest,
    editable: chat.editable,
    applicant_match: applicantMatch ?? {
      status: 'unmatched' as const,
      candidateId: null,
      candidateName: null,
      detail: 'Not matched',
    },
  };
}

export async function canUserAccessCoffeeChats(
  options?: { bypassWindow?: boolean },
): Promise<{ allowed: boolean; reason?: string }> {
  if (options?.bypassWindow) {
    return { allowed: true };
  }

  const orgDates = await getOrgCoffeeChatDates();
  if (!orgDates.coffeeChatStartDate || !orgDates.applicationDueDate) {
    return {
      allowed: false,
      reason: 'Coffee chat submissions are closed until an admin sets the coffee chat start and due dates.',
    };
  }

  if (
    !isWithinCoffeeChatWindow({
      coffee_chat_start_date: orgDates.coffeeChatStartDate,
      application_due_date: orgDates.applicationDueDate,
    })
  ) {
    return {
      allowed: false,
      reason: 'Coffee chat submissions are closed outside the configured date window.',
    };
  }

  return { allowed: true };
}

export async function listAllCoffeeChats(): Promise<CoffeeChatWithMeta[]> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const result = await db.execute({
    sql: `SELECT cc.*
          FROM coffee_chats cc
          ORDER BY cc.chat_date DESC, cc.created_at DESC`,
  });
  return result.rows.map((row) => rowToCoffeeChatWithMeta(row, now));
}

export async function listMyCoffeeChats(userId: number): Promise<CoffeeChatWithMeta[]> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const result = await db.execute({
    sql: `SELECT cc.*
          FROM coffee_chats cc
          WHERE cc.submitter_id = ?
          ORDER BY cc.chat_date DESC, cc.created_at DESC`,
    args: [userId],
  });
  return result.rows.map((row) => rowToCoffeeChatWithMeta(row, now));
}

export async function getCoffeeChatById(id: number): Promise<CoffeeChat | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM coffee_chats WHERE id = ?',
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return rowToCoffeeChat(result.rows[0]);
}

function validateChatDate(chatDate: string): void {
  if (!isValidIsoDate(chatDate)) {
    throw new Error('Chat date must be a valid YYYY-MM-DD date.');
  }
}

function validateApplicantName(applicantName: string): string {
  const trimmed = applicantName.trim();
  if (!trimmed) {
    throw new Error('Applicant name is required.');
  }
  return trimmed;
}

export async function createCoffeeChat(user: User, input: CoffeeChatInput): Promise<CoffeeChat> {
  if (user.role !== 'admin') {
    const access = await canUserAccessCoffeeChats();
    if (!access.allowed) {
      throw new Error(access.reason ?? 'Forbidden');
    }
  }

  validateChatDate(input.chatDate);
  const applicantName = validateApplicantName(input.applicantName);
  const normalized = normalizeApplicantName(applicantName);
  const applicantEmail = validateApplicantEmail(input.applicantEmail);
  const applicantGradeLevel = validateApplicantGradeLevel(input.applicantGradeLevel);
  const teamsInterested = validateTeamsInterested(input.teamsInterested);

  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO coffee_chats (
            round_id, chat_date, submitter_id, submitter_name,
            applicant_name, applicant_name_normalized, applicant_email,
            applicant_grade_level, teams_interested,
            vibes, green_flags, red_flags, other_comments, conflict_of_interest
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      null,
      input.chatDate,
      user.id,
      user.name,
      applicantName,
      normalized,
      applicantEmail,
      applicantGradeLevel,
      serializeTeamsInterested(teamsInterested),
      input.vibes?.trim() || null,
      input.greenFlags?.trim() || null,
      input.redFlags?.trim() || null,
      input.otherComments?.trim() || null,
      input.conflictOfInterest?.trim() || null,
    ],
  });

  const chat = await getCoffeeChatById(Number(result.lastInsertRowid));
  if (!chat) throw new Error('Failed to create coffee chat.');
  return chat;
}

export async function updateCoffeeChat(
  user: User,
  chatId: number,
  input: CoffeeChatUpdateInput,
): Promise<CoffeeChat> {
  const existing = await getCoffeeChatById(chatId);
  if (!existing) throw new Error('Coffee chat not found.');

  if (existing.submitter_id !== user.id && user.role !== 'admin') {
    throw new Error('You can only edit your own coffee chat submissions.');
  }

  if (user.role !== 'admin') {
    if (!canEditCoffeeChat(existing)) {
      throw new Error('The edit window for this submission has closed (7 days after submit).');
    }

    const windowAccess = await canUserAccessCoffeeChats();
    if (!windowAccess.allowed) {
      throw new Error(windowAccess.reason ?? 'Coffee chat submissions are closed outside the configured date window.');
    }
  }

  const chatDate = input.chatDate ?? existing.chat_date;
  validateChatDate(chatDate);

  const applicantName =
    input.applicantName !== undefined
      ? validateApplicantName(input.applicantName)
      : existing.applicant_name;
  const normalized =
    input.applicantName !== undefined
      ? normalizeApplicantName(applicantName)
      : existing.applicant_name_normalized;
  const applicantEmail =
    input.applicantEmail !== undefined
      ? validateApplicantEmail(input.applicantEmail)
      : existing.applicant_email;
  const applicantGradeLevel =
    input.applicantGradeLevel !== undefined
      ? validateApplicantGradeLevel(input.applicantGradeLevel)
      : existing.applicant_grade_level;
  const teamsInterested =
    input.teamsInterested !== undefined
      ? validateTeamsInterested(input.teamsInterested)
      : existing.teams_interested;

  const db = getDb();
  await db.execute({
    sql: `UPDATE coffee_chats SET
            chat_date = ?,
            applicant_name = ?,
            applicant_name_normalized = ?,
            applicant_email = ?,
            applicant_grade_level = ?,
            teams_interested = ?,
            vibes = ?,
            green_flags = ?,
            red_flags = ?,
            other_comments = ?,
            conflict_of_interest = ?,
            updated_at = unixepoch()
          WHERE id = ?`,
    args: [
      chatDate,
      applicantName,
      normalized,
      applicantEmail,
      applicantGradeLevel,
      serializeTeamsInterested(teamsInterested),
      input.vibes !== undefined ? input.vibes?.trim() || null : existing.vibes,
      input.greenFlags !== undefined ? input.greenFlags?.trim() || null : existing.green_flags,
      input.redFlags !== undefined ? input.redFlags?.trim() || null : existing.red_flags,
      input.otherComments !== undefined ? input.otherComments?.trim() || null : existing.other_comments,
      input.conflictOfInterest !== undefined
        ? input.conflictOfInterest?.trim() || null
        : existing.conflict_of_interest,
      chatId,
    ],
  });

  const updated = await getCoffeeChatById(chatId);
  if (!updated) throw new Error('Failed to update coffee chat.');
  return updated;
}
