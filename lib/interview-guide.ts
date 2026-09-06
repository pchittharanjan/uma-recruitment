import { rewriteLegacyInterviewIntro, strategyDefaultGuides } from '@/lib/strategy-interview';
import { designDefaultGuides } from '@/lib/design-interview';
import { eventsDefaultGuides } from '@/lib/events-interview';

export type InterviewGuideFormat = 'questions' | 'case_study' | 'case_and_behavioral';
export type InterviewGuideStage = 'first_round' | 'final_round';

export type InterviewRubricCriterion = {
  name: string;
  /** Share within its category (or of the whole rubric when flat). */
  weight: number;
  /** Optional grading prompt shown under the criterion name. */
  description?: string;
};

export type InterviewRubricCategory = {
  name: string;
  /** Share of this rubric part (categories must sum to 100). */
  weight: number;
  criteria: InterviewRubricCriterion[];
};

export type InterviewRubric = {
  /** Highest score interviewers can give (inclusive). Default 5. */
  scaleMax: number;
  /**
   * Flat leaf criteria with absolute shares of the rubric (sum 100).
   * Always kept in sync when `categories` is set — used for scoring math.
   */
  criteria: InterviewRubricCriterion[];
  /**
   * Nested categories (e.g. Supreme Case 60% → Q1–Q4). When present and non-empty,
   * this is the source of truth for setup UI; `criteria` is the flattened absolute shares.
   */
  categories?: InterviewRubricCategory[];
};

export interface InterviewGuide {
  format: InterviewGuideFormat;
  intro?: string;
  /** Public path to the case PDF shown during scoring, e.g. `/interview-cases/strategy-group.pdf`. */
  casePdfUrl?: string;
  /** Required / always-asked interview questions (behavioral or standalone). */
  questions?: string[];
  /**
   * Optional question bank for case_and_behavioral interviews.
   * Interviewers pick from these at random — notes only, not scored.
   */
  questionBank?: string[];
  caseStudy?: {
    title?: string;
    prompt: string;
    /** Case-packet questions. Interviewers take notes only — they do not score these. */
    discussionPoints?: string[];
  };
  /** Scored evaluation for the case portion (Part 1). */
  rubric?: InterviewRubric;
  /** Scored evaluation for the behavioral portion (Part 2). When set, interviewers advance case → behavioral in order. */
  behavioralRubric?: InterviewRubric;
}

export type InterviewGuidesRecord = Record<InterviewGuideStage, InterviewGuide | null>;

export type InterviewScoreCategoryBlock = {
  name: string;
  /** Category share of this scored part (percent). */
  weightPercent: number;
  fields: string[];
  /** Within-category shares aligned with `fields`. */
  fieldWeightPercents: number[];
  /** Optional prompts aligned with `fields`. */
  descriptions?: Array<string | undefined>;
};

export type InterviewScoreFieldGroup = {
  key: 'case' | 'behavioral' | 'questions' | 'overall';
  label: string;
  fields: string[];
  /** Relative weights keyed by field name. Missing keys are treated as 1. */
  weights?: Record<string, number>;
  /** Nested category headers for interviewer UI (optional). */
  categories?: InterviewScoreCategoryBlock[];
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
  if (!trimmed) return undefined;

  if (trimmed.startsWith('/interview-cases/')) {
    if (trimmed.includes('..') || trimmed.includes('//', 1)) return undefined;
    return trimmed;
  }

  // Uploaded case PDFs on Vercel Blob (public URLs).
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return undefined;
    if (!/\.blob\.vercel-storage\.com$/i.test(url.hostname)) return undefined;
    if (!url.pathname.toLowerCase().endsWith('.pdf')) return undefined;
    return trimmed;
  } catch {
    return undefined;
  }
}

export function emptyInterviewRubric(): InterviewRubric {
  const criteria = [{ name: '', weight: 100 }];
  return {
    scaleMax: DEFAULT_INTERVIEW_SCALE_MAX,
    criteria,
    categories: [{ name: '', weight: 100, criteria: [{ name: '', weight: 100 }] }],
  };
}

