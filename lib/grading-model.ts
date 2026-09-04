import type {
  RubricComponent,
  RubricCriterion,
  RubricQuestion,
  TeamGradingModel,
} from '@/lib/grading-model-types';
import { buildFall2026RoundRubric, FALL_2026_GRADER_INSTRUCTIONS, hydrateFall2026ModelFromRound } from '@/lib/fall-2026-grading-model';
import type { TeamName } from '@/lib/db';
import type { RoundSettings } from '@/lib/rounds';

const FALL_2026_TEAMS = new Set<TeamName>(['Strategy', 'Events', 'Design']);

export function criterionScoreKey(questionId: string, criterionId: string): string {
  return `${questionId}::${criterionId}`;
}

export function parseCriterionScoreKey(key: string): { questionId: string; criterionId: string } | null {
  if (key.startsWith('note::')) return null;
  const idx = key.indexOf('::');
  if (idx <= 0) return null;
  return { questionId: key.slice(0, idx), criterionId: key.slice(idx + 2) };
}

/** Dedicated scores.field_name for a question-level notes row (score stays NULL). */
export const QUESTION_NOTE_PREFIX = 'note::';

export function questionNotesKey(questionId: string): string {
  return `${QUESTION_NOTE_PREFIX}${questionId}`;
}

export function parseQuestionNotesKey(key: string): string | null {
  if (!key.startsWith(QUESTION_NOTE_PREFIX)) return null;
  const id = key.slice(QUESTION_NOTE_PREFIX.length);
  return id || null;
}

export function isStoredNumericScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Split score rows into numeric scores vs notes (question-level and legacy field notes). */
export function splitScoreRows(
  rows: ReadonlyArray<{ readonly [key: string]: unknown }>,
): { scores: Record<string, number>; notes: Record<string, string> } {
  const scores: Record<string, number> = {};
  const notes: Record<string, string> = {};
  for (const row of rows) {
    const field = typeof row.field_name === 'string' ? row.field_name : '';
    if (!field) continue;
    const questionId = parseQuestionNotesKey(field);
    const note = typeof row.note === 'string' ? row.note : '';
    if (questionId) {
      if (note) notes[questionId] = note;
      continue;
    }
    if (isStoredNumericScore(row.score)) scores[field] = row.score;
    if (note) notes[field] = note;
  }
  return { scores, notes };
}

export function getApplicationComponent(model: TeamGradingModel): RubricComponent | undefined {
  return model.components.find((c) => c.id === 'application');
}

/** Primary = owns criteria/scores (not linked into another question). */
export function isPrimaryQuestion(question: RubricQuestion): boolean {
  return !question.linkedToQuestionId;
}

/** Questions whose responses are shown on the primary card. */
export function questionsLinkedTo(
  questions: RubricQuestion[],
  primaryId: string,
): RubricQuestion[] {
  return questions.filter((q) => q.linkedToQuestionId === primaryId);
}

/** Primaries that graders score (have at least one criterion). */
export function primaryScoredQuestions(questions: RubricQuestion[]): RubricQuestion[] {
  return questions.filter((q) => isPrimaryQuestion(q) && q.criteria.length > 0);
}

/** CSV / display fields for one question’s written response. */
export function responseFieldsForQuestion(question: RubricQuestion): string[] {
  return [
    ...(question.csvField ? [question.csvField] : []),
    ...(question.csvFields ?? []),
  ];
}

/** All criterion score keys for the Application component (primaries only). */
export function applicationCriterionKeys(model: TeamGradingModel): string[] {
  const app = getApplicationComponent(model);
  if (!app) return [];
  const keys: string[] = [];
  for (const q of app.questions) {
    if (!isPrimaryQuestion(q)) continue;
    for (const c of q.criteria) {
      keys.push(criterionScoreKey(q.id, c.id));
    }
  }
  return keys;
}

/**
 * Human labels for criterion score keys, e.g.
 * `app-q1::criterion-growth-potential` → `App Q1. Why UMA · Growth Potential`.
 */
export function applicationCriterionLabels(model: TeamGradingModel): Record<string, string> {
  const app = getApplicationComponent(model);
  if (!app) return {};
  const labels: Record<string, string> = {};
  for (const q of app.questions) {
    if (!isPrimaryQuestion(q)) continue;
    const questionLabel = q.label.replace(/\s*\(max\b[^)]*\)\s*$/i, '').trim() || q.label;
    for (const c of q.criteria) {
      labels[criterionScoreKey(q.id, c.id)] = `${questionLabel} · ${c.name}`;
    }
  }
  return labels;
}

