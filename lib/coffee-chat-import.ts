import { normalizeHeaderText } from '@/lib/rubric';
import {
  COFFEE_CHAT_GRADE_LEVELS,
  COFFEE_CHAT_TEAM_OPTIONS,
  normalizeApplicantName,
  type CoffeeChatGradeLevel,
  type CoffeeChatInput,
} from '@/lib/coffee-chats';
import type { TeamName } from '@/lib/db';

/** Spreadsheet columns we can map from a Google Form responses export. */
export const COFFEE_CHAT_IMPORT_FIELDS = [
  'submitterEmail',
  'submitterName',
  'chatDate',
  'applicantName',
  'applicantEmail',
  'applicantGradeLevel',
  'teamsInterested',
  'vibes',
  'greenFlags',
  'redFlags',
  'otherComments',
  'conflictOfInterest',
] as const;

export type CoffeeChatImportField = (typeof COFFEE_CHAT_IMPORT_FIELDS)[number];

export type CoffeeChatColumnMap = Partial<Record<CoffeeChatImportField, string>>;

export const COFFEE_CHAT_IMPORT_FIELD_LABELS: Record<CoffeeChatImportField, string> = {
  submitterEmail: 'UMA member email',
  submitterName: 'UMA member name',
  chatDate: 'Chat date',
  applicantName: 'Applicant name',
  applicantEmail: 'Applicant email',
  applicantGradeLevel: 'Applicant grade level',
  teamsInterested: 'Teams interested',
  vibes: 'General thoughts / vibes',
  greenFlags: 'Green flags',
  redFlags: 'Red flags',
  otherComments: 'Other comments',
  conflictOfInterest: 'Conflict of interest',
};

const REQUIRED_IMPORT_FIELDS: CoffeeChatImportField[] = [
  'chatDate',
  'applicantName',
  'applicantEmail',
  'applicantGradeLevel',
  'teamsInterested',
  'vibes',
];

/** At least one of these must be mapped so we can match the UMA person. */
const SUBMITTER_FIELDS: CoffeeChatImportField[] = ['submitterEmail', 'submitterName'];

