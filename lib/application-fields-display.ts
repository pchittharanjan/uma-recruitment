import type { TeamName } from '@/lib/db';
import {
  TEAM_NAMES,
  isTeamHeader,
  isTruthyValue,
  normalizeHeader,
  teamHeaderForTeam,
} from '@/lib/team-split';

export type ApplicationFieldEntry = { key: string; value: string };

/** Google Form / PII columns we never show on the Application tab. */
function shouldAlwaysHideHeader(header: string): boolean {
  const n = normalizeHeader(header);
  if (/^timestamp$/i.test(n)) return true;
  if (/^phone(?:\s|$)/i.test(n) || /phone number/i.test(n)) return true;
  // Keep Berkeley Email; hide Google Form "Email Address" and bare "Email".
  if (n === 'email address' || n === 'email') return true;
  // Name is already in the page header — hide exact name columns only.
  if (
    /^full name$/i.test(n) ||
    /^first name$/i.test(n) ||
    /^last name$/i.test(n) ||
    /^preferred name$/i.test(n) ||
    /^name$/i.test(n)
  ) {
    return true;
  }
  return false;
}

function isBlankValue(value: string): boolean {
  return value.trim() === '';
}

/** Team essay / case columns that mention this team by name (e.g. "UMA Strategy Team"). */
function isTeamQuestionHeader(header: string, team: TeamName): boolean {
  if (isTeamHeader(header)) return false;
  return new RegExp(`\\b${team}\\b`, 'i').test(header);
}

function teamForQuestionHeader(header: string): TeamName | null {
  for (const team of TEAM_NAMES) {
    if (isTeamQuestionHeader(header, team)) return team;
  }
  return null;
}

/**
 * Filter and reorder application fields for display:
 * hide timestamp / email / phone / name / blanks; group each team's apply prompt with
 * that team's questions; skip teams the applicant did not apply to (and left blank).
 */
export function prepareApplicationFieldsForDisplay(
  fields: Record<string, string>,
): ApplicationFieldEntry[] {
  const headers = Object.keys(fields);
  const applyHeaderByTeam = new Map<TeamName, string>();
  for (const team of TEAM_NAMES) {
    const header = teamHeaderForTeam(headers, team);
    if (header) applyHeaderByTeam.set(team, header);
  }

  const applyHeaders = new Set(applyHeaderByTeam.values());
  const teamQuestionHeaders = new Map<TeamName, string[]>();
  for (const team of TEAM_NAMES) {
    teamQuestionHeaders.set(team, []);
  }

  const shared: ApplicationFieldEntry[] = [];
  const leftover: ApplicationFieldEntry[] = [];
  const claimed = new Set<string>();

  for (const key of headers) {
    if (shouldAlwaysHideHeader(key)) {
      claimed.add(key);
      continue;
    }

    const raw = fields[key] ?? '';
    if (applyHeaders.has(key)) {
      claimed.add(key);
      continue;
    }

    const team = teamForQuestionHeader(key);
    if (team) {
      teamQuestionHeaders.get(team)!.push(key);
      claimed.add(key);
      continue;
    }

    if (!isBlankValue(raw)) {
      shared.push({ key, value: raw });
    }
    claimed.add(key);
  }

  const result: ApplicationFieldEntry[] = [...shared];

  for (const team of TEAM_NAMES) {
    const applyHeader = applyHeaderByTeam.get(team);
    const applyValue = applyHeader ? (fields[applyHeader] ?? '') : '';
    const questionKeys = teamQuestionHeaders.get(team) ?? [];
    const answeredQuestions = questionKeys
      .map((key) => ({ key, value: fields[key] ?? '' }))
      .filter((entry) => !isBlankValue(entry.value));

    const applyTruthy = applyHeader ? isTruthyValue(applyValue) : false;
    if (!applyTruthy && answeredQuestions.length === 0) {
      continue;
    }

    if (applyHeader && !isBlankValue(applyValue)) {
      result.push({ key: applyHeader, value: applyValue });
    }
    result.push(...answeredQuestions);
  }

  for (const key of headers) {
    if (claimed.has(key)) continue;
    if (shouldAlwaysHideHeader(key)) continue;
    const value = fields[key] ?? '';
    if (isBlankValue(value)) continue;
    leftover.push({ key, value });
  }
  result.push(...leftover);

  return result;
}
