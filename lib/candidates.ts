import { normalizeHeaderText } from '@/lib/rubric';

const EMAIL_HEADER_PATTERNS: RegExp[] = [
  /^email address$/,
  /^email$/,
  /berkeley email/,
  /^e-mail$/,
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

  return matches[0]?.email ?? '';
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

export function extractCandidateFromFields(
  fields: Record<string, string>,
): { name: string; email: string } {
  const first = findFieldByPatterns(fields, FIRST_NAME_PATTERNS);
  const last = findFieldByPatterns(fields, LAST_NAME_PATTERNS);
  const full = findFieldByPatterns(fields, FULL_NAME_PATTERNS);
  const email = findEmailInFields(fields);

  let name = full;
  if (!name && first) name = last ? `${first} ${last}` : first;
  if (!name && email) name = email.split('@')[0] ?? 'Unknown';
  if (!name) name = 'Unknown';

  const resolvedEmail =
    email || `${name.toLowerCase().replace(/\s+/g, '.')}@unknown.local`;

  return { name, email: resolvedEmail };
}
