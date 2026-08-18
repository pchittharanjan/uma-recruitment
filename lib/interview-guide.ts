import { strategyDefaultGuides } from '@/lib/strategy-interview';
import { designDefaultGuides } from '@/lib/design-interview';

export type InterviewGuideFormat = 'questions' | 'case_study' | 'case_and_behavioral';
export type InterviewGuideStage = 'first_round' | 'final_round';

export type InterviewRubricCriterion = {
  name: string;
  weight: number;
};

export type InterviewRubric = {
  /** Highest score interviewers can give (inclusive). Default 5. */
  scaleMax: number;
  criteria: InterviewRubricCriterion[];
};

export interface InterviewGuide {
  format: InterviewGuideFormat;
  intro?: string;
  /** Public path to the case PDF shown during scoring, e.g. `/interview-cases/strategy-group.pdf`. */
  casePdfUrl?: string;
  questions?: string[];
  caseStudy?: {
    title?: string;
    prompt: string;
    /** Case-packet questions. Interviewers take notes only — they do not score these. */
    discussionPoints?: string[];
  };
  /** Scored evaluation for case interviews. Scale, criteria, and relative weights. */
  rubric?: InterviewRubric;
}

export type InterviewGuidesRecord = Record<InterviewGuideStage, InterviewGuide | null>;

export type InterviewScoreFieldGroup = {
  key: 'case' | 'behavioral' | 'questions' | 'overall';
  label: string;
  fields: string[];
  /** Relative weights keyed by field name. Missing keys are treated as 1. */
  weights?: Record<string, number>;
};

export const INTERVIEW_SCALE_MAX_OPTIONS = [5, 7, 10] as const;
export const DEFAULT_INTERVIEW_SCALE_MAX = 5;

const STAGES: InterviewGuideStage[] = ['first_round', 'final_round'];
const FORMATS: InterviewGuideFormat[] = ['questions', 'case_study', 'case_and_behavioral'];

export function emptyInterviewGuides(): InterviewGuidesRecord {
  return { first_round: null, final_round: null };
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function trimList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function isGuideFormat(value: unknown): value is InterviewGuideFormat {
  return typeof value === 'string' && FORMATS.includes(value as InterviewGuideFormat);
}

export function normalizeCasePdfUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/interview-cases/')) return undefined;
  if (trimmed.includes('..') || trimmed.includes('//', 1)) return undefined;
  return trimmed;
}

export function emptyInterviewRubric(): InterviewRubric {
  return {
    scaleMax: DEFAULT_INTERVIEW_SCALE_MAX,
    criteria: [{ name: '', weight: 1 }],
  };
}

function defaultInterviewRubric(): InterviewRubric {
  return {
    scaleMax: DEFAULT_INTERVIEW_SCALE_MAX,
    criteria: [{ name: 'Overall assessment', weight: 1 }],
  };
}

function clampScaleMax(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n)) return DEFAULT_INTERVIEW_SCALE_MAX;
  if ((INTERVIEW_SCALE_MAX_OPTIONS as readonly number[]).includes(n)) return n;
  if (n >= 2 && n <= 10) return n;
  return DEFAULT_INTERVIEW_SCALE_MAX;
}

function normalizeWeight(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.round(n * 100) / 100;
}

export function normalizeInterviewRubric(raw: unknown): InterviewRubric | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as { scaleMax?: unknown; criteria?: unknown };
  const criteriaRaw = Array.isArray(obj.criteria) ? obj.criteria : [];
  const criteria: InterviewRubricCriterion[] = [];
  for (const item of criteriaRaw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { name?: unknown; weight?: unknown };
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) continue;
    criteria.push({ name, weight: normalizeWeight(row.weight) });
  }
  if (criteria.length === 0) return undefined;
  return { scaleMax: clampScaleMax(obj.scaleMax), criteria };
}

function normalizeCaseStudy(raw: unknown): InterviewGuide['caseStudy'] | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { title?: unknown; prompt?: unknown; discussionPoints?: unknown };
  const prompt = typeof obj.prompt === 'string' ? obj.prompt.trim() : '';
  if (!prompt) return null;
  const discussionPoints = trimList(obj.discussionPoints);
  return {
    title: trimOptional(typeof obj.title === 'string' ? obj.title : undefined),
    prompt,
    discussionPoints: discussionPoints.length > 0 ? discussionPoints : undefined,
  };
}

