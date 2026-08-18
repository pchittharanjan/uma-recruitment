import type { TeamName } from '@/lib/db';
import { TEAM_NAMES } from '@/lib/team-split';

export const COFFEE_CHAT_EDIT_WINDOW_SEC = 7 * 24 * 60 * 60;

export const COFFEE_CHAT_GRADE_LEVELS = [
  'Freshman',
  'Sophomore',
  'Junior',
  'Junior Transfer',
  'Senior',
  'Exchange',
  'Nontraditional/Returning Student',
] as const;

export type CoffeeChatGradeLevel = (typeof COFFEE_CHAT_GRADE_LEVELS)[number];

/** Teams selectable on the coffee chat intake form. */
export const COFFEE_CHAT_TEAM_OPTIONS: readonly TeamName[] = TEAM_NAMES;

export interface CoffeeChat {
  id: number;
  chat_date: string;
  submitter_id: number;
  submitter_name: string;
  applicant_name: string;
  applicant_name_normalized: string;
  applicant_email: string | null;
  applicant_grade_level: CoffeeChatGradeLevel | null;
  teams_interested: TeamName[];
  vibes: string | null;
  green_flags: string | null;
  red_flags: string | null;
  other_comments: string | null;
  conflict_of_interest: string | null;
  created_at: number;
  updated_at: number;
}

export interface CoffeeChatWithMeta extends CoffeeChat {
  editable: boolean;
}

/** User-facing list/detail shape — intentionally excludes team/round metadata. */
export interface UserCoffeeChatListItem {
  id: number;
  chat_date: string;
  applicant_name: string;
  applicant_email: string | null;
  applicant_grade_level: CoffeeChatGradeLevel | null;
  teams_interested: TeamName[];
  vibes: string | null;
  green_flags: string | null;
  red_flags: string | null;
  other_comments: string | null;
  conflict_of_interest: string | null;
  editable: boolean;
}

export interface CoffeeChatInput {
  chatDate: string;
  applicantName: string;
  applicantEmail: string;
  applicantGradeLevel: CoffeeChatGradeLevel;
  teamsInterested: TeamName[];
  vibes?: string | null;
  greenFlags?: string | null;
  redFlags?: string | null;
  otherComments?: string | null;
  conflictOfInterest?: string | null;
}

export interface CoffeeChatUpdateInput {
  chatDate?: string;
  applicantName?: string;
  applicantEmail?: string;
  applicantGradeLevel?: CoffeeChatGradeLevel;
  teamsInterested?: TeamName[];
  vibes?: string | null;
  greenFlags?: string | null;
  redFlags?: string | null;
  otherComments?: string | null;
  conflictOfInterest?: string | null;
}

const GRADE_LEVEL_SET = new Set<string>(COFFEE_CHAT_GRADE_LEVELS);
const TEAM_NAME_SET = new Set<string>(COFFEE_CHAT_TEAM_OPTIONS);

export function parseTeamsInterested(raw: string | null | undefined): TeamName[] {
  if (!raw || raw.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TeamName => typeof item === 'string' && TEAM_NAME_SET.has(item),
    );
  } catch {
    return [];
  }
}

export function serializeTeamsInterested(teams: TeamName[]): string {
  return JSON.stringify(teams);
}

export function validateApplicantEmail(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Applicant email is required.');
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized.endsWith('@berkeley.edu')) {
    throw new Error('Applicant email must be a @berkeley.edu address.');
  }
  return normalized;
}

export function validateApplicantGradeLevel(value: unknown): CoffeeChatGradeLevel {
  if (typeof value !== 'string' || !GRADE_LEVEL_SET.has(value)) {
    throw new Error(
      `Applicant grade level must be one of: ${COFFEE_CHAT_GRADE_LEVELS.join(', ')}.`,
    );
  }
  return value as CoffeeChatGradeLevel;
}

export function validateTeamsInterested(value: unknown): TeamName[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Select at least one team the applicant is interested in.');
  }

  const teams: TeamName[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !TEAM_NAME_SET.has(item)) {
      throw new Error(
        `Each team must be one of: ${COFFEE_CHAT_TEAM_OPTIONS.join(', ')}.`,
      );
    }
    if (!teams.includes(item as TeamName)) {
      teams.push(item as TeamName);
    }
  }

  return teams;
}

export function normalizeApplicantName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function coffeeChatSubmittedLabel(chatDate: string): string {
  const iso = chatDate.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? chatDate.trim();
  return iso ? `Submitted on ${iso}` : chatDate;
}

export function formatTeamsInterested(teams: TeamName[]): string {
  return teams.length > 0 ? teams.join(', ') : '-';
}

export function toUserCoffeeChatListItem(raw: unknown): UserCoffeeChatListItem | null {
  if (!raw || typeof raw !== 'object') return null;

  const row = raw as Record<string, unknown>;
  const id = row.id;
  const chatDate = row.chat_date;
  const applicantName = row.applicant_name;

  if (typeof id !== 'number' || typeof chatDate !== 'string' || typeof applicantName !== 'string') {
    return null;
  }

  const gradeLevel = row.applicant_grade_level;
  const applicantGradeLevel =
    typeof gradeLevel === 'string' && GRADE_LEVEL_SET.has(gradeLevel)
      ? (gradeLevel as CoffeeChatGradeLevel)
      : null;

  return {
    id,
    chat_date: chatDate.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? chatDate,
    applicant_name: applicantName,
    applicant_email: (row.applicant_email as string | null) ?? null,
    applicant_grade_level: applicantGradeLevel,
    teams_interested: Array.isArray(row.teams_interested)
      ? row.teams_interested.filter(
          (item): item is TeamName => typeof item === 'string' && TEAM_NAME_SET.has(item),
        )
      : parseTeamsInterested(row.teams_interested as string | null | undefined),
    vibes: (row.vibes as string | null) ?? null,
    green_flags: (row.green_flags as string | null) ?? null,
    red_flags: (row.red_flags as string | null) ?? null,
    other_comments: (row.other_comments as string | null) ?? null,
    conflict_of_interest: (row.conflict_of_interest as string | null) ?? null,
    editable: Boolean(row.editable),
  };
}

export function parseUserCoffeeChatList(raw: unknown): UserCoffeeChatListItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(toUserCoffeeChatListItem)
    .filter((item): item is UserCoffeeChatListItem => item !== null);
}

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function canEditCoffeeChat(chat: CoffeeChat, now = Math.floor(Date.now() / 1000)): boolean {
  return now - chat.created_at <= COFFEE_CHAT_EDIT_WINDOW_SEC;
}

export function isWithinCoffeeChatWindow(
  settings: { coffee_chat_start_date: string | null; application_due_date: string | null },
  today = todayIsoDate(),
): boolean {
  if (!settings.coffee_chat_start_date || !settings.application_due_date) return false;
  if (!isValidIsoDate(settings.coffee_chat_start_date)) return false;
  if (!isValidIsoDate(settings.application_due_date)) return false;
  return today >= settings.coffee_chat_start_date && today <= settings.application_due_date;
}
