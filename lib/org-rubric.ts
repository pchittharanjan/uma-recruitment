import { getDb } from '@/lib/db';

export interface OrgRubric {
  score_fields: string[];
  custom_score_fields: string[];
  grader_instructions: string | null;
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  return JSON.parse(value) as string[];
}

export async function getOrgRubric(): Promise<OrgRubric | null> {
  const db = getDb();
  const result = await db.execute('SELECT * FROM org_rubric WHERE id = 1');
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    score_fields: parseJsonArray(row.score_fields),
    custom_score_fields: parseJsonArray(row.custom_score_fields),
    grader_instructions: (row.grader_instructions as string | null) ?? null,
  };
}

export async function saveOrgRubric(input: OrgRubric): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO org_rubric (id, score_fields, custom_score_fields, grader_instructions)
          VALUES (1, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            score_fields = excluded.score_fields,
            custom_score_fields = excluded.custom_score_fields,
            grader_instructions = excluded.grader_instructions`,
    args: [
      JSON.stringify(input.score_fields),
      JSON.stringify(input.custom_score_fields),
      input.grader_instructions,
    ],
  });
}

/** Push org rubric fields to every non-closed round, intersecting CSV columns per team. */
export async function propagateOrgRubricToActiveRounds(input: OrgRubric): Promise<void> {
  const db = getDb();
  const rounds = await db.execute({
    sql: `SELECT r.id, rs.csv_headers
          FROM rounds r
          JOIN round_settings rs ON rs.round_id = r.id
          WHERE r.status != 'closed'`,
  });

  for (const row of rounds.rows) {
    const roundId = row.id as number;
    const csvHeaders = parseJsonArray(row.csv_headers);
    const headerSet = new Set(csvHeaders);
    const scoreFields = input.score_fields.filter((f) => headerSet.has(f));
    const scored = new Set([...scoreFields, ...input.custom_score_fields]);
    const contextFields = csvHeaders.filter((h) => !scored.has(h));

    await db.execute({
      sql: `UPDATE round_settings
            SET score_fields = ?, custom_score_fields = ?, context_fields = ?, grader_instructions = ?
            WHERE round_id = ?`,
      args: [
        JSON.stringify(scoreFields),
        JSON.stringify(input.custom_score_fields),
        JSON.stringify(contextFields),
        input.grader_instructions,
        roundId,
      ],
    });
  }
}

/** Merge org defaults into a team's round settings for fields present in CSV headers. */
export function mergeOrgRubricIntoHeaders(
  org: OrgRubric,
  csvHeaders: string[],
): Pick<OrgRubric, 'score_fields' | 'custom_score_fields' | 'grader_instructions'> {
  const headerSet = new Set(csvHeaders);
  return {
    score_fields: org.score_fields.filter((f) => headerSet.has(f)),
    custom_score_fields: org.custom_score_fields,
    grader_instructions: org.grader_instructions,
  };
}
