import { MAX_DIRECTORS_PER_TEAM } from '@/lib/director-limits';

export interface BulkPasteTeamOption {
  id: number;
  name: string;
}

export interface BulkPastePreparedUser {
  name: string;
  email: string;
  role: 'admin' | 'exec';
  teamIds: number[];
  directorTeamIds: number[];
}

export interface BulkPasteParsedRow {
  rowNumber: number;
  source: {
    fullName: string;
    berkeleyEmail: string;
    role: string;
    teamIds: number[];
    invalidTeamNames: string[];
  };
  normalizedRole: 'admin' | 'exec' | 'director' | null;
  errors: string[];
  prepared: BulkPastePreparedUser | null;
}

export type BulkPasteSourceRow = BulkPasteParsedRow['source'];

interface ParsedLine {
  values: string[];
}

type SourceInputField = 'fullName' | 'berkeleyEmail' | 'role' | 'teams';

function isBerkeleyEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith('@berkeley.edu');
}

const HEADER_ALIASES: Record<string, SourceInputField> = {
  name: 'fullName',
  fullname: 'fullName',
  'full name': 'fullName',
  email: 'berkeleyEmail',
  berkeleyemail: 'berkeleyEmail',
  'berkeley email': 'berkeleyEmail',
  role: 'role',
  teams: 'teams',
  team: 'teams',
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function normalizeRole(role: string): 'admin' | 'exec' | 'director' | null {
  const normalized = role.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'admin') return 'admin';
  if (normalized === 'exec' || normalized === 'team exec' || normalized === 'team_exec') return 'exec';
  if (normalized === 'director') return 'director';
  return null;
}

function splitTeamNames(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseTeamSelection(raw: string, teams: BulkPasteTeamOption[]): { teamIds: number[]; invalidTeamNames: string[] } {
  const teamByNormalizedName = new Map<string, BulkPasteTeamOption>();
  for (const team of teams) {
    teamByNormalizedName.set(team.name.trim().toLowerCase(), team);
  }

  const teamIds = new Set<number>();
  const invalidTeamNames: string[] = [];
  for (const teamName of splitTeamNames(raw)) {
    const matched = teamByNormalizedName.get(teamName.toLowerCase());
    if (!matched) {
      invalidTeamNames.push(teamName);
      continue;
    }
    teamIds.add(matched.id);
  }

  return { teamIds: Array.from(teamIds), invalidTeamNames };
}

function parseDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
  if (delimiter === '\t') {
    return line.split('\t').map((cell) => cell.trim());
  }

  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === ',') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function detectDelimiter(lines: string[]): ',' | '\t' {
  return lines.some((line) => line.includes('\t')) ? '\t' : ',';
}

function parseRawLines(input: string): ParsedLine[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const delimiter = detectDelimiter(lines);
  return lines.map((line) => ({ values: parseDelimitedLine(line, delimiter) }));
}

function rowLooksLikeHeader(values: string[]): boolean {
  const recognized = values.filter((value) => HEADER_ALIASES[normalizeHeader(value)]).length;
  return recognized >= 2;
}

function valuesToSource(
  values: string[],
  headerMap: Partial<Record<SourceInputField, number>>,
  hasHeader: boolean,
  teams: BulkPasteTeamOption[],
  defaultRole: 'admin' | 'exec' | 'director',
): BulkPasteParsedRow['source'] {
  const first = values[0]?.trim() ?? '';
  const second = values[1]?.trim() ?? '';
  const third = values[2]?.trim() ?? '';

  const looksLikeFirstLastEmail =
    !hasHeader &&
    first.length > 0 &&
    second.length > 0 &&
    isBerkeleyEmail(third) &&
    !isBerkeleyEmail(second) &&
    normalizeRole(third) === null;

  if (looksLikeFirstLastEmail) {
    const teamsRaw = values[3] ?? '';
    const { teamIds, invalidTeamNames } = parseTeamSelection(teamsRaw, teams);
    return {
      fullName: `${first} ${second}`.replace(/\s+/g, ' ').trim(),
      berkeleyEmail: third,
      role: defaultRole,
      teamIds,
      invalidTeamNames,
    };
  }

  const byPosition = {
    fullName: values[0] ?? '',
    berkeleyEmail: values[1] ?? '',
    role: values[2] ?? '',
    teams: values[3] ?? '',
  };

  const teamSource = values[headerMap.teams ?? 3] ?? byPosition.teams;
  const { teamIds, invalidTeamNames } = parseTeamSelection(teamSource, teams);

  return {
    fullName: values[headerMap.fullName ?? 0] ?? byPosition.fullName,
    berkeleyEmail: values[headerMap.berkeleyEmail ?? 1] ?? byPosition.berkeleyEmail,
    role: values[headerMap.role ?? 2] ?? byPosition.role,
    teamIds,
    invalidTeamNames,
  };
}

