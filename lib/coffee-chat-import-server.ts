import 'server-only';

import { getDb } from '@/lib/db';
import {
  normalizeApplicantName,
  serializeTeamsInterested,
  type CoffeeChat,
} from '@/lib/coffee-chats';
import {
  parsedRowToCoffeeChatInput,
  type CoffeeChatImportMatchPreview,
  type ParsedCoffeeChatImportRow,
  type UmaMatchStatus,
} from '@/lib/coffee-chat-import';
import { getCoffeeChatById } from '@/lib/coffee-chats-server';

export interface CandidateMatch {
  id: number;
  name: string;
  email: string;
}

export interface UmaUserMatch {
  id: number;
  name: string;
  email: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePersonName(name: string): string {
  return normalizeApplicantName(name);
}

export async function loadUsersForCoffeeChatMatch(): Promise<UmaUserMatch[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT id, name, email FROM users ORDER BY id ASC',
  });
  return result.rows.map((row) => ({
    id: row.id as number,
    name: row.name as string,
    email: normalizeEmail(row.email as string),
  }));
}

export async function loadCandidatesForCoffeeChatMatch(): Promise<CandidateMatch[]> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT id, name, email FROM candidates ORDER BY id ASC',
  });
  return result.rows.map((row) => ({
    id: row.id as number,
    name: row.name as string,
    email: normalizeEmail(row.email as string),
  }));
}

export function matchUmaUser(
  row: Pick<ParsedCoffeeChatImportRow, 'submitterEmail' | 'submitterName'>,
  users: UmaUserMatch[],
): { status: UmaMatchStatus; user: UmaUserMatch | null; detail: string } {
  if (row.submitterEmail) {
    const email = normalizeEmail(row.submitterEmail);
    const byEmail = users.find((user) => user.email === email);
    if (byEmail) {
      return {
        status: 'matched',
        user: byEmail,
        detail: `Matched ${byEmail.name} (${byEmail.email})`,
      };
    }
    return {
      status: 'unmatched',
      user: null,
      detail: `No user with email ${email}. Add them under Users first.`,
    };
  }

  if (row.submitterName) {
    const target = normalizePersonName(row.submitterName);
    const byName = users.filter((user) => normalizePersonName(user.name) === target);
    if (byName.length === 1) {
      const user = byName[0]!;
      return {
        status: 'matched',
        user,
        detail: `Matched ${user.name} by name (${user.email})`,
      };
    }
    if (byName.length > 1) {
      return {
        status: 'ambiguous',
        user: null,
        detail: `Multiple users named "${row.submitterName}". Map/include their email.`,
      };
    }
    return {
      status: 'unmatched',
      user: null,
      detail: `No user named "${row.submitterName}". Add them under Users or include their email.`,
    };
  }

  return {
    status: 'unmatched',
    user: null,
    detail: 'Missing UMA member email/name.',
  };
}

export function matchApplicantCandidate(
  row: Pick<ParsedCoffeeChatImportRow, 'applicantEmail' | 'applicantName' | 'applicantNameNormalized'>,
  candidates: CandidateMatch[],
): { status: 'matched' | 'unmatched'; candidate: CandidateMatch | null; detail: string } {
  const email = normalizeEmail(row.applicantEmail);
  const byEmail = candidates.find((candidate) => candidate.email === email);
  if (byEmail) {
    return {
      status: 'matched',
      candidate: byEmail,
      detail: `Matched ${byEmail.name}`,
    };
  }

  const byName = candidates.filter(
    (candidate) => normalizePersonName(candidate.name) === row.applicantNameNormalized,
  );
  if (byName.length === 1) {
    const candidate = byName[0]!;
    return {
      status: 'matched',
      candidate,
      detail: `Matched ${candidate.name} by name (emails differ)`,
    };
  }

  return {
    status: 'unmatched',
    candidate: null,
    detail: 'Not in applicants yet — will still import; matches when applications are uploaded.',
  };
}

