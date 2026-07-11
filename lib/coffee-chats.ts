export const COFFEE_CHAT_EDIT_WINDOW_SEC = 7 * 24 * 60 * 60;

export interface CoffeeChat {
  id: number;
  chat_date: string;
  submitter_id: number;
  submitter_name: string;
  applicant_name: string;
  applicant_name_normalized: string;
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
  vibes?: string | null;
  greenFlags?: string | null;
  redFlags?: string | null;
  otherComments?: string | null;
  conflictOfInterest?: string | null;
}

export interface CoffeeChatUpdateInput {
  chatDate?: string;
  applicantName?: string;
  vibes?: string | null;
  greenFlags?: string | null;
  redFlags?: string | null;
  otherComments?: string | null;
  conflictOfInterest?: string | null;
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

export function toUserCoffeeChatListItem(raw: unknown): UserCoffeeChatListItem | null {
  if (!raw || typeof raw !== 'object') return null;

  const row = raw as Record<string, unknown>;
  const id = row.id;
  const chatDate = row.chat_date;
  const applicantName = row.applicant_name;

  if (typeof id !== 'number' || typeof chatDate !== 'string' || typeof applicantName !== 'string') {
    return null;
  }

  return {
    id,
    chat_date: chatDate.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? chatDate,
    applicant_name: applicantName,
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