function defaultInterviewRubric(): InterviewRubric {
  const criteria = [{ name: 'Overall assessment', weight: 100 }];
  return {
    scaleMax: DEFAULT_INTERVIEW_SCALE_MAX,
    criteria,
    categories: [
      { name: 'Evaluation', weight: 100, criteria: [{ name: 'Overall assessment', weight: 100 }] },
    ],
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
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function normalizeCriterion(raw: unknown): InterviewRubricCriterion | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as { name?: unknown; weight?: unknown; description?: unknown };
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!name) return null;
  // Do not trim description here — trailing spaces must survive controlled inputs while typing.
  const description =
    typeof row.description === 'string' && row.description.length > 0
      ? row.description
      : undefined;
  return { name, weight: normalizeWeight(row.weight), ...(description ? { description } : {}) };
}

function normalizeCategory(raw: unknown): InterviewRubricCategory | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as { name?: unknown; weight?: unknown; criteria?: unknown };
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!name) return null;
  const criteriaRaw = Array.isArray(row.criteria) ? row.criteria : [];
  const criteria: InterviewRubricCriterion[] = [];
  for (const item of criteriaRaw) {
    const criterion = normalizeCriterion(item);
    if (criterion) criteria.push(criterion);
  }
  if (criteria.length === 0) return null;
  return { name, weight: normalizeWeight(row.weight), criteria };
}

/** Flatten category × within-category shares into absolute rubric shares that sum to 100. */
export function flattenRubricCategories(
  categories: InterviewRubricCategory[],
): InterviewRubricCriterion[] {
  const leaves: InterviewRubricCriterion[] = [];
  for (const category of categories) {
    const within = interviewWeightPercents(category.criteria);
    category.criteria.forEach((criterion, i) => {
      const share = Math.round(((category.weight * (within[i] ?? 0)) / 100) * 100) / 100;
      leaves.push({
        name: criterion.name,
        weight: share,
        ...(criterion.description ? { description: criterion.description } : {}),
      });
    });
  }
  if (leaves.length === 0) return leaves;
  const total = criteriaShareTotal(leaves);
  if (total === 100) return leaves;
  if (total <= 0) {
    const equal = interviewWeightPercents(leaves.map((c) => ({ ...c, weight: 1 })));
    return leaves.map((c, i) => ({ ...c, weight: equal[i] ?? 0 }));
  }
  const scaled = interviewWeightPercents(leaves);
  return leaves.map((c, i) => ({ ...c, weight: scaled[i] ?? 0 }));
}

/**
 * Categories for editing: use saved categories, or wrap flat criteria in one "Evaluation" bucket.
 */
export function rubricCategoriesForEdit(rubric: InterviewRubric): InterviewRubricCategory[] {
  if (rubric.categories && rubric.categories.length > 0) {
    return rubric.categories.map((category) => ({
      name: category.name,
      weight: category.weight,
      criteria:
        category.criteria.length > 0
          ? category.criteria.map((c) => ({ ...c }))
          : [{ name: '', weight: 100 }],
    }));
  }
  const criteria =
    rubric.criteria.length > 0
      ? rubric.criteria.map((c) => ({ ...c }))
      : [{ name: '', weight: 100 }];
  return [{ name: 'Evaluation', weight: 100, criteria: criteriaAsPercentShares(criteria) }];
}

/** Rebuild rubric from category editor state (keeps flat criteria in sync). */
export function rubricFromCategories(
  scaleMax: number,
  categories: InterviewRubricCategory[],
): InterviewRubric {
  const draft = categories.map((category) => ({
    name: category.name,
    weight: Number.isFinite(category.weight) && category.weight > 0 ? category.weight : 0,
    criteria:
      category.criteria.length > 0
        ? category.criteria.map((c) => ({
            name: c.name,
            weight: Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 0,
            // Keep trailing spaces while typing; trim only for the scored/saved leaf list below.
            ...(c.description != null && c.description !== ''
              ? { description: c.description }
              : {}),
          }))
        : [{ name: '', weight: 100 }],
  }));

  const complete = draft
    .map((category) => ({
      ...category,
      name: category.name.trim(),
      criteria: category.criteria
        .map((c) => ({
          ...c,
          name: c.name.trim(),
          ...(c.description?.trim() ? { description: c.description.trim() } : {}),
        }))
        .filter((c) => c.name),
    }))
    .filter((category) => category.name && category.criteria.length > 0);

  return {
    scaleMax,
    // Keep in-progress empty names so the editor does not drop rows while typing.
    categories: draft,
    criteria:
      complete.length > 0
        ? flattenRubricCategories(complete)
        : [{ name: '', weight: 100 }],
  };
}