const FIELD_HEADER_PATTERNS: Record<CoffeeChatImportField, RegExp[]> = {
  submitterEmail: [
    /^email address$/,
    /^email$/,
    /^your email$/,
    /^uma (member )?email$/,
    /^submitter email$/,
    /^member email$/,
  ],
  submitterName: [
    /^your name$/,
    /^uma (member )?name$/,
    /^submitter name$/,
    /^member name$/,
    /^your full name$/,
  ],
  chatDate: [
    /^timestamp$/,
    /^chat date$/,
    /^date of (the )?coffee chat$/,
    /^coffee chat date$/,
    /^date$/,
    /^when did you (have|meet)/,
  ],
  applicantName: [
    /^applicant('s)? name$/,
    /^candidate('s)? name$/,
    /^full name of (the )?applicant$/,
    /^name of (the )?applicant$/,
    /^who did you (coffee )?chat with$/,
  ],
  applicantEmail: [
    /^applicant('s)? email$/,
    /^candidate('s)? email$/,
    /^applicant('s)? berkeley email$/,
    /^candidate('s)? berkeley email$/,
  ],
  applicantGradeLevel: [
    /^applicant('s)? (grade|year|class)/,
    /^grade level$/,
    /^year$/,
    /^class standing$/,
  ],
  teamsInterested: [
    /^teams? interested$/,
    /^team interest/,
    /^which teams?/,
    /^interested teams?$/,
  ],
  vibes: [
    /^general thoughts/,
    /^vibes$/,
    /^thoughts and vibes$/,
    /^overall (impression|vibes)/,
  ],
  greenFlags: [/^green flags?$/],
  redFlags: [/^red flags?$/],
  otherComments: [/^other comments?$/, /^additional comments?$/, /^anything else/],
  conflictOfInterest: [/^conflict of interest$/, /^any conflict/],
};

export function suggestCoffeeChatColumnMap(headers: string[]): CoffeeChatColumnMap {
  const map: CoffeeChatColumnMap = {};
  const used = new Set<string>();

  for (const field of COFFEE_CHAT_IMPORT_FIELDS) {
    const patterns = FIELD_HEADER_PATTERNS[field];
    const match = headers.find((header) => {
      if (used.has(header)) return false;
      const normalized = normalizeHeaderText(header);
      return patterns.some((pattern) => pattern.test(normalized));
    });
    if (match) {
      map[field] = match;
      used.add(match);
    }
  }

  // Prefer a dedicated applicant email over Google's collect-email "Email Address"
  // when both look like emails — if applicantEmail wasn't found, leave submitterEmail
  // on "Email Address" (typical Google Form export for the respondent).
  if (!map.applicantEmail && map.submitterEmail) {
    const submitterHeader = map.submitterEmail;
    const normalized = normalizeHeaderText(submitterHeader);
    if (/applicant|candidate/.test(normalized)) {
      map.applicantEmail = submitterHeader;
      delete map.submitterEmail;
    }
  }

  return map;
}

export function validateCoffeeChatColumnMap(
  map: CoffeeChatColumnMap,
  headers: string[],
): string | null {
  const headerSet = new Set(headers);
  for (const [field, header] of Object.entries(map) as Array<[CoffeeChatImportField, string]>) {
    if (!header) continue;
    if (!headerSet.has(header)) {
      return `Mapped column "${header}" for ${COFFEE_CHAT_IMPORT_FIELD_LABELS[field]} is not in the file.`;
    }
  }

  for (const field of REQUIRED_IMPORT_FIELDS) {
    if (!map[field]?.trim()) {
      return `Map a column for ${COFFEE_CHAT_IMPORT_FIELD_LABELS[field]}.`;
    }
  }

  const hasSubmitter = SUBMITTER_FIELDS.some((field) => Boolean(map[field]?.trim()));
  if (!hasSubmitter) {
    return 'Map UMA member email or name so we can match the person who submitted the form.';
  }

  return null;
}

function cell(row: Record<string, string>, header: string | undefined): string {
  if (!header) return '';
  return (row[header] ?? '').trim();
}

/** Parse Google Form / Sheets date values into YYYY-MM-DD when possible. */
export function parseImportChatDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1]!;

  // M/D/YYYY or M/D/YYYY H:MM:SS (common Sheets export)
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const month = us[1]!.padStart(2, '0');
    const day = us[2]!.padStart(2, '0');
    return `${us[3]}-${month}-${day}`;
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  return null;
}

function parseTeamsInterestedCell(raw: string): TeamName[] {
  if (!raw.trim()) return [];
  const parts = raw
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);

  const teams: TeamName[] = [];
  for (const part of parts) {
    const match = COFFEE_CHAT_TEAM_OPTIONS.find(
      (team) => team.toLowerCase() === part.toLowerCase(),
    );
    if (match && !teams.includes(match)) teams.push(match);
  }
  return teams;
}

function parseGradeLevelCell(raw: string): CoffeeChatGradeLevel | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const exact = COFFEE_CHAT_GRADE_LEVELS.find(
    (level) => level.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exact) return exact;

  const normalized = normalizeHeaderText(trimmed);
  const fuzzy = COFFEE_CHAT_GRADE_LEVELS.find((level) => {
    const levelNorm = normalizeHeaderText(level);
    return levelNorm === normalized || levelNorm.includes(normalized) || normalized.includes(levelNorm);
  });
  return fuzzy ?? null;
}

function normalizeEmailLoose(value: string): string {
  return value.trim().toLowerCase();
}

export interface ParsedCoffeeChatImportRow {
  rowIndex: number;
  chatDate: string;
  applicantName: string;
  applicantNameNormalized: string;
  applicantEmail: string;
  applicantGradeLevel: CoffeeChatGradeLevel;
  teamsInterested: TeamName[];
  vibes: string;
  greenFlags: string | null;
  redFlags: string | null;
  otherComments: string | null;
  conflictOfInterest: string | null;
  submitterEmail: string | null;
  submitterName: string | null;
}

export interface CoffeeChatImportRowError {
  rowIndex: number;
  message: string;
}

export function parseCoffeeChatImportRows(
  rows: Record<string, string>[],
  columnMap: CoffeeChatColumnMap,
): { parsed: ParsedCoffeeChatImportRow[]; errors: CoffeeChatImportRowError[] } {
  const parsed: ParsedCoffeeChatImportRow[] = [];
  const errors: CoffeeChatImportRowError[] = [];

  rows.forEach((row, index) => {
    const rowIndex = index + 2; // header is row 1
    const applicantName = cell(row, columnMap.applicantName);
    const applicantEmailRaw = cell(row, columnMap.applicantEmail);
    const chatDateRaw = cell(row, columnMap.chatDate);
    const gradeRaw = cell(row, columnMap.applicantGradeLevel);
    const teamsRaw = cell(row, columnMap.teamsInterested);
    const vibes = cell(row, columnMap.vibes);
    const submitterEmailRaw = cell(row, columnMap.submitterEmail);
    const submitterName = cell(row, columnMap.submitterName) || null;

    const isBlank =
      !applicantName &&
      !applicantEmailRaw &&
      !chatDateRaw &&
      !gradeRaw &&
      !teamsRaw &&
      !vibes &&
      !submitterEmailRaw &&
      !submitterName;
    if (isBlank) return;

    const chatDate = parseImportChatDate(chatDateRaw);
    if (!chatDate) {
      errors.push({ rowIndex, message: `Invalid chat date "${chatDateRaw}".` });
      return;
    }
    if (!applicantName) {
      errors.push({ rowIndex, message: 'Applicant name is required.' });
      return;
    }

    const applicantEmail = normalizeEmailLoose(applicantEmailRaw);
    if (!applicantEmail || !applicantEmail.includes('@')) {
      errors.push({ rowIndex, message: 'Applicant email is required.' });
      return;
    }
    if (!applicantEmail.endsWith('@berkeley.edu')) {
      errors.push({
        rowIndex,
        message: `Applicant email must be @berkeley.edu (got ${applicantEmail}).`,
      });
      return;
    }

    const applicantGradeLevel = parseGradeLevelCell(gradeRaw);
    if (!applicantGradeLevel) {
      errors.push({
        rowIndex,
        message: `Unrecognized grade level "${gradeRaw}".`,
      });
      return;
    }

    const teamsInterested = parseTeamsInterestedCell(teamsRaw);
    if (teamsInterested.length === 0) {
      errors.push({
        rowIndex,
        message: `Could not parse teams interested from "${teamsRaw}".`,
      });
      return;
    }

    if (!vibes) {
      errors.push({ rowIndex, message: 'General thoughts / vibes is required.' });
      return;
    }

    const submitterEmail = submitterEmailRaw ? normalizeEmailLoose(submitterEmailRaw) : null;
    if (!submitterEmail && !submitterName) {
      errors.push({
        rowIndex,
        message: 'UMA member email or name is required.',
      });
      return;
    }
    if (submitterEmail && !submitterEmail.includes('@')) {
      errors.push({ rowIndex, message: `Invalid UMA member email "${submitterEmailRaw}".` });
      return;
    }

    parsed.push({
      rowIndex,
      chatDate,
      applicantName,
      applicantNameNormalized: normalizeApplicantName(applicantName),
      applicantEmail,
      applicantGradeLevel,
      teamsInterested,
      vibes,
      greenFlags: cell(row, columnMap.greenFlags) || null,
      redFlags: cell(row, columnMap.redFlags) || null,
      otherComments: cell(row, columnMap.otherComments) || null,
      conflictOfInterest: cell(row, columnMap.conflictOfInterest) || null,
      submitterEmail,
      submitterName,
    });
  });

  return { parsed, errors };
}

export function parsedRowToCoffeeChatInput(row: ParsedCoffeeChatImportRow): CoffeeChatInput {
  return {
    chatDate: row.chatDate,
    applicantName: row.applicantName,
    applicantEmail: row.applicantEmail,
    applicantGradeLevel: row.applicantGradeLevel,
    teamsInterested: row.teamsInterested,
    vibes: row.vibes,
    greenFlags: row.greenFlags,
    redFlags: row.redFlags,
    otherComments: row.otherComments,
    conflictOfInterest: row.conflictOfInterest,
  };
}

export type UmaMatchStatus = 'matched' | 'unmatched' | 'ambiguous';
export type ApplicantMatchStatus = 'matched' | 'unmatched';

export interface CoffeeChatImportMatchPreview {
  rowIndex: number;
  chatDate: string;
  applicantName: string;
  applicantEmail: string;
  submitterEmail: string | null;
  submitterName: string | null;
  uma: {
    status: UmaMatchStatus;
    userId: number | null;
    userName: string | null;
    detail: string;
  };
  applicant: {
    status: ApplicantMatchStatus;
    candidateId: number | null;
    candidateName: string | null;
    detail: string;
  };
  willImport: boolean;
  skipReason: string | null;
}
