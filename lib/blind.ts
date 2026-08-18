export function resolveContextFields(settings: {
  csv_headers: string[];
  score_fields: string[];
  custom_score_fields: string[];
  context_fields?: string[];
  portfolio_fields?: string[];
}): string[] {
  if (settings.context_fields && settings.context_fields.length > 0) {
    return settings.context_fields;
  }
  const excluded = new Set([
    ...settings.score_fields,
    ...settings.custom_score_fields,
    ...(settings.portfolio_fields ?? []),
  ]);
  return settings.csv_headers.filter((h) => !excluded.has(h));
}

/** Graders only see scored prompts plus portfolio links (Applicant # in UI). */
export function filterFieldsForBlindReview(
  fields: Record<string, string>,
  scoreFields: string[],
  portfolioFields: string[] = [],
): Record<string, string> {
  const allowed = new Set([...scoreFields, ...portfolioFields]);
  const result: Record<string, string> = {};
  for (const key of allowed) {
    if (key in fields) result[key] = fields[key];
  }
  return result;
}

export function filterPortfolioFieldsForBlindReview(
  fields: Record<string, string>,
  portfolioFields: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of portfolioFields) {
    if (key in fields && (fields[key] ?? '').trim()) {
      result[key] = fields[key];
    }
  }
  return result;
}

/** Application-info columns stored on the round for admin use — not shown to graders. */
export function graderVisibleContextFields(_contextFields: string[]): string[] {
  return [];
}

export function applicantDisplayId(rowIndex: number): string {
  return `Applicant #${rowIndex}`;
}