function validateRubricShares(rubric: InterviewRubric, label: string): string | null {
  if (rubric.categories && rubric.categories.length > 0) {
    if (criteriaShareTotal(rubric.categories.map((c) => ({ name: c.name, weight: c.weight }))) !== 100) {
      return `${label} category shares must add up to 100%.`;
    }
    const names = new Set<string>();
    for (const category of rubric.categories) {
      if (category.criteria.length === 0) {
        return `Add at least one criterion under “${category.name}”.`;
      }
      if (criteriaShareTotal(category.criteria) !== 100) {
        return `Criteria shares under “${category.name}” must add up to 100%.`;
      }
      for (const criterion of category.criteria) {
        const key = criterion.name.toLowerCase();
        if (names.has(key)) {
          return `Criterion names must be unique (duplicate: “${criterion.name}”).`;
        }
        names.add(key);
      }
    }
    return null;
  }
  if (rubric.criteria.length === 0) {
    return `Add at least one ${label.toLowerCase()} criterion.`;
  }
  if (criteriaShareTotal(rubric.criteria) !== 100) {
    return `${label} shares must add up to 100%.`;
  }
  return null;
}

export function normalizeInterviewRubric(raw: unknown): InterviewRubric | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as { scaleMax?: unknown; criteria?: unknown; categories?: unknown };
  const scaleMax = clampScaleMax(obj.scaleMax);

  const categoriesRaw = Array.isArray(obj.categories) ? obj.categories : [];
  const categories: InterviewRubricCategory[] = [];
  for (const item of categoriesRaw) {
    const category = normalizeCategory(item);
    if (category) categories.push(category);
  }

  if (categories.length > 0) {
    return {
      scaleMax,
      categories,
      criteria: flattenRubricCategories(categories),
    };
  }

  const criteriaRaw = Array.isArray(obj.criteria) ? obj.criteria : [];
  const criteria: InterviewRubricCriterion[] = [];
  for (const item of criteriaRaw) {
    const criterion = normalizeCriterion(item);
    if (criterion) criteria.push(criterion);
  }
  if (criteria.length === 0) return undefined;
  return { scaleMax, criteria };
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

  const intro = rewriteLegacyInterviewIntro(trimOptional(obj.intro));
  const casePdfUrl = normalizeCasePdfUrl(obj.casePdfUrl);
  const rubric = normalizeInterviewRubric(obj.rubric);
  const behavioralRubric = normalizeInterviewRubric(
    (obj as { behavioralRubric?: unknown }).behavioralRubric,
  );

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
  const questionBank = trimList(obj.questionBank);
  return withDefaultCaseRubric({
    format: 'case_and_behavioral',
    intro,
    casePdfUrl,
    caseStudy,
    questions,
    questionBank: questionBank.length > 0 ? questionBank : undefined,
    rubric,
    behavioralRubric: behavioralRubric ?? undefined,
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
    const rubricError = validateRubricShares(rubric, 'Evaluation');
    if (rubricError) return rubricError;
    if (guide.format === 'case_and_behavioral') {
      const behavioralRubric = normalizeInterviewRubric(guide.behavioralRubric);
      if (behavioralRubric) {
        if (behavioralRubric.criteria.length === 0) {
          return 'Add at least one behavioral evaluation criterion.';
        }
        const behavioralError = validateRubricShares(behavioralRubric, 'Behavioral evaluation');
        if (behavioralError) return behavioralError;
      }
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
    if (rubric.categories && rubric.categories.length > 0) {
      for (const category of rubric.categories) {
        lines.push(`• ${category.name} (${category.weight}%)`);
        const within = interviewWeightPercents(category.criteria);
        category.criteria.forEach((criterion, i) => {
          lines.push(`  – ${criterion.name} (${within[i]}%)`);
        });
      }
    } else {
      const percents = interviewWeightPercents(rubric.criteria);
      rubric.criteria.forEach((criterion, i) => {
        lines.push(`• ${criterion.name} (${percents[i]}%)`);
      });
    }
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
    const bank = interviewQuestionBankFromGuide(guide);
    if (bank.length > 0) {
      lines.push('');
      lines.push('Optional question bank');
      lines.push('');
      lines.push(...formatQuestionLines(bank));
    }
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
  const normalized = normalizeGuide(guide);
  if (!normalized) return null;
  return {
    ...normalized,
    intro: rewriteLegacyInterviewIntro(normalized.intro),
  };
}

/** Case-packet questions shown as notes-only prompts during Part 1. */
export function interviewNoteFieldsFromGuide(guide: InterviewGuide | null): string[] {
  if (!guide) return [];
  if (guide.format !== 'case_study' && guide.format !== 'case_and_behavioral') return [];
  return (guide.caseStudy?.discussionPoints ?? []).map((p) => p.trim()).filter(Boolean);
}

/**
 * Behavioral questions shown as notes-only prompts during Part 2.
 * Only when a separate behavioral rubric is scored — otherwise the questions
 * themselves are the scored fields (with notes) via interviewScoreFieldGroups,
 * and repeating them as notes-only duplicates the UI.
 *
 * Also drops any prompt that is already a scored behavioral field so the same
 * text never appears once as notes-only and again with a rating scale.
 */
export function interviewBehavioralNoteFieldsFromGuide(guide: InterviewGuide | null): string[] {
  if (!guide || guide.format !== 'case_and_behavioral') return [];
  const behavioralRubric = normalizeInterviewRubric(guide.behavioralRubric);
  if (!behavioralRubric || behavioralRubric.criteria.length === 0) return [];
  const scored = new Set(
    interviewScoreFieldGroups(guide)
      .filter((group) => group.key === 'behavioral' || group.key === 'questions')
      .flatMap((group) => group.fields),
  );
  return (guide.questions ?? [])
    .map((q) => q.trim())
    .filter((q) => Boolean(q) && !scored.has(q));
}

/** Optional bank prompts interviewers can pick from (notes only). */
export function interviewQuestionBankFromGuide(guide: InterviewGuide | null): string[] {
  if (!guide || guide.format !== 'case_and_behavioral') return [];
  const required = new Set((guide.questions ?? []).map((q) => q.trim()).filter(Boolean));
  return (guide.questionBank ?? [])
    .map((q) => q.trim())
    .filter((q) => Boolean(q) && !required.has(q));
}

/** True when case and behavioral are separate scored parts the interviewer can switch between. */
export function isPhasedCaseAndBehavioralInterview(guide: InterviewGuide | null): boolean {
  if (!guide || guide.format !== 'case_and_behavioral') return false;
  const groups = interviewScoreFieldGroups(guide);
  return groups.some((g) => g.key === 'case') && groups.some((g) => g.key === 'behavioral');
}

export function interviewPhaseScoreFields(
  guide: InterviewGuide | null,
  phase: 'case' | 'behavioral',
): string[] {
  const groups = interviewScoreFieldGroups(guide);
  const key = phase === 'case' ? 'case' : 'behavioral';
  return groups.find((g) => g.key === key)?.fields ?? [];
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

export function criteriaShareTotal(criteria: InterviewRubricCriterion[]): number {
  return criteria.reduce((sum, c) => {
    const n = c.weight;
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

/** Convert legacy relative weights (e.g. 1,1,1,1) into percent shares that sum to 100. */
export function criteriaAsPercentShares(
  criteria: InterviewRubricCriterion[],
): InterviewRubricCriterion[] {
  if (criteria.length === 0) return criteria;
  const normalized = criteria.map((c) => ({
    name: c.name,
    weight: Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 0,
  }));
  if (criteriaShareTotal(normalized) === 100) return normalized;
  const percents = interviewWeightPercents(
    normalized.map((c) => ({ ...c, weight: c.weight > 0 ? c.weight : 1 })),
  );
  return normalized.map((c, i) => ({ ...c, weight: percents[i] ?? 0 }));
}

function scoreBlocksFromRubric(rubric: InterviewRubric): {
  fields: string[];
  weights: Record<string, number>;
  categories?: InterviewScoreCategoryBlock[];
} {
  const fields = rubric.criteria.map((c) => c.name);
  const weights: Record<string, number> = {};
  for (const criterion of rubric.criteria) {
    weights[criterion.name] = criterion.weight;
  }

  if (rubric.categories && rubric.categories.length > 0) {
    const categoryWeights = interviewWeightPercents(
      rubric.categories.map((c) => ({ name: c.name, weight: c.weight })),
    );
    return {
      fields,
      weights,
      categories: rubric.categories.map((category, index) => ({
        name: category.name,
        weightPercent: categoryWeights[index] ?? category.weight,
        fields: category.criteria.map((c) => c.name),
        fieldWeightPercents: interviewWeightPercents(category.criteria),
        descriptions: category.criteria.map((c) => c.description),
      })),
    };
  }

  return { fields, weights };
}

function rubricScoreFields(guide: InterviewGuide): {
  fields: string[];
  weights: Record<string, number>;
  categories?: InterviewScoreCategoryBlock[];
} {
  const rubric = normalizeInterviewRubric(guide.rubric) ?? defaultInterviewRubric();
  return scoreBlocksFromRubric(rubric);
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

  const { fields: caseFields, weights, categories } = rubricScoreFields(guide);

  if (guide.format === 'case_study') {
    return [{ key: 'case', label: 'Evaluation', fields: caseFields, weights, categories }];
  }

  const behavioralRubric = normalizeInterviewRubric(guide.behavioralRubric);
  if (behavioralRubric && behavioralRubric.criteria.length > 0) {
    const behavioral = scoreBlocksFromRubric(behavioralRubric);
    return [
      { key: 'case', label: 'Part 1: Case evaluation', fields: caseFields, weights, categories },
      {
        key: 'behavioral',
        label: 'Part 2: Behavioral evaluation',
        fields: behavioral.fields,
        weights: behavioral.weights,
        categories: behavioral.categories,
      },
    ];
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
      final_round: mergeGuideWithDefault(guides.final_round, defaults.final_round),
    };
  }

  if (teamName === 'Events') {
    const defaults = eventsDefaultGuides();
    return {
      first_round: mergeGuideWithDefault(guides.first_round, defaults.first_round),
      final_round: mergeGuideWithDefault(guides.final_round, defaults.final_round),
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
  return teamName === 'Strategy' || teamName === 'Events';
}

function isLegacyFlatStrategyCaseRubric(rubric: InterviewGuide['rubric']): boolean {
  if (!rubric || (rubric.categories && rubric.categories.length > 0)) return false;
  const names = (rubric.criteria ?? []).map((c) => c.name.trim().toLowerCase());
  if (names.length < 3 || names.length > 5) return false;
  const joined = names.join(' | ');
  return (
    joined.includes('market sizing') &&
    (joined.includes('gen z') || joined.includes('recommendation'))
  );
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
  const missingBehavioralRubric =
    fallback.format === 'case_and_behavioral' &&
    !normalizeInterviewRubric(saved.behavioralRubric) &&
    Boolean(normalizeInterviewRubric(fallback.behavioralRubric));
  const missingQuestionBank =
    fallback.format === 'case_and_behavioral' &&
    (fallback.questionBank?.length ?? 0) > 0 &&
    (saved.questionBank?.length ?? 0) === 0;
  const missingRubricCategories =
    Boolean(fallback.rubric?.categories?.length) &&
    Boolean(normalizeInterviewRubric(saved.rubric)) &&
    !(saved.rubric?.categories && saved.rubric.categories.length > 0) &&
    isLegacyFlatStrategyCaseRubric(saved.rubric);

  // Older Strategy defaults baked optional bank prompts into required questions.
  const fallbackBank = (fallback.questionBank ?? []).map((q) => q.trim()).filter(Boolean);
  const fallbackBankSet = new Set(fallbackBank);
  const legacyEmbeddedBank =
    fallback.format === 'case_and_behavioral' &&
    fallbackBank.length > 0 &&
    savedQuestions.some((q) => fallbackBankSet.has(q.trim()));

  if (missingCaseQuestions || missingBehavioral) {
    return {
      ...fallback,
      intro: !saved.intro?.trim()
        ? fallback.intro
        : rewriteLegacyInterviewIntro(saved.intro),
      casePdfUrl: saved.casePdfUrl ?? fallback.casePdfUrl,
      rubric: normalizeInterviewRubric(saved.rubric) ?? fallback.rubric,
      behavioralRubric:
        normalizeInterviewRubric(saved.behavioralRubric) ?? fallback.behavioralRubric,
    };
  }

  let next = saved;
  if (!saved.casePdfUrl && fallback.casePdfUrl) {
    next = { ...next, casePdfUrl: fallback.casePdfUrl };
  }
  if (missingRubric && fallback.rubric) {
    next = { ...next, rubric: fallback.rubric };
  } else if (missingRubricCategories && fallback.rubric) {
    // Upgrade flat Strategy defaults to nested categories without wiping custom case copy.
    next = { ...next, rubric: fallback.rubric };
  }
  if (missingBehavioralRubric && fallback.behavioralRubric) {
    next = { ...next, behavioralRubric: fallback.behavioralRubric };
  }
  if (legacyEmbeddedBank) {
    const stripped = savedQuestions.filter((q) => !fallbackBankSet.has(q.trim()));
    const OLD_UMA_MOTIVATION =
      "Considering yesterday's social round, what motivates you to be part of UMA beyond your professional goals?";
    const NEW_UMA_MOTIVATION =
      'What motivates you to be part of UMA beyond your professional goals?';
    const questions = (stripped.length > 0 ? stripped : fallback.questions ?? []).map((q) =>
      q.trim() === OLD_UMA_MOTIVATION ? NEW_UMA_MOTIVATION : q,
    );
    next = {
      ...next,
      questions,
      questionBank:
        (saved.questionBank?.length ?? 0) > 0
          ? saved.questionBank
          : [...fallbackBank],
    };
  } else if (missingQuestionBank && fallback.questionBank) {
    next = { ...next, questionBank: [...fallback.questionBank] };
  }

  // Keep required prompts and the optional bank disjoint even if an admin saved overlap.
  if (next.format === 'case_and_behavioral') {
    const bankSet = new Set((next.questionBank ?? []).map((q) => q.trim()).filter(Boolean));
    if (bankSet.size > 0) {
      const dedupedQuestions = (next.questions ?? [])
        .map((q) => q.trim())
        .filter((q) => Boolean(q) && !bankSet.has(q));
      if (dedupedQuestions.length !== (next.questions ?? []).length) {
        next = {
          ...next,
          questions:
            dedupedQuestions.length > 0 ? dedupedQuestions : fallback.questions ?? dedupedQuestions,
        };
      }
    }
  }
  if (fallback.intro && !saved.intro?.trim()) {
    next = { ...next, intro: fallback.intro };
  } else if (saved.intro?.trim()) {
    const rewritten = rewriteLegacyInterviewIntro(saved.intro);
    if (rewritten !== saved.intro.trim()) {
      next = { ...next, intro: rewritten };
    }
  }
  return next;
}

export function interviewStageSetupCopy(
  teamName: string,
  stage: InterviewGuideStage,
): { label: string; hint: string | null } {
  if (teamName === 'Design') {
    return stage === 'first_round'
      ? { label: 'Interview', hint: 'Questions-only format, no case PDF. Design has one interview round.' }
      : { label: 'Final Round (unused)', hint: 'Design skips Final Round.' };
  }
  if (stage === 'first_round') {
    return { label: 'First Round (Group)', hint: null };
  }
  return { label: 'Final Round (Individual)', hint: null };
}
