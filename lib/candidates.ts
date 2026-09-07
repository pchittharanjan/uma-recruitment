import { normalizeHeaderText } from '@/lib/rubric';

const EMAIL_HEADER_PATTERNS: RegExp[] = [
  /^email address$/,
  /^email$/,
  /berkeley email/,
  /^e-mail$/,
  /email address/,
  /\bemail\b/,
];

const FIRST_NAME_PATTERNS: RegExp[] = [/^first name$/, /^given name$/];
const LAST_NAME_PATTERNS: RegExp[] = [/^last name$/, /^family name$/, /^surname$/];
const FULL_NAME_PATTERNS: RegExp[] = [/^full name$/, /^name$/, /^preferred name$/];
const GRADE_PATTERNS: RegExp[] = [
  /^year$/,
  /^grade$/,
  /^class$/,
  /^class standing$/,
  /^graduation year$/,
];

/** Match Google Form / CSV phone columns (same idea as rubric + application display hide rules). */
const PHONE_PATTERNS: RegExp[] = [/^phone/, /phone number/];

function findFieldByPatterns(
  fields: Record<string, string>,
  patterns: RegExp[],
): string {
  for (const [key, raw] of Object.entries(fields)) {
    const normalized = normalizeHeaderText(key);
    if (!patterns.some((pattern) => pattern.test(normalized))) continue;
    const value = raw?.trim() ?? '';
    if (value) return value;
  }
  return '';
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isPlaceholderCandidateEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith('@unknown.local');
}

/** Extract applicant email from application fields (header pattern match). */
export function findEmailInFields(fields: Record<string, string>): string {
  const matches: Array<{
    email: string;
    isBerkeley: boolean;
    isBerkeleyHeader: boolean;
  }> = [];

  for (const [key, raw] of Object.entries(fields)) {
    const normalized = normalizeHeaderText(key);
    if (!EMAIL_HEADER_PATTERNS.some((pattern) => pattern.test(normalized))) continue;

    const value = raw?.trim().toLowerCase() ?? '';
    if (!value || !looksLikeEmail(value)) continue;

    matches.push({
      email: value,
      isBerkeley: value.endsWith('@berkeley.edu'),
      isBerkeleyHeader: /berkeley email/.test(normalized),
    });
  }

  const berkeleyFromHeader = matches.find((m) => m.isBerkeleyHeader && m.isBerkeley);
  if (berkeleyFromHeader) return berkeleyFromHeader.email;

  const berkeley = matches.find((m) => m.isBerkeley);
  if (berkeley) return berkeley.email;

  if (matches[0]?.email) return matches[0].email;

  // Last resort: any @berkeley.edu cell when the header wasn't labeled as email.
  for (const raw of Object.values(fields)) {
    const value = raw?.trim().toLowerCase() ?? '';
    if (value.endsWith('@berkeley.edu') && looksLikeEmail(value)) return value;
  }

  return '';
}

/** Prefer real email from application fields over placeholder candidates.email. */
export function resolveApplicantEmail(
  fields: Record<string, string>,
  candidateEmail: string | null | undefined,
): string {
  const fromFields = findEmailInFields(fields);
  if (fromFields) return fromFields;

  const stored = (candidateEmail ?? '').trim().toLowerCase();
  if (stored && !isPlaceholderCandidateEmail(stored)) return stored;

  return stored;
}

/** Extract class year / grade from application fields (e.g. "Year" → "Class of 2029"). */
export function findGradeInFields(fields: Record<string, string>): string {
  return findFieldByPatterns(fields, GRADE_PATTERNS);
}

/** Extract phone from application fields (e.g. "Phone Number", "Phone"). */
export function findPhoneInFields(fields: Record<string, string>): string {
  return findFieldByPatterns(fields, PHONE_PATTERNS);
}

export function extractCandidateFromFields(
  fields: Record<string, string>,
  options?: { /** Disambiguates synthetic emails when the sheet has no email column. */ uniqueKey?: string | number },
): { name: string; email: string } {
  const first = findFieldByPatterns(fields, FIRST_NAME_PATTERNS);
  const last = findFieldByPatterns(fields, LAST_NAME_PATTERNS);
  const full = findFieldByPatterns(fields, FULL_NAME_PATTERNS);
  const email = findEmailInFields(fields);

  let name = full;
  if (!name && first) name = last ? `${first} ${last}` : first;
  if (!name && email) name = email.split('@')[0] ?? 'Unknown';
  if (!name) name = 'Unknown';

  const slug = name.toLowerCase().replace(/\s+/g, '.');
  const suffix =
    options?.uniqueKey != null ? `.${String(options.uniqueKey)}` : '';
  const resolvedEmail = email || `${slug}${suffix}@unknown.local`;

  return { name, email: resolvedEmail };
}

export type CandidateRowRef = {
  fields: Record<string, string>;
  /** 0-based index in the original spreadsheet body (not counting the header). */
  sourceIndex?: number;
};

export type DuplicateCandidateEmail = {
  email: string;
  appearances: Array<{ sheetRow: number; name: string }>;
};

/**
 * Find emails that appear more than once in a row set (same person / colliding
 * Berkeley emails). Sheet row is 1-based including the header (Excel-style).
 */
export function findDuplicateCandidateEmails(
  rows: CandidateRowRef[],
): DuplicateCandidateEmail[] {
  const byEmail = new Map<string, Array<{ sheetRow: number; name: string }>>();
  for (let i = 0; i < rows.length; i++) {
    const { fields, sourceIndex } = rows[i];
    const { name, email } = extractCandidateFromFields(fields);
    if (isPlaceholderCandidateEmail(email)) continue;
    const key = email.trim().toLowerCase();
    const sheetRow = (sourceIndex ?? i) + 2;
    const list = byEmail.get(key) ?? [];
    list.push({ sheetRow, name });
    byEmail.set(key, list);
  }
  return [...byEmail.entries()]
    .filter(([, appearances]) => appearances.length > 1)
    .map(([email, appearances]) => ({ email, appearances }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export function formatDuplicateCandidateEmailError(
  duplicates: DuplicateCandidateEmail[],
  options?: { teamName?: string },
): string {
  const shown = duplicates.slice(0, 8).map((d) => {
    const who = d.appearances
      .map((a) => `${a.name || 'Unknown'} (sheet row ${a.sheetRow})`)
      .join(', ');
    return `${d.email} — ${who}`;
  });
  const more =
    duplicates.length > 8 ? ` (+${duplicates.length - 8} more)` : '';
  const scope = options?.teamName
    ? `${options.teamName} has duplicate applicants`
    : 'Duplicate applicants in the spreadsheet';
  return `${scope}: ${shown.join('; ')}${more}. Import uses Berkeley Email when present — each person needs a unique email. Fix those rows, then import again.`;
}

export function isApplicationsUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed:\s*applications\.(candidate_id|round_id|team_id)/i.test(
    message,
  );
}
