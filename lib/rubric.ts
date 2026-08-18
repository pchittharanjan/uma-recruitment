import type { TeamName } from '@/lib/db';
import { teamBadgeClass } from '@/lib/team-colors';
import { splitRowsByTeam, type TeamSplitConfig } from '@/lib/team-split';

/** Collapse whitespace/newlines so Google Forms headers match reliably. */
export function normalizeHeaderText(header: string): string {
  return header.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Columns shown to graders for context — not scored.
 * Generic patterns so new semesters can add fields without code changes;
 * admins can also mark extra columns as context during import.
 */
const CONTEXT_PATTERNS: RegExp[] = [
  /^timestamp$/,
  /^date$/,
  /submitted at/,
  /^email address$/,
  /^email$/,
  /berkeley email/,
  /^full name$/,
  /^first name$/,
  /^last name$/,
  /^preferred name$/,
  /^name$/,
  /^phone/,
  /phone number/,
  /^year$/,
  /class of/,
  /graduation year/,
  /^major/,
  /^minor/,
  /college/,
  /\bcumulative gpa\b/,
  /^gpa$/,
  /resume/,
  /curriculum vitae/,
  /\bcv\b/,
  /hear about/,
  /how did you hear/,
  /have you applied/,
  /applied.*before/,
  /previously applied/,
  /if yes.*semester/,
  /which semester/,
  /what team\(s\)/,
  /team\(s\) are you applying/,
  /which team/,
  /linkedin/,
  /citizenship/,
  /work authorization/,
  /emergency contact/,
  /student id/,
  /calnet/,
];

const PORTFOLIO_PATTERNS: RegExp[] = [
  /portfolio/,
  /google drive/,
  /drive\.google/,
  /figma/,
  /share a link/,
  /design along/,
  /behance/,
  /dribbble/,
  /website url/,
  /work sample/,
];

const URL_VALUE_PATTERN = /^https?:\/\//i;

export function detectPortfolioHeaders(
  headers: string[],
  rows: Record<string, string>[],
  contextHeaders: Set<string>,
): Set<string> {
  const portfolio = new Set<string>();
  for (const header of headers) {
    if (isContextColumn(header, contextHeaders)) continue;
    const normalized = normalizeHeaderText(header);
    if (PORTFOLIO_PATTERNS.some((p) => p.test(normalized))) {
      portfolio.add(header);
      continue;
    }
    if (rows.length === 0) continue;
    const filled = rows.filter((r) => (r[header] ?? '').trim().length > 0);
    if (filled.length === 0) continue;
    const urlLike = filled.filter((r) => URL_VALUE_PATTERN.test((r[header] ?? '').trim())).length;
    if (urlLike / filled.length >= 0.6 && normalized.length < 120) {
      portfolio.add(header);
    }
  }
  return portfolio;
}

export function suggestPortfolioFieldsByTeam(
  headers: string[],
  rows: Record<string, string>[],
  teamSplitConfig: TeamSplitConfig,
  contextHeaders: Set<string>,
): Record<TeamName, string[]> {
  const { byTeam } = splitRowsByTeam(rows, headers, teamSplitConfig);
  const globalPortfolio = detectPortfolioHeaders(headers, rows, contextHeaders);
  const result: Record<TeamName, string[]> = {
    Strategy: [],
    Events: [],
    Design: [],
  };

  for (const team of ['Strategy', 'Events', 'Design'] as TeamName[]) {
    const teamRows = byTeam[team].map((r) => r.fields);
    const teamPortfolio = detectPortfolioHeaders(headers, teamRows, contextHeaders);
    const merged = new Set([...globalPortfolio, ...teamPortfolio]);
    result[team] = headers.filter((h) => {
      if (!merged.has(h)) return false;
      if (teamRows.length === 0) return false;
      return columnFillRate(teamRows, h) >= SUGGEST_THRESHOLD;
    });
  }

  return result;
}

export function detectContextHeaders(headers: string[]): Set<string> {
  return new Set(
    headers.filter((h) => CONTEXT_PATTERNS.some((p) => p.test(normalizeHeaderText(h)))),
  );
}

export function isContextColumn(header: string, contextHeaders: Set<string>): boolean {
  return contextHeaders.has(header);
}

export function shortHeaderLabel(header: string, maxLen = 72): string {
  const oneLine = header.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}

export function columnFillRate(rows: Record<string, string>[], header: string): number {
  if (rows.length === 0) return 0;
  const filled = rows.filter((r) => (r[header] ?? '').trim().length > 0).length;
  return filled / rows.length;
}

const SUGGEST_THRESHOLD = 0.5;
const SHOW_THRESHOLD = 0.1;

/**
 * Suggest scored columns per team based on who actually answered each question.
 * Works when prompts change every semester — no hardcoded essay text.
 */
export function suggestScoreFieldsByTeam(
  headers: string[],
  rows: Record<string, string>[],
  teamSplitConfig: TeamSplitConfig,
  contextHeaders: Set<string>,
): Record<TeamName, string[]> {
  const { byTeam } = splitRowsByTeam(rows, headers, teamSplitConfig);
  const result: Record<TeamName, string[]> = {
    Strategy: [],
    Events: [],
    Design: [],
  };

  for (const team of ['Strategy', 'Events', 'Design'] as TeamName[]) {
    const teamRows = byTeam[team].map((r) => r.fields);
    const scored: string[] = [];

    for (const header of headers) {
      if (isContextColumn(header, contextHeaders)) continue;
      if (teamRows.length === 0) continue;
      const normalized = normalizeHeaderText(header);
      if (PORTFOLIO_PATTERNS.some((p) => p.test(normalized))) continue;
      if (columnFillRate(teamRows, header) >= SUGGEST_THRESHOLD) {
        scored.push(header);
      }
    }

    result[team] = scored;
  }

  return result;
}

/** Columns to show in a team's scoring checklist (includes low-fill so admin can opt in). */
export function scoringHeadersForTeam(
  headers: string[],
  teamRows: Record<string, string>[],
  contextHeaders: Set<string>,
): string[] {
  return headers.filter((header) => {
    if (isContextColumn(header, contextHeaders)) return false;
    return columnFillRate(teamRows, header) >= SHOW_THRESHOLD;
  });
}


export function fillRatesByTeam(
  header: string,
  splitByTeam: Record<TeamName, { fields: Record<string, string> }[]>,
): Record<TeamName, number> {
  return {
    Strategy: columnFillRate(splitByTeam.Strategy.map((r) => r.fields), header),
    Events: columnFillRate(splitByTeam.Events.map((r) => r.fields), header),
    Design: columnFillRate(splitByTeam.Design.map((r) => r.fields), header),
  };
}

export type QuestionScopeKind = 'context' | 'all_teams' | 'multi_team' | 'single_team' | 'none';

export interface QuestionReviewRow {
  header: string;
  isContext: boolean;
  fillRates: Record<TeamName, number>;
  /** Teams where ≥50% of applicants answered */
  primaryTeams: TeamName[];
  /** Teams currently set to score this column */
  scoringTeams: TeamName[];
  scopeKind: QuestionScopeKind;
  scopeLabel: string;
}

function teamNamesFromFillRates(
  fillRates: Record<TeamName, number>,
  teamsWithApps: TeamName[],
  threshold: number,
): TeamName[] {
  return teamsWithApps.filter((t) => fillRates[t] >= threshold);
}

export function describeQuestionScope(
  isContext: boolean,
  primaryTeams: TeamName[],
  scoringTeams: TeamName[],
  teamsWithApps: TeamName[],
): { scopeKind: QuestionScopeKind; scopeLabel: string } {
  if (isContext) return { scopeKind: 'context', scopeLabel: 'Application info' };
  if (scoringTeams.length === 0) {
    return primaryTeams.length > 0
      ? { scopeKind: 'none', scopeLabel: 'Not scored' }
      : { scopeKind: 'none', scopeLabel: 'No answers' };
  }
  if (scoringTeams.length === teamsWithApps.length) {
    return { scopeKind: 'all_teams', scopeLabel: 'All teams' };
  }
  if (scoringTeams.length === 1) {
    return { scopeKind: 'single_team', scopeLabel: `${scoringTeams[0]} only` };
  }
  return { scopeKind: 'multi_team', scopeLabel: scoringTeams.join(' + ') };
}

export function buildQuestionReview(
  headers: string[],
  splitByTeam: Record<TeamName, { fields: Record<string, string> }[]>,
  contextHeaders: Set<string>,
  scoreFieldsByTeam: Record<TeamName, Set<string>>,
  teamsWithApps: TeamName[],
): QuestionReviewRow[] {
  return headers.map((header) => {
    const isContext = isContextColumn(header, contextHeaders);
    const fillRates = fillRatesByTeam(header, splitByTeam);
    const primaryTeams = teamNamesFromFillRates(fillRates, teamsWithApps, SUGGEST_THRESHOLD);
    const scoringTeams = teamsWithApps.filter((t) => scoreFieldsByTeam[t].has(header));
    const { scopeKind, scopeLabel } = describeQuestionScope(
      isContext,
      primaryTeams,
      scoringTeams,
      teamsWithApps,
    );
    return {
      header,
      isContext,
      fillRates,
      primaryTeams,
      scoringTeams,
      scopeKind,
      scopeLabel,
    };
  });
}

/** Non-context columns worth showing in the review table. */
export function reviewableHeaders(
  headers: string[],
  splitByTeam: Record<TeamName, { fields: Record<string, string> }[]>,
  contextHeaders: Set<string>,
  teamsWithApps: TeamName[],
): string[] {
  return headers.filter((header) => {
    if (isContextColumn(header, contextHeaders)) return true;
    const rates = fillRatesByTeam(header, splitByTeam);
    return teamsWithApps.some((t) => rates[t] >= SHOW_THRESHOLD);
  });
}

export function scopeBadgeClass(kind: QuestionScopeKind, scoringTeams: TeamName[] = []): string {
  switch (kind) {
    case 'context':
      return 'bg-muted text-muted-foreground';
    case 'all_teams':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200';
    case 'single_team': {
      const team = scoringTeams[0];
      if (team) return teamBadgeClass(team);
      return 'bg-muted text-muted-foreground';
    }
    case 'multi_team':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/** Recompute score suggestions after context or team split changes. */
export function buildScoreFieldSets(
  headers: string[],
  rows: Record<string, string>[],
  config: TeamSplitConfig,
  contextHeaders: Set<string>,
): Record<TeamName, Set<string>> {
  const suggested = suggestScoreFieldsByTeam(headers, rows, config, contextHeaders);
  return {
    Strategy: new Set(suggested.Strategy),
    Events: new Set(suggested.Events),
    Design: new Set(suggested.Design),
  };
}

export function buildPortfolioFieldSets(
  headers: string[],
  rows: Record<string, string>[],
  config: TeamSplitConfig,
  contextHeaders: Set<string>,
): Record<TeamName, Set<string>> {
  const suggested = suggestPortfolioFieldsByTeam(headers, rows, config, contextHeaders);
  return {
    Strategy: new Set(suggested.Strategy),
    Events: new Set(suggested.Events),
    Design: new Set(suggested.Design),
  };
}