function withDefaultCaseRubric(guide: InterviewGuide): InterviewGuide {
  if (guide.format === 'questions') return guide;
  if (normalizeInterviewRubric(guide.rubric)) return guide;
  return { ...guide, rubric: defaultInterviewRubric() };
}

/** Normalize raw API/client input into a validated guide shape (may still fail validateInterviewGuide). */
export function normalizeGuideInput(raw: unknown): InterviewGuide | null {
  return normalizeGuide(raw);
}

function normalizeGuide(raw: unknown): InterviewGuide | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<InterviewGuide>;
  if (!isGuideFormat(obj.format)) return null;

  const intro = trimOptional(obj.intro);
  const casePdfUrl = normalizeCasePdfUrl(obj.casePdfUrl);
  const rubric = normalizeInterviewRubric(obj.rubric);

  if (obj.format === 'questions') {
    const questions = trimList(obj.questions);
    if (questions.length === 0) return null;
    return { format: 'questions', intro, casePdfUrl, questions };
  }

  const caseStudy = normalizeCaseStudy(obj.caseStudy);
  if (!caseStudy) return null;

  if (obj.format === 'case_study') {
    return withDefaultCaseRubric({ format: 'case_study', intro, casePdfUrl, caseStudy, rubric });
  }

  const questions = trimList(obj.questions);
  return withDefaultCaseRubric({
    format: 'case_and_behavioral',
    intro,
    casePdfUrl,
    caseStudy,
    questions,
    rubric,
  });
}

export function parseInterviewGuides(
  json: string | null,
  legacyScriptFirstRound?: string | null,
): InterviewGuidesRecord {
  const guides = emptyInterviewGuides();

  if (json?.trim()) {
    try {
      const parsed = JSON.parse(json) as Partial<InterviewGuidesRecord>;
      for (const stage of STAGES) {
        guides[stage] = normalizeGuide(parsed[stage]);
      }
      const hasJsonGuides = STAGES.some((s) => guides[s] !== null);
      if (hasJsonGuides) return guides;
    } catch {
      // fall through to legacy migration
    }
  }

  const legacy = legacyScriptFirstRound?.trim();
  if (legacy) {
    guides.first_round = { format: 'questions', questions: [legacy] };
  }

  return guides;
}

export function serializeInterviewGuides(guides: InterviewGuidesRecord): string {
  return JSON.stringify(guides);
}

export function validateInterviewGuide(guide: InterviewGuide): string | null {
  if (guide.format === 'questions' || guide.format === 'case_and_behavioral') {
    const questions = (guide.questions ?? []).map((q) => q.trim()).filter(Boolean);
    if (questions.length === 0) {
      return guide.format === 'case_and_behavioral'
        ? 'Add at least one behavioral question.'
        : 'Add at least one interview question.';
    }
  }

  if (guide.format === 'case_study' || guide.format === 'case_and_behavioral') {
    const prompt = guide.caseStudy?.prompt?.trim();
    if (!prompt) {
      return 'Case study prompt is required.';
    }
    const rubric = normalizeInterviewRubric(guide.rubric);
    if (!rubric || rubric.criteria.length === 0) {
      return 'Add at least one evaluation criterion.';
    }
  }

  return null;
}

function formatCaseStudyLines(guide: InterviewGuide): string[] {
  const lines: string[] = [];
  const cs = guide.caseStudy;
  if (!cs) return lines;
  if (cs.title?.trim()) {
    lines.push(cs.title.trim());
    lines.push('');
  }
  lines.push(cs.prompt.trim());
  if (cs.discussionPoints && cs.discussionPoints.length > 0) {
    lines.push('');
    lines.push('Case questions:');
    for (const point of cs.discussionPoints) {
      if (point.trim()) lines.push(`• ${point.trim()}`);
    }
  }
  const rubric = normalizeInterviewRubric(guide.rubric);
  if (rubric) {
    lines.push('');
    lines.push(`Evaluation (1–${rubric.scaleMax}):`);
    const percents = interviewWeightPercents(rubric.criteria);
    rubric.criteria.forEach((criterion, i) => {
      lines.push(`• ${criterion.name} (${percents[i]}%)`);
    });
  }
  return lines;
}

