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
  type CoffeeChatImportPersonOption,
  type CoffeeChatImportResolution,
  type MatchConfidence,
  type ParsedCoffeeChatImportRow,
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

function toPersonOption(person: { id: number; name: string; email: string }): CoffeeChatImportPersonOption {
  return { id: person.id, name: person.name, email: person.email };
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

export interface UmaMatchResult {
  status: CoffeeChatImportMatchPreview['uma']['status'];
  confidence: MatchConfidence;
  user: UmaUserMatch | null;
  detail: string;
  options: CoffeeChatImportPersonOption[];
}

/**
 * Conservative UMA matching:
 * - exact email → high confidence suggestion
 * - email miss / name-only unique → needs_review suggestion (never silent commit)
 * - multiple names → ambiguous
 * - nothing → unmatched
 */
export function matchUmaUser(
  row: Pick<ParsedCoffeeChatImportRow, 'submitterEmail' | 'submitterName'>,
  users: UmaUserMatch[],
): UmaMatchResult {
  if (row.submitterEmail) {
    const email = normalizeEmail(row.submitterEmail);
    const byEmail = users.find((user) => user.email === email);
    if (byEmail) {
      return {
        status: 'matched',
        confidence: 'exact_email',
        user: byEmail,
        detail: `Exact email: ${byEmail.name} (${byEmail.email})`,
        options: [],
      };
    }

    // Email missed — fall through to exact normalized name (e.g. gmail → berkeley user).
    if (row.submitterName) {
      const nameMatch = matchByExactName(row.submitterName, users);
      if (nameMatch.kind === 'unique') {
        return {
          status: 'needs_review',
          confidence: 'unique_name',
          user: nameMatch.person,
          detail: `Email ${email} not found; suggested ${nameMatch.person.name} by name (${nameMatch.person.email}) — confirm before import`,
          options: [],
        };
      }
      if (nameMatch.kind === 'ambiguous') {
        return {
          status: 'ambiguous',
          confidence: 'ambiguous',
          user: null,
          detail: `Email ${email} not found; multiple users named "${row.submitterName}". Pick one or skip.`,
          options: nameMatch.people.map(toPersonOption),
        };
      }
    }

    return {
      status: 'unmatched',
      confidence: 'unmatched',
      user: null,
      detail: `No user with email ${email}. Pick a member or skip.`,
      options: [],
    };
  }

  if (row.submitterName) {
    const nameMatch = matchByExactName(row.submitterName, users);
    if (nameMatch.kind === 'unique') {
      return {
        status: 'needs_review',
        confidence: 'unique_name',
        user: nameMatch.person,
        detail: `Suggested ${nameMatch.person.name} by name (${nameMatch.person.email}) — confirm before import`,
        options: [],
      };
    }
    if (nameMatch.kind === 'ambiguous') {
      return {
        status: 'ambiguous',
        confidence: 'ambiguous',
        user: null,
        detail: `Multiple users named "${row.submitterName}". Pick one or skip.`,
        options: nameMatch.people.map(toPersonOption),
      };
    }
    return {
      status: 'unmatched',
      confidence: 'unmatched',
      user: null,
      detail: `No user named "${row.submitterName}". Pick a member or skip.`,
      options: [],
    };
  }

  return {
    status: 'unmatched',
    confidence: 'unmatched',
    user: null,
    detail: 'Missing UMA member email/name.',
    options: [],
  };
}

type ExactNameMatch<T> =
  | { kind: 'unique'; person: T }
  | { kind: 'ambiguous'; people: T[] }
  | { kind: 'none' };

function matchByExactName<T extends { name: string }>(
  rawName: string,
  people: T[],
): ExactNameMatch<T> {
  const target = normalizePersonName(rawName);
  if (!target) return { kind: 'none' };
  const hits = people.filter((person) => normalizePersonName(person.name) === target);
  if (hits.length === 1) return { kind: 'unique', person: hits[0]! };
  if (hits.length > 1) return { kind: 'ambiguous', people: hits };
  return { kind: 'none' };
}

export interface ApplicantMatchResult {
  status: CoffeeChatImportMatchPreview['applicant']['status'];
  confidence: MatchConfidence;
  candidate: CandidateMatch | null;
  detail: string;
  options: CoffeeChatImportPersonOption[];
}

/**
 * Conservative applicant matching — same tiers as UMA.
 * Unmatched is OK (candidate_id stays null); never invent a candidate.
 */
export function matchApplicantCandidate(
  row: Pick<ParsedCoffeeChatImportRow, 'applicantEmail' | 'applicantName' | 'applicantNameNormalized'>,
  candidates: CandidateMatch[],
): ApplicantMatchResult {
  const email = normalizeEmail(row.applicantEmail);
  if (email) {
    const byEmail = candidates.find((candidate) => candidate.email === email);
    if (byEmail) {
      return {
        status: 'matched',
        confidence: 'exact_email',
        candidate: byEmail,
        detail: `Exact email: ${byEmail.name}`,
        options: [],
      };
    }
  }

  const byName = candidates.filter(
    (candidate) => normalizePersonName(candidate.name) === row.applicantNameNormalized,
  );
  if (byName.length === 1) {
    const candidate = byName[0]!;
    return {
      status: 'needs_review',
      confidence: 'unique_name',
      candidate,
      detail: email
        ? `Email not in applicants; suggested ${candidate.name} by name — confirm to link`
        : `Suggested ${candidate.name} by name — confirm to link`,
      options: [],
    };
  }
  if (byName.length > 1) {
    return {
      status: 'ambiguous',
      confidence: 'ambiguous',
      candidate: null,
      detail: `Multiple applicants named "${row.applicantName}". Pick one or leave unlinked.`,
      options: byName.map(toPersonOption),
    };
  }

  return {
    status: 'unmatched',
    confidence: 'unmatched',
    candidate: null,
    detail: 'Not in applicants yet — can import unlinked; matches later via soft email/name.',
    options: [],
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

    let isDuplicate = false;
    let skipReason: string | null = null;

    if (uma.user) {
      const key = importDedupeKey(uma.user.id, row.applicantEmail, row.chatDate);
      if (existing.has(key)) {
        isDuplicate = true;
        skipReason = 'Already imported (same member, applicant email, and date)';
      }
    }

    const exactEmailReady =
      !isDuplicate && uma.confidence === 'exact_email' && uma.user != null;

    return {
      rowIndex: row.rowIndex,
      chatDate: row.chatDate,
      applicantName: row.applicantName,
      applicantEmail: row.applicantEmail,
      submitterEmail: row.submitterEmail,
      submitterName: row.submitterName,
      uma: {
        status: uma.status,
        confidence: uma.confidence,
        userId: uma.user?.id ?? null,
        userName: uma.user?.name ?? null,
        detail: uma.detail,
        options: uma.options,
      },
      applicant: {
        status: applicant.status,
        confidence: applicant.confidence,
        candidateId: applicant.candidate?.id ?? null,
        candidateName: applicant.candidate?.name ?? null,
        detail: applicant.detail,
        options: applicant.options,
      },
      exactEmailReady,
      isDuplicate,
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
  matchOptions: {
    users: CoffeeChatImportPersonOption[];
    candidates: CoffeeChatImportPersonOption[];
  };
}

function validateResolutionsCoverRows(
  rows: ParsedCoffeeChatImportRow[],
  resolutions: CoffeeChatImportResolution[],
): string | null {
  const byRow = new Map(resolutions.map((r) => [r.rowIndex, r]));
  for (const row of rows) {
    if (!byRow.has(row.rowIndex)) {
      return `Missing resolution for spreadsheet row ${row.rowIndex}.`;
    }
  }
  return null;
}

/**
 * Import coffee chat rows using explicit admin resolutions — never silent re-match.
 */
export async function importCoffeeChatsAsMatchedUsers(
  rows: ParsedCoffeeChatImportRow[],
  options?: { dryRun?: boolean; resolutions?: CoffeeChatImportResolution[] },
): Promise<CoffeeChatImportResult> {
  const dryRun = options?.dryRun === true;
  const previews = await previewCoffeeChatImport(rows);
  const [users, candidates] = await Promise.all([
    loadUsersForCoffeeChatMatch(),
    loadCandidatesForCoffeeChatMatch(),
  ]);

  const matchOptions = {
    users: users.map(toPersonOption),
    candidates: candidates.map(toPersonOption),
  };

  const errors: Array<{ rowIndex: number; message: string }> = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  if (dryRun) {
    for (const preview of previews) {
      if (preview.isDuplicate) skipped += 1;
      else if (preview.exactEmailReady) imported += 1; // would be importable after confirm
      else skipped += 1;
    }
    return { imported, skipped, failed, previews, errors, matchOptions };
  }

  const resolutions = options?.resolutions ?? [];
  const coverError = validateResolutionsCoverRows(rows, resolutions);
  if (coverError) {
    return {
      imported: 0,
      skipped: 0,
      failed: rows.length,
      previews,
      errors: [{ rowIndex: 0, message: coverError }],
      matchOptions,
    };
  }

  const resolutionByRow = new Map(resolutions.map((r) => [r.rowIndex, r]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const existing = await existingCoffeeChatKeySet();

  for (const row of rows) {
    const resolution = resolutionByRow.get(row.rowIndex)!;

    if (resolution.skip) {
      skipped += 1;
      continue;
    }

    if (resolution.userId == null) {
      failed += 1;
      errors.push({
        rowIndex: row.rowIndex,
        message: 'Each non-skipped row must include an explicit userId.',
      });
      continue;
    }

    const user = userById.get(resolution.userId);
    if (!user) {
      failed += 1;
      errors.push({
        rowIndex: row.rowIndex,
        message: `UMA user id ${resolution.userId} not found.`,
      });
      continue;
    }

    let candidateId: number | null = null;
    if (resolution.candidateId != null) {
      const candidate = candidateById.get(resolution.candidateId);
      if (!candidate) {
        failed += 1;
        errors.push({
          rowIndex: row.rowIndex,
          message: `Candidate id ${resolution.candidateId} not found.`,
        });
        continue;
      }
      candidateId = candidate.id;
    }

    const key = importDedupeKey(user.id, row.applicantEmail, row.chatDate);
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }

    try {
      await insertCoffeeChatForSubmitter(user, row, candidateId);
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

  return { imported, skipped, failed, previews, errors, matchOptions };
}

async function insertCoffeeChatForSubmitter(
  submitter: UmaUserMatch,
  row: ParsedCoffeeChatImportRow,
  candidateId: number | null,
): Promise<CoffeeChat> {
  const input = parsedRowToCoffeeChatInput(row);
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO coffee_chats (
            round_id, chat_date, submitter_id, submitter_name,
            applicant_name, applicant_name_normalized, applicant_email,
            applicant_grade_level, teams_interested, candidate_id,
            vibes, green_flags, red_flags, other_comments, conflict_of_interest
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      candidateId,
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

/** Enrich admin list rows with live applicant match info (FK preferred). */
export async function matchStatusForCoffeeChats(
  chats: Array<{
    candidate_id?: number | null;
    applicant_email: string | null;
    applicant_name: string;
    applicant_name_normalized: string;
  }>,
): Promise<
  Array<{
    status: 'matched' | 'unmatched';
    candidateId: number | null;
    candidateName: string | null;
    detail: string;
  }>
> {
  const candidates = await loadCandidatesForCoffeeChatMatch();
  const byId = new Map(candidates.map((c) => [c.id, c]));

  return chats.map((chat) => {
    if (chat.candidate_id != null) {
      const linked = byId.get(chat.candidate_id);
      if (linked) {
        return {
          status: 'matched' as const,
          candidateId: linked.id,
          candidateName: linked.name,
          detail: `Linked to ${linked.name}`,
        };
      }
    }

    const match = matchApplicantCandidate(
      {
        applicantEmail: chat.applicant_email ?? '',
        applicantName: chat.applicant_name,
        applicantNameNormalized: chat.applicant_name_normalized,
      },
      candidates,
    );

    // Soft-match display only — do not treat unique_name as a committed link.
    if (match.confidence === 'exact_email' && match.candidate) {
      return {
        status: 'matched' as const,
        candidateId: match.candidate.id,
        candidateName: match.candidate.name,
        detail: match.detail,
      };
    }

    return {
      status: 'unmatched' as const,
      candidateId: null,
      candidateName: null,
      detail: match.detail,
    };
  });
}
