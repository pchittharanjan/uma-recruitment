export interface GraderInput {
  name: string;
  email: string;
}

function parseGraderLine(line: string): GraderInput | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed.includes('\t')) {
    const parts = trimmed.split('\t').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { name: parts[0], email: parts[parts.length - 1] };
    }
  }

  const commaIdx = trimmed.lastIndexOf(',');
  if (commaIdx > 0) {
    const name = trimmed.slice(0, commaIdx).trim();
    const email = trimmed.slice(commaIdx + 1).trim();
    if (name && email) return { name, email };
  }

  const spaced = trimmed.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
  if (spaced.length >= 2) {
    return { name: spaced[0], email: spaced[spaced.length - 1] };
  }

  return null;
}

function shouldSkipHeaderLine(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    (lower.includes('name') && lower.includes('email')) ||
    lower === 'name' ||
    lower.startsWith('name,') ||
    lower.startsWith('name\t')
  );
}

export function parseGraderPaste(
  text: string,
  options?: { minGraders?: number; lenient?: boolean },
): { graders: GraderInput[]; error?: string } {
  const minGraders = options?.minGraders ?? 2;
  const lenient = options?.lenient ?? false;
  const lines = text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let start = 0;
  if (lines[0] && shouldSkipHeaderLine(lines[0])) {
    start = 1;
  }

  const parsed: GraderInput[] = [];
  for (let i = start; i < lines.length; i++) {
    const row = parseGraderLine(lines[i]);
    if (!row) {
      if (lenient) continue;
      return {
        graders: [],
        error: `Line ${i + 1}: "${lines[i]}" — expected name and email (tab or comma separated)`,
      };
    }
    parsed.push(row);
  }

  if (!lenient && parsed.length < minGraders) {
    return { graders: [], error: `At least ${minGraders} users required` };
  }

  const emails = parsed.map((g) => g.email.toLowerCase());
  const dupes = [...new Set(emails.filter((e, i) => emails.indexOf(e) !== i))];
  if (!lenient && dupes.length > 0) {
    return { graders: [], error: `Duplicate email: ${dupes.join(', ')}` };
  }

  return { graders: parsed };
}

export function countParsedGraders(text: string): number {
  return parseGraderPaste(text, { minGraders: 0, lenient: true }).graders.length;
}

/** Append incoming graders, skipping duplicate emails (case-insensitive). */
export function mergeGraderLists(
  existing: GraderInput[],
  incoming: GraderInput[],
): GraderInput[] {
  const seen = new Set(
    existing
      .map((g) => g.email.trim().toLowerCase())
      .filter(Boolean),
  );
  const merged = [...existing];
  for (const grader of incoming) {
    const email = grader.email.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    merged.push({
      name: grader.name.trim(),
      email: grader.email.trim(),
    });
  }
  return merged;
}

export function validateGraderList(
  graders: GraderInput[],
  minGraders: number = 2,
): { error?: string } {
  const filled = graders.filter((g) => g.name.trim() || g.email.trim());
  if (filled.length < minGraders) {
    return { error: `At least ${minGraders} users required` };
  }
  for (const g of filled) {
    if (!g.name.trim() || !g.email.trim()) {
      return { error: 'Each user needs a name and email' };
    }
  }
  const emails = filled.map((g) => g.email.toLowerCase());
  const dupes = [...new Set(emails.filter((e, i) => emails.indexOf(e) !== i))];
  if (dupes.length > 0) {
    return { error: `Duplicate email: ${dupes.join(', ')}` };
  }
  return {};
}

export function isTestGraderEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith('.test@berkeley.edu');
}

const TEST_GRADER_POOL: GraderInput[] = [
  { name: 'Melanie Nguyen', email: 'mguan.test@berkeley.edu' },
  { name: 'Brandon Chen', email: 'bchen.test@berkeley.edu' },
  { name: 'Priya Sharma', email: 'psharma.test@berkeley.edu' },
  { name: 'Diego Morales', email: 'dmorales.test@berkeley.edu' },
  { name: 'Hannah Kim', email: 'hkim.test@berkeley.edu' },
  { name: 'Omar Hassan', email: 'ohassan.test@berkeley.edu' },
  { name: 'Sophie Laurent', email: 'slaurent.test@berkeley.edu' },
  { name: 'Ethan Park', email: 'epark.test@berkeley.edu' },
  { name: 'Aisha Patel', email: 'apatel.test@berkeley.edu' },
  { name: 'Lucas Müller', email: 'lmuller.test@berkeley.edu' },
  { name: 'Chloe Williams', email: 'cwilliams.test@berkeley.edu' },
  { name: 'Marcus Johnson', email: 'mjohnson.test@berkeley.edu' },
  { name: 'Yuki Tanaka', email: 'ytanaka.test@berkeley.edu' },
  { name: 'Isabella Rossi', email: 'irossi.test@berkeley.edu' },
  { name: 'Noah Thompson', email: 'nthompson.test@berkeley.edu' },
  { name: 'Fatima Al-Sayed', email: 'falsayed.test@berkeley.edu' },
  { name: 'Ryan O\'Connor', email: 'roconnor.test@berkeley.edu' },
  { name: 'Elena Vasquez', email: 'evasquez.test@berkeley.edu' },
  { name: 'James Okonkwo', email: 'jokonkwo.test@berkeley.edu' },
  { name: 'Lily Zhang', email: 'lzhang.test@berkeley.edu' },
  { name: 'Carlos Mendez', email: 'cmendez.test@berkeley.edu' },
];

const TEST_GRADER_TEAM_OFFSET: Record<string, number> = {
  strategy: 0,
  events: 7,
  design: 14,
};

/** Placeholder graders for import-wizard UI testing. */
export function testGradersForTeam(team: string, count = 7): GraderInput[] {
  const offset = TEST_GRADER_TEAM_OFFSET[team.toLowerCase()] ?? 0;
  return Array.from({ length: count }, (_, i) => {
    const person = TEST_GRADER_POOL[(offset + i) % TEST_GRADER_POOL.length];
    return { ...person };
  });
}