/** Prefer rubric labels; fall back to a readable form of the stored key. */
export function displayLabelForScoreField(
  field: string,
  labelByKey?: Record<string, string> | null,
): string {
  const fromMap = labelByKey?.[field]?.trim();
  if (fromMap) return fromMap;
  const parsed = parseCriterionScoreKey(field);
  if (!parsed) return field;
  const slug = parsed.criterionId.replace(/^criterion-/, '').replace(/-/g, ' ').trim();
  if (!slug) return field;
  return slug.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

/** CSV columns that hold application responses for this team. */
export function applicationCsvFields(model: TeamGradingModel): string[] {
  const app = getApplicationComponent(model);
  if (!app) return [];
  const fields = new Set<string>();
  for (const q of app.questions) {
    if (q.csvField) fields.add(q.csvField);
    for (const extra of q.csvFields ?? []) {
      if (extra) fields.add(extra);
    }
  }
  return [...fields];
}

/** Portfolio question CSV field, if any. */
export function portfolioCsvField(model: TeamGradingModel): string | undefined {
  const app = getApplicationComponent(model);
  const portfolio = app?.questions.find((q) => q.id === 'portfolio');
  return portfolio?.csvField;
}

function criterionWeight(criterion: RubricCriterion, question: RubricQuestion): number {
  if (criterion.weightPct != null) return criterion.weightPct / 100;
  if (question.criteria.length === 0) return 0;
  return 1 / question.criteria.length;
}

export function computeQuestionAvg(
  scores: Record<string, number>,
  question: RubricQuestion,
): number | null {
  // Linked questions contribute responses only; weight is folded into the primary.
  if (!isPrimaryQuestion(question)) return null;
  if (question.criteria.length === 0) return null;
  let weighted = 0;
  let weightSum = 0;
  for (const c of question.criteria) {
    const key = criterionScoreKey(question.id, c.id);
    const val = scores[key];
    if (val === undefined) return null;
    const w = criterionWeight(c, question);
    weighted += val * w;
    weightSum += w;
  }
  if (weightSum === 0) return null;
  return weighted / weightSum;
}

/** Application component as a 0–100 percentage. */
export function computeApplicationComponentPct(
  scores: Record<string, number>,
  model: TeamGradingModel,
): number | null {
  const app = getApplicationComponent(model);
  if (!app) return null;
  let weightedSum = 0;
  for (const q of app.questions) {
    if (!isPrimaryQuestion(q)) continue; // weight already on primary
    const qAvg = computeQuestionAvg(scores, q);
    if (qAvg === null) return null;
    weightedSum += (qAvg / 5) * q.weight;
  }
  return weightedSum * 100;
}

/** Full final score (0–100) when all scored components are present. */
export function computeFinalScorePct(
  componentScores: Partial<Record<string, number>>,
  model: TeamGradingModel,
): number | null {
  let numerator = 0;
  let weightSum = 0;
  for (const comp of model.components) {
    const pct = componentScores[comp.id];
    if (pct === undefined) continue;
    numerator += pct * comp.weightPct;
    weightSum += comp.weightPct;
  }
  if (weightSum === 0) return null;
  return numerator / weightSum;
}

/** Merge per-grader criterion maps by averaging each criterion across graders. */
export function averageCriterionScoresAcrossGraders(
  graderMaps: Array<Record<string, number>>,
): Record<string, number> | null {
  if (graderMaps.length === 0) return null;
  const keys = new Set<string>();
  for (const m of graderMaps) {
    for (const k of Object.keys(m)) keys.add(k);
  }
  const merged: Record<string, number> = {};
  for (const key of keys) {
    const vals = graderMaps.map((m) => m[key]).filter((v) => v !== undefined);
    if (vals.length !== graderMaps.length) return null;
    merged[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return merged;
}

export function anchorForScore(
  criterion: RubricCriterion,
  score: number,
): string | undefined {
  return criterion.anchors.find((a) => a.score === score)?.description;
}

export type ResolvedGradingRubric = {
  gradingModel: TeamGradingModel | null;
  applicationQuestions: RubricQuestion[];
  customScoreFields: string[];
  usesCriterionRubric: boolean;
};

function usesCriterionScoreKeys(fields: string[]): boolean {
  return fields.some((field) => field.includes('::'));
}

/** Resolve stored or Fall 2026 criterion rubrics for a round. */
export function resolveGradingRubric(
  settings: Pick<
    RoundSettings,
    'grading_model' | 'csv_headers' | 'custom_score_fields' | 'score_fields'
  >,
  teamName: TeamName,
): ResolvedGradingRubric {
  const storedModel = settings.grading_model;
  const storedApp = storedModel ? getApplicationComponent(storedModel) : undefined;
  const storedQuestions = primaryScoredQuestions(storedApp?.questions ?? []);
  if (storedQuestions.length > 0) {
    return {
      gradingModel: storedModel!,
      // Full question list so graders can resolve linked responses onto primaries.
      applicationQuestions: storedApp!.questions,
      customScoreFields: settings.custom_score_fields.length
        ? settings.custom_score_fields
        : applicationCriterionKeys(storedModel!),
      usesCriterionRubric: true,
    };
  }

  const fall2026 = buildFall2026RoundRubric(teamName, settings.csv_headers);
  if (fall2026) {
    const applicationQuestions =
      getApplicationComponent(fall2026.gradingModel)?.questions ?? [];
    return {
      gradingModel: fall2026.gradingModel,
      applicationQuestions,
      customScoreFields: usesCriterionScoreKeys(settings.custom_score_fields)
        ? settings.custom_score_fields
        : fall2026.customScoreFields,
      usesCriterionRubric: applicationQuestions.length > 0,
    };
  }

  if (FALL_2026_TEAMS.has(teamName)) {
    const model = hydrateFall2026ModelFromRound(
      teamName,
      settings.csv_headers,
      settings.score_fields,
    );
    const allQuestions = getApplicationComponent(model)?.questions ?? [];
    const scored = primaryScoredQuestions(allQuestions);
    if (scored.length > 0) {
      return {
        gradingModel: model,
        applicationQuestions: allQuestions,
        customScoreFields: usesCriterionScoreKeys(settings.custom_score_fields)
          ? settings.custom_score_fields
          : applicationCriterionKeys(model),
        usesCriterionRubric: true,
      };
    }
  }

  return {
    gradingModel: null,
    applicationQuestions: [],
    customScoreFields: settings.custom_score_fields,
    usesCriterionRubric: false,
  };
}

/** Score fields graders must submit for this round. */
export function requiredGradingScoreFields(
  settings: Pick<
    RoundSettings,
    'grading_model' | 'csv_headers' | 'custom_score_fields' | 'score_fields'
  >,
  teamName: TeamName,
): string[] {
  const rubric = resolveGradingRubric(settings, teamName);
  if (rubric.usesCriterionRubric) return rubric.customScoreFields;
  return [...settings.score_fields, ...settings.custom_score_fields];
}
