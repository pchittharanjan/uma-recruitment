import type { TeamName } from '@/lib/db';

export const TEAM_NAMES: TeamName[] = ['Strategy', 'Events', 'Design'];

export type TeamSplitMode = 'named_columns' | 'single_column';

export interface TeamSplitConfig {
  mode: TeamSplitMode;
  /** Used when mode is single_column */
  singleColumn?: string;
}

export interface SplitRow {
  fields: Record<string, string>;
  sourceIndex: number;
}

const TRUTHY = new Set(['yes', 'y', 'true', '1', 'x', '✓', 'checked']);
const FALSY = new Set(['', 'no', 'n', 'false', '0', '-', 'na', 'n/a']);

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

function teamApplyHeaderPattern(team: TeamName): RegExp {
  return new RegExp(`are you applying to ${team.toLowerCase()}`, 'i');
}

export function isTeamHeader(header: string): boolean {
  const n = normalizeHeader(header);
  if (TEAM_NAMES.some((team) => normalizeHeader(team) === n)) return true;
  return TEAM_NAMES.some((team) => teamApplyHeaderPattern(team).test(header));
}

export function teamHeaderForTeam(headers: string[], team: TeamName): string | undefined {
  const exact = headers.find((h) => normalizeHeader(h) === normalizeHeader(team));
  if (exact) return exact;
  return headers.find((h) => teamApplyHeaderPattern(team).test(h));
}

export function getTeamHeaders(headers: string[]): TeamName[] {
  return TEAM_NAMES.filter((team) => teamHeaderForTeam(headers, team) != null);
}

export function detectTeamSplitMode(headers: string[]): TeamSplitMode | null {
  const teamHeaders = getTeamHeaders(headers);
  if (teamHeaders.length === TEAM_NAMES.length) return 'named_columns';
  return null;
}

export function suggestTeamColumn(headers: string[]): string | undefined {
  const patterns = [
    /what team\(s\) are you applying/i,
    /team\(s\).*applying/i,
    /which team/i,
    /team/i,
    /apply.*to/i,
  ];
  for (const pattern of patterns) {
    const match = headers.find((h) => !isTeamHeader(h) && pattern.test(h));
    if (match) return match;
  }
  return undefined;
}

export function isTruthyValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (FALSY.has(v)) return false;
  if (TRUTHY.has(v)) return true;
  return v.length > 0;
}

function matchTeamName(token: string): TeamName | null {
  const t = token.trim().toLowerCase();
  return TEAM_NAMES.find((team) => team.toLowerCase() === t) ?? null;
}

function parseTeamsFromSingleColumn(value: string): TeamName[] {
  const parts = value.split(/[,;|/]/).map((s) => s.trim()).filter(Boolean);
  const teams = new Set<TeamName>();
  for (const part of parts) {
    const matched = matchTeamName(part);
    if (matched) teams.add(matched);
  }
  return [...teams];
}

export function getTeamsForRow(
  row: Record<string, string>,
  headers: string[],
  config: TeamSplitConfig,
): TeamName[] {
  if (config.mode === 'named_columns') {
    const teams: TeamName[] = [];
    for (const team of TEAM_NAMES) {
      const header = teamHeaderForTeam(headers, team);
      if (header && isTruthyValue(row[header] ?? '')) {
        teams.push(team);
      }
    }
    return teams;
  }

  const column = config.singleColumn;
  if (!column) return [];
  return parseTeamsFromSingleColumn(row[column] ?? '');
}

export function splitRowsByTeam(
  rows: Record<string, string>[],
  headers: string[],
  config: TeamSplitConfig,
): {
  byTeam: Record<TeamName, SplitRow[]>;
  unmatched: SplitRow[];
} {
  const byTeam: Record<TeamName, SplitRow[]> = {
    Strategy: [],
    Events: [],
    Design: [],
  };
  const unmatched: SplitRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const teams = getTeamsForRow(row, headers, config);

    if (teams.length === 0) {
      unmatched.push({ fields: row, sourceIndex: i });
      continue;
    }

    for (const team of teams) {
      byTeam[team].push({ fields: row, sourceIndex: i });
    }
  }

  return { byTeam, unmatched };
}

export function summarizeSplit(
  rows: Record<string, string>[],
  headers: string[],
  config: TeamSplitConfig,
): Record<TeamName, number> & { unmatched: number } {
  const { byTeam, unmatched } = splitRowsByTeam(rows, headers, config);
  return {
    Strategy: byTeam.Strategy.length,
    Events: byTeam.Events.length,
    Design: byTeam.Design.length,
    unmatched: unmatched.length,
  };
}

/** Headers that indicate team choice — excluded from scoring by default. */
export function getTeamRelatedHeaders(headers: string[], config: TeamSplitConfig): string[] {
  if (config.mode === 'named_columns') {
    return headers.filter((h) => isTeamHeader(h));
  }
  return config.singleColumn ? [config.singleColumn] : [];
}

export function defaultScoreFields(headers: string[], config: TeamSplitConfig): string[] {
  const teamRelated = new Set(getTeamRelatedHeaders(headers, config));
  return headers.filter((h) => !teamRelated.has(h));
}