function formatQuestionLines(questions: string[] | undefined): string[] {
  return (questions ?? [])
    .filter((q) => q.trim())
    .map((q, i) => `${i + 1}. ${q.trim()}`);
}

export function formatInterviewGuideForDisplay(guide: InterviewGuide): string {
  const lines: string[] = [];

  if (guide.intro?.trim()) {
    lines.push(guide.intro.trim());
    lines.push('');
  }

  if (guide.format === 'questions') {
    lines.push(...formatQuestionLines(guide.questions));
    return lines.join('\n').trim();
  }

  if (guide.format === 'case_and_behavioral') {
    lines.push('Part 1: Case');
    lines.push('');
    lines.push(...formatCaseStudyLines(guide));
    lines.push('');
    lines.push('Part 2: Behavioral');
    lines.push('');
    lines.push(...formatQuestionLines(guide.questions));
    return lines.join('\n').trim();
  }

  lines.push(...formatCaseStudyLines(guide));
  return lines.join('\n').trim();
}

/** API-safe shape for interviewer views (no internal-only fields). */
export function interviewGuideForApi(
  guide: InterviewGuide | null,
): InterviewGuide | null {
  if (!guide) return null;
  return normalizeGuide(guide);
}

/** Case-packet questions shown as notes-only prompts on the scoring screen. */
export function interviewNoteFieldsFromGuide(guide: InterviewGuide | null): string[] {
  if (!guide) return [];
  if (guide.format !== 'case_study' && guide.format !== 'case_and_behavioral') return [];
  return (guide.caseStudy?.discussionPoints ?? []).map((p) => p.trim()).filter(Boolean);
}

export function interviewScaleMax(guide: InterviewGuide | null): number {
  if (!guide || guide.format === 'questions') return DEFAULT_INTERVIEW_SCALE_MAX;
  return normalizeInterviewRubric(guide.rubric)?.scaleMax ?? DEFAULT_INTERVIEW_SCALE_MAX;
}

export function interviewWeightPercents(criteria: InterviewRubricCriterion[]): number[] {
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) return criteria.map(() => 0);
  const raw = criteria.map((c) => (c.weight / total) * 100);
  const rounded = raw.map((n) => Math.round(n));
  const drift = 100 - rounded.reduce((sum, n) => sum + n, 0);
  if (rounded.length > 0) rounded[rounded.length - 1] += drift;
  return rounded;
}

function rubricScoreFields(guide: InterviewGuide): { fields: string[]; weights: Record<string, number> } {
  const rubric = normalizeInterviewRubric(guide.rubric) ?? defaultInterviewRubric();
  const fields = rubric.criteria.map((c) => c.name);
  const weights: Record<string, number> = {};
  for (const criterion of rubric.criteria) {
    weights[criterion.name] = criterion.weight;
  }
  return { fields, weights };
}

function questionScoreFields(questions: string[] | undefined, fallback: string): string[] {
  const list = (questions ?? []).map((q) => q.trim()).filter(Boolean);
  return list.length > 0 ? list : [fallback];
}

function uniquifyAgainst(existing: string[], fields: string[]): string[] {
  const taken = new Set(existing);
  return fields.map((field) => {
    if (!taken.has(field)) {
      taken.add(field);
      return field;
    }
    let suffix = 2;
    let next = `${field} (${suffix})`;
    while (taken.has(next)) {
      suffix += 1;
      next = `${field} (${suffix})`;
    }
    taken.add(next);
    return next;
  });
}

export function interviewScoreFieldGroups(
  guide: InterviewGuide | null,
): InterviewScoreFieldGroup[] {
  if (!guide) {
    return [{ key: 'overall', label: '', fields: ['Overall assessment'] }];
  }

  if (guide.format === 'questions') {
    return [
      {
        key: 'questions',
        label: '',
        fields: questionScoreFields(guide.questions, 'Overall assessment'),
      },
    ];
  }

  const { fields: caseFields, weights } = rubricScoreFields(guide);

  if (guide.format === 'case_study') {
    return [{ key: 'case', label: 'Evaluation', fields: caseFields, weights }];
  }

  const behavioralFields = uniquifyAgainst(
    caseFields,
    questionScoreFields(guide.questions, 'Behavioral assessment'),
  );
  const behavioralWeights: Record<string, number> = {};
  for (const field of behavioralFields) behavioralWeights[field] = 1;

  return [
    { key: 'case', label: 'Part 1: Evaluation', fields: caseFields, weights },
    {
      key: 'behavioral',
      label: 'Part 2: Behavioral',
      fields: behavioralFields,
      weights: behavioralWeights,
    },
  ];
}

