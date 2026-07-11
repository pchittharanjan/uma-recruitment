export function resolveContextFields(settings: {
  csv_headers: string[];
  score_fields: string[];
  custom_score_fields: string[];
  context_fields?: string[];
}): string[] {
  if (settings.context_fields && settings.context_fields.length > 0) {
    return settings.context_fields;
  }
  const scored = new Set([...settings.score_fields, ...settings.custom_score_fields]);
  return settings.csv_headers.filter((h) => !scored.has(h));
}

/** Application-info columns stored on the round for admin use — not shown to graders. */
export function graderVisibleContextFields(_contextFields: string[]): string[] {
  return [];
}

/** Graders only see team-selected scored prompts (plus applicant # in the UI). */
export function filterFieldsForBlindReview(
  fields: Record<string, string>,
  scoreFields: string[],
  _contextFields: string[] = [],
): Record<string, string> {
  const allowed = new Set(scoreFields);
  const result: Record<string, string> = {};
  for (const key of allowed) {
    if (key in fields) result[key] = fields[key];
  }
  return result;
}

export function applicantDisplayId(rowIndex: number): string {
  return `Applicant #${rowIndex}`;
}