export function validateBulkPasteRows(
  sources: BulkPasteSourceRow[],
  teams: BulkPasteTeamOption[],
  existingDirectorCountByTeamId: Record<number, number>,
): BulkPasteParsedRow[] {
  if (sources.length === 0) return [];

  const rows: BulkPasteParsedRow[] = [];
  const seenEmails = new Map<string, number>();

  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    const rowNumber = i + 1;
    const errors: string[] = [];
    const name = source.fullName.trim();
    const email = source.berkeleyEmail.trim().toLowerCase();
    const normalizedRole = normalizeRole(source.role);

    if (!name) errors.push('Full name is required.');
    if (!email) {
      errors.push('Berkeley email is required.');
    } else if (!isBerkeleyEmail(email)) {
      errors.push('Use a @berkeley.edu email.');
    }
    if (!normalizedRole) {
      if (!source.role.trim()) {
        errors.push('Role is missing. Add Admin, Exec, or Director, or choose a default role.');
      } else {
        errors.push('Role must be Admin, Exec, or Director.');
      }
    }

    if (email) {
      const firstRow = seenEmails.get(email);
      if (firstRow) {
        errors.push(`Email is duplicated in this paste (already used in row ${firstRow}).`);
      } else {
        seenEmails.set(email, rowNumber);
      }
    }

    const teamIds = new Set<number>(source.teamIds);
    for (const teamName of source.invalidTeamNames) {
      errors.push(`Unknown team: "${teamName}".`);
    }

    let prepared: BulkPastePreparedUser | null = null;
    if (normalizedRole) {
      if (normalizedRole === 'admin') {
        prepared = { name, email, role: 'admin', teamIds: [], directorTeamIds: [] };
      } else if (normalizedRole === 'director') {
        if (teamIds.size === 0) errors.push('Director must have at least one team.');
        prepared = {
          name,
          email,
          role: 'exec',
          teamIds: Array.from(teamIds),
          directorTeamIds: Array.from(teamIds),
        };
      } else {
        if (teamIds.size === 0) errors.push('Exec must have at least one team.');
        prepared = {
          name,
          email,
          role: 'exec',
          teamIds: Array.from(teamIds),
          directorTeamIds: [],
        };
      }
    }

    rows.push({ rowNumber, source, normalizedRole, errors, prepared });
  }

  const projectedDirectorCounts = new Map<number, number>();
  Object.entries(existingDirectorCountByTeamId).forEach(([teamId, count]) => {
    projectedDirectorCounts.set(Number(teamId), count);
  });

  for (const row of rows) {
    if (!row.prepared || row.errors.length > 0) continue;
    for (const teamId of row.prepared.directorTeamIds) {
      projectedDirectorCounts.set(teamId, (projectedDirectorCounts.get(teamId) ?? 0) + 1);
      if ((projectedDirectorCounts.get(teamId) ?? 0) > MAX_DIRECTORS_PER_TEAM) {
        const teamName = teams.find((team) => team.id === teamId)?.name ?? `#${teamId}`;
        row.errors.push(
          `Director limit reached for ${teamName} (max ${MAX_DIRECTORS_PER_TEAM}).`,
        );
      }
    }
  }

  return rows;
}

export function parseBulkPasteRows(
  input: string,
  teams: BulkPasteTeamOption[],
  existingDirectorCountByTeamId: Record<number, number>,
  defaultRole: 'admin' | 'exec' | 'director' = 'exec',
): BulkPasteParsedRow[] {
  const parsed = parseRawLines(input);
  if (parsed.length === 0) return [];

  const maybeHeader = parsed[0].values;
  const headerMap: Partial<Record<SourceInputField, number>> = {};
  let startIndex = 0;
  if (rowLooksLikeHeader(maybeHeader)) {
    maybeHeader.forEach((value, index) => {
      const alias = HEADER_ALIASES[normalizeHeader(value)];
      if (alias && headerMap[alias] === undefined) {
        headerMap[alias] = index;
      }
    });
    startIndex = 1;
  }

  const sources: BulkPasteSourceRow[] = [];
  for (let i = startIndex; i < parsed.length; i += 1) {
    sources.push(valuesToSource(parsed[i].values, headerMap, startIndex > 0, teams, defaultRole));
  }

  return validateBulkPasteRows(sources, teams, existingDirectorCountByTeamId);
}