/** Scoreable rubric fields for live interview scoring (not application CSV columns). */
export function interviewScoreFieldsFromGuide(guide: InterviewGuide | null): string[] {
  return interviewScoreFieldGroups(guide).flatMap((group) => group.fields);
}

export function interviewWeightedTotal(
  scores: Record<string, number>,
  guide: InterviewGuide | null,
): number | null {
  const groups = interviewScoreFieldGroups(guide);
  const items = groups.flatMap((group) =>
    group.fields.map((field) => ({
      field,
      weight: group.weights?.[field] ?? 1,
    })),
  );
  if (items.length === 0) return null;
  let weighted = 0;
  let weightSum = 0;
  for (const item of items) {
    const score = scores[item.field];
    if (score === undefined) return null;
    weighted += score * item.weight;
    weightSum += item.weight;
  }
  if (weightSum <= 0) return null;
  return Math.round((weighted / weightSum) * 1000) / 1000;
}

export function defaultInterviewGuideFormat(
  teamName: string,
  stage: InterviewGuideStage,
): InterviewGuideFormat {
  if (teamName === 'Strategy') {
    return stage === 'first_round' ? 'case_study' : 'case_and_behavioral';
  }
  return 'questions';
}

export function applyTeamInterviewGuideDefaults(
  teamName: string,
  guides: InterviewGuidesRecord,
): InterviewGuidesRecord {
  if (teamName === 'Design') {
    const defaults = designDefaultGuides();
    return {
      first_round: mergeGuideWithDefault(guides.first_round, defaults.first_round),
      final_round: null,
    };
  }

  if (teamName !== 'Strategy') return guides;

  const defaults = strategyDefaultGuides();

  return {
    first_round: mergeGuideWithDefault(guides.first_round, defaults.first_round),
    final_round: mergeGuideWithDefault(guides.final_round, defaults.final_round),
  };
}

export function teamUsesCasePdf(teamName: string): boolean {
  return teamName === 'Strategy';
}

function mergeGuideWithDefault(
  saved: InterviewGuide | null,
  fallback: InterviewGuide | null,
): InterviewGuide | null {
  if (!fallback) return saved;
  if (!saved) return fallback;

  const savedPoints = (saved.caseStudy?.discussionPoints ?? []).filter((p) => p.trim());
  const savedQuestions = (saved.questions ?? []).filter((q) => q.trim());
  const missingCaseQuestions =
    (fallback.format === 'case_study' || fallback.format === 'case_and_behavioral') &&
    savedPoints.length === 0;
  const missingBehavioral =
    fallback.format === 'case_and_behavioral' && savedQuestions.length === 0;
  const missingRubric =
    (fallback.format === 'case_study' || fallback.format === 'case_and_behavioral') &&
    !normalizeInterviewRubric(saved.rubric);

  if (missingCaseQuestions || missingBehavioral) {
    return {
      ...fallback,
      intro: saved.intro ?? fallback.intro,
      casePdfUrl: saved.casePdfUrl ?? fallback.casePdfUrl,
      rubric: normalizeInterviewRubric(saved.rubric) ?? fallback.rubric,
    };
  }

  let next = saved;
  if (!saved.casePdfUrl && fallback.casePdfUrl) {
    next = { ...next, casePdfUrl: fallback.casePdfUrl };
  }
  if (missingRubric && fallback.rubric) {
    next = { ...next, rubric: fallback.rubric };
  }
  return next;
}

export function interviewStageSetupCopy(
  teamName: string,
  stage: InterviewGuideStage,
): { label: string; hint: string | null } {
  if (teamName === 'Design') {
    return stage === 'first_round'
      ? { label: 'Interview', hint: 'Questions-only format, no case PDF.' }
      : { label: 'Final Round (Individual)', hint: null };
  }
  if (stage === 'first_round') {
    return { label: 'First Round (Group)', hint: null };
  }
  return { label: 'Final Round (Individual)', hint: null };
}