async function existingCoffeeChatKeySet(): Promise<Set<string>> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT submitter_id, applicant_email, chat_date
          FROM coffee_chats
          WHERE applicant_email IS NOT NULL`,
  });
  const keys = new Set<string>();
  for (const row of result.rows) {
    const email = normalizeEmail((row.applicant_email as string) ?? '');
    keys.add(`${row.submitter_id as number}|${email}|${row.chat_date as string}`);
  }
  return keys;
}

function importDedupeKey(
  submitterId: number,
  applicantEmail: string,
  chatDate: string,
): string {
  return `${submitterId}|${normalizeEmail(applicantEmail)}|${chatDate}`;
}

export async function previewCoffeeChatImport(
  rows: ParsedCoffeeChatImportRow[],
): Promise<CoffeeChatImportMatchPreview[]> {
  const [users, candidates, existing] = await Promise.all([
    loadUsersForCoffeeChatMatch(),
    loadCandidatesForCoffeeChatMatch(),
    existingCoffeeChatKeySet(),
  ]);

  return rows.map((row) => {
    const uma = matchUmaUser(row, users);
    const applicant = matchApplicantCandidate(row, candidates);

    let willImport = uma.status === 'matched' && Boolean(uma.user);
    let skipReason: string | null = null;

    if (!willImport) {
      skipReason =
        uma.status === 'ambiguous'
          ? 'Ambiguous UMA member match'
          : 'UMA member not found in Users';
    } else if (uma.user) {
      const key = importDedupeKey(uma.user.id, row.applicantEmail, row.chatDate);
      if (existing.has(key)) {
        willImport = false;
        skipReason = 'Already imported (same member, applicant email, and date)';
      }
    }

    return {
      rowIndex: row.rowIndex,
      chatDate: row.chatDate,
      applicantName: row.applicantName,
      applicantEmail: row.applicantEmail,
      submitterEmail: row.submitterEmail,
      submitterName: row.submitterName,
      uma: {
        status: uma.status,
        userId: uma.user?.id ?? null,
        userName: uma.user?.name ?? null,
        detail: uma.detail,
      },
      applicant: {
        status: applicant.status,
        candidateId: applicant.candidate?.id ?? null,
        candidateName: applicant.candidate?.name ?? null,
        detail: applicant.detail,
      },
      willImport,
      skipReason,
    };
  });
}

export interface CoffeeChatImportResult {
  imported: number;
  skipped: number;
  failed: number;
  previews: CoffeeChatImportMatchPreview[];
  errors: Array<{ rowIndex: number; message: string }>;
}

/**
 * Import coffee chat rows as the matched UMA member (submitter_id),
 * not as the admin running the upload.
 */
export async function importCoffeeChatsAsMatchedUsers(
  rows: ParsedCoffeeChatImportRow[],
  options?: { dryRun?: boolean },
): Promise<CoffeeChatImportResult> {
  const dryRun = options?.dryRun === true;
  const previews = await previewCoffeeChatImport(rows);
  const previewByRow = new Map(previews.map((preview) => [preview.rowIndex, preview]));

  const errors: Array<{ rowIndex: number; message: string }> = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  if (dryRun) {
    for (const preview of previews) {
      if (preview.willImport) imported += 1;
      else skipped += 1;
    }
    return { imported, skipped, failed, previews, errors };
  }

  const users = await loadUsersForCoffeeChatMatch();
  const existing = await existingCoffeeChatKeySet();

  for (const row of rows) {
    const preview = previewByRow.get(row.rowIndex);
    if (!preview?.willImport || !preview.uma.userId) {
      skipped += 1;
      continue;
    }

    const user = users.find((u) => u.id === preview.uma.userId);
    if (!user) {
      failed += 1;
      errors.push({ rowIndex: row.rowIndex, message: 'Matched UMA user disappeared before insert.' });
      continue;
    }

    const key = importDedupeKey(user.id, row.applicantEmail, row.chatDate);
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }

    try {
      // Bypass window checks — admin sheet import is allowed anytime.
      await insertCoffeeChatForSubmitter(user, row);
      existing.add(key);
      imported += 1;
    } catch (e) {
      failed += 1;
      errors.push({
        rowIndex: row.rowIndex,
        message: e instanceof Error ? e.message : 'Failed to import row.',
      });
    }
  }

  return { imported, skipped, failed, previews, errors };
}

async function insertCoffeeChatForSubmitter(
  submitter: UmaUserMatch,
  row: ParsedCoffeeChatImportRow,
): Promise<CoffeeChat> {
  const input = parsedRowToCoffeeChatInput(row);
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
      submitter.id,
      submitter.name,
      input.applicantName.trim(),
      normalizeApplicantName(input.applicantName),
      input.applicantEmail,
      input.applicantGradeLevel,
      serializeTeamsInterested(input.teamsInterested),
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

/** Enrich admin list rows with live applicant match info. */
export async function matchStatusForCoffeeChats(
  chats: Array<{ applicant_email: string | null; applicant_name: string; applicant_name_normalized: string }>,
): Promise<
  Array<{
    status: 'matched' | 'unmatched';
    candidateId: number | null;
    candidateName: string | null;
    detail: string;
  }>
> {
  const candidates = await loadCandidatesForCoffeeChatMatch();
  return chats.map((chat) => {
    const match = matchApplicantCandidate(
      {
        applicantEmail: chat.applicant_email ?? '',
        applicantName: chat.applicant_name,
        applicantNameNormalized: chat.applicant_name_normalized,
      },
      candidates,
    );
    return {
      status: match.status,
      candidateId: match.candidate?.id ?? null,
      candidateName: match.candidate?.name ?? null,
      detail: match.detail,
    };
  });
}
