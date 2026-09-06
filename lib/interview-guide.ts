import { rewriteLegacyInterviewIntro, strategyDefaultGuides } from '@/lib/strategy-interview';
import { designDefaultGuides } from '@/lib/design-interview';
import { eventsDefaultGuides } from '@/lib/events-interview';

export type InterviewGuideFormat = 'questions' | 'case_study' | 'case_and_behavioral';
export type InterviewGuideStage = 'first_round' | 'final_round';

/** Labeled group of case-packet note prompts (warm-up vs full case, etc.). */
export type InterviewDiscussionSection = {
  title: string;
  /** Optional framing shown under the section title in Case notes (e.g. case brief). */
  description?: string;
  points: string[];
};

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
    /**
     * Optional labeled groups for interviewer notes (e.g. warm-up vs full case).
     * When set, the notes UI shows section headers; note keys remain the point strings.
     * Flattened into `discussionPoints` on normalize when that list is empty.
     */
    discussionSections?: InterviewDiscussionSection[];
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

function normalizeDiscussionSections(raw: unknown): InterviewDiscussionSection[] {
  if (!Array.isArray(raw)) return [];
  const sections: InterviewDiscussionSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as { title?: unknown; description?: unknown; points?: unknown };
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    const points = trimList(obj.points);
    if (!title || points.length === 0) continue;
    const description =
      typeof obj.description === 'string' && obj.description.trim()
        ? obj.description.trim()
        : undefined;
    sections.push({ title, points, ...(description ? { description } : {}) });
  }
  return sections;
}

function flattenDiscussionSections(sections: InterviewDiscussionSection[]): string[] {
  return sections.flatMap((section) => section.points);
}

function normalizeCaseStudy(raw: unknown): InterviewGuide['caseStudy'] | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as {
    title?: unknown;
    prompt?: unknown;
    discussionPoints?: unknown;
    discussionSections?: unknown;
  };
  const prompt = typeof obj.prompt === 'string' ? obj.prompt.trim() : '';
  if (!prompt) return null;
  const discussionSections = normalizeDiscussionSections(obj.discussionSections);
  let discussionPoints = trimList(obj.discussionPoints);
  if (discussionPoints.length === 0 && discussionSections.length > 0) {
    discussionPoints = flattenDiscussionSections(discussionSections);
  }
  return {
    title: trimOptional(typeof obj.title === 'string' ? obj.title : undefined),
    prompt,
    discussionPoints: discussionPoints.length > 0 ? discussionPoints : undefined,
    discussionSections: discussionSections.length > 0 ? discussionSections : undefined,
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
  const noteSections = interviewNoteSectionsFromGuide(guide);
  if (noteSections.length > 0) {
    lines.push('');
    lines.push('Case questions:');
    for (const section of noteSections) {
      if (section.title) {
        lines.push('');
        lines.push(section.title);
      }
      for (const point of section.points) {
        if (point.trim()) lines.push(`• ${point.trim()}`);
      }
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
  const sections = guide.caseStudy?.discussionSections;
  if (sections && sections.length > 0) {
    return flattenDiscussionSections(sections);
  }
  return (guide.caseStudy?.discussionPoints ?? []).map((p) => p.trim()).filter(Boolean);
}

/**
 * Case-packet note prompts grouped into labeled sections when the guide defines them.
 * Falls back to a single untitled section so callers can always map over sections.
 */
export function interviewNoteSectionsFromGuide(
  guide: InterviewGuide | null,
): InterviewDiscussionSection[] {
  if (!guide) return [];
  if (guide.format !== 'case_study' && guide.format !== 'case_and_behavioral') return [];
  const sections = normalizeDiscussionSections(guide.caseStudy?.discussionSections);
  if (sections.length > 0) return sections;
  const points = interviewNoteFieldsFromGuide(guide);
  if (points.length === 0) return [];
  return [{ title: '', points }];
}

/**
 * Behavioral questions shown as notes-only prompts during Part 2.
 *
 * - With a behavioral rubric: required questions are notes; criteria are scored.
 * - Without a behavioral rubric (e.g. Strategy final): required questions are
 *   notes-only — they are not turned into 1–5 score fields.
 *
 * Drops any prompt that is already a scored behavioral field so the same text
 * never appears once as notes-only and again with a rating scale.
 */
export function interviewBehavioralNoteFieldsFromGuide(guide: InterviewGuide | null): string[] {
  if (!guide || guide.format !== 'case_and_behavioral') return [];
  const scored = new Set(
    interviewScoreFieldGroups(guide)
      .filter((group) => group.key === 'behavioral' || group.key === 'questions')
      .flatMap((group) => group.fields),
  );
  return (guide.questions ?? [])
    .map((q) => q.trim())
    .filter((q) => Boolean(q) && !scored.has(q));
}

/** Case packet + behavioral prompts that persist as note-only score rows. */
export function interviewPersistableNoteFieldsFromGuide(
  guide: InterviewGuide | null,
  extraNoteKeys: string[] = [],
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const scored = new Set(interviewScoreFieldsFromGuide(guide));
  const push = (field: string) => {
    const trimmed = field.trim();
    if (!trimmed || seen.has(trimmed) || scored.has(trimmed)) return;
    seen.add(trimmed);
    keys.push(trimmed);
  };
  for (const field of interviewNoteFieldsFromGuide(guide)) push(field);
  for (const field of interviewBehavioralNoteFieldsFromGuide(guide)) push(field);
  for (const field of interviewQuestionBankFromGuide(guide)) push(field);
  for (const field of extraNoteKeys) push(field);
  return keys;
}

/** Optional bank prompts interviewers can pick from (notes only). */
export function interviewQuestionBankFromGuide(guide: InterviewGuide | null): string[] {
  if (!guide || guide.format !== 'case_and_behavioral') return [];
  const required = new Set((guide.questions ?? []).map((q) => q.trim()).filter(Boolean));
  return (guide.questionBank ?? [])
    .map((q) => q.trim())
    .filter((q) => Boolean(q) && !required.has(q));
}

/** True when case | behavioral tabs make sense (scored case + scored or notes-only behavioral). */
export function isPhasedCaseAndBehavioralInterview(guide: InterviewGuide | null): boolean {
  if (!guide || guide.format !== 'case_and_behavioral') return false;
  const groups = interviewScoreFieldGroups(guide);
  if (!groups.some((g) => g.key === 'case')) return false;
  if (groups.some((g) => g.key === 'behavioral')) return true;
  // Notes-only behavioral: still show the Case | Behavioral toggle.
  return (
    interviewBehavioralNoteFieldsFromGuide(guide).length > 0 ||
    interviewQuestionBankFromGuide(guide).length > 0
  );
}

export function interviewPhaseScoreFields(
  guide: InterviewGuide | null,
  phase: 'case' | 'behavioral',
): string[] {
  const groups = interviewScoreFieldGroups(guide);
  const key = phase === 'case' ? 'case' : 'behavioral';
  return groups.find((g) => g.key === key)?.fields ?? [];
}

export function isInterviewPhaseFullyScored(
  scores: Record<string, number | undefined>,
  fields: string[],
): boolean {
  return fields.length > 0 && fields.every((field) => scores[field] !== undefined);
}

/** Primary footer CTA for phased case/behavioral interviews: switch unfinished side, else submit. */
export type PhasedInterviewPrimaryAction =
  | { kind: 'submit'; label: 'Submit →' }
  | { kind: 'switch'; target: 'case' | 'behavioral'; label: string };

export function phasedInterviewPrimaryAction(
  guide: InterviewGuide | null,
  phase: 'case' | 'behavioral',
  scores: Record<string, number | undefined>,
): PhasedInterviewPrimaryAction {
  const caseFields = interviewPhaseScoreFields(guide, 'case');
  const behavioralFields = interviewPhaseScoreFields(guide, 'behavioral');
  const caseDone = isInterviewPhaseFullyScored(scores, caseFields);
  // Notes-only behavioral (no score fields) is never “done” for CTA purposes — keep
  // Switch to Behavioral while on Case, and only unlock Submit on the Behavioral tab
  // once case criteria are scored. isInterviewPhaseFullyScored already rejects empty lists.
  const behavioralHasScores = behavioralFields.length > 0;
  const behavioralDone = behavioralHasScores
    ? isInterviewPhaseFullyScored(scores, behavioralFields)
    : false;

  if (caseDone && behavioralDone) {
    return { kind: 'submit', label: 'Submit →' };
  }
  if (caseDone && !behavioralDone) {
    // Scored behavioral incomplete, or notes-only behavioral: submit only from Behavioral.
    return phase === 'behavioral'
      ? { kind: 'submit', label: 'Submit →' }
      : { kind: 'switch', target: 'behavioral', label: 'Switch to Behavioral' };
  }
  if (behavioralDone && !caseDone) {
    return phase === 'case'
      ? { kind: 'submit', label: 'Submit →' }
      : { kind: 'switch', target: 'case', label: 'Switch to Case' };
  }
  // Neither side fully scored (includes notes-only behavioral + incomplete case).
  return phase === 'case'
    ? { kind: 'switch', target: 'behavioral', label: 'Switch to Behavioral' }
    : { kind: 'switch', target: 'case', label: 'Switch to Case' };
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

  // Flat rubrics: still expose a single untitled block so criterion descriptions
  // and within-rubric weight percents render in the interviewer UI.
  return {
    fields,
    weights,
    categories: [
      {
        name: '',
        weightPercent: 100,
        fields,
        fieldWeightPercents: interviewWeightPercents(rubric.criteria),
        descriptions: rubric.criteria.map((c) => c.description),
      },
    ],
  };
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

  // No behavioral rubric: case is the only scored part; questions are notes-only.
  return [
    {
      key: 'case',
      label: 'Part 1: Case evaluation',
      fields: caseFields,
      weights,
      categories,
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
  const firstRound = mergeGuideWithDefault(guides.first_round, defaults.first_round);
  let finalRound = mergeGuideWithDefault(guides.final_round, defaults.final_round);

  // Hard upgrade path for Strategy final_round: never leave the old HeyTea
  // 3-criterion case rubric or a scored behavioral rubric in the served guide.
  if (finalRound && defaults.final_round) {
    const finalRubric =
      normalizeInterviewRubric(finalRound.rubric) ?? finalRound.rubric;
    if (
      defaults.final_round.rubric &&
      isLegacyStrategyFinalCaseRubric(finalRubric)
    ) {
      finalRound = { ...finalRound, rubric: defaults.final_round.rubric };
    }
    if (
      !normalizeInterviewRubric(defaults.final_round.behavioralRubric) &&
      normalizeInterviewRubric(finalRound.behavioralRubric)
    ) {
      finalRound = { ...finalRound };
      delete finalRound.behavioralRubric;
    }
  }

  return {
    first_round: firstRound,
    final_round: finalRound,
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

/** Leaf criterion names from flat criteria, or category leaves when flat list is empty. */
function rubricLeafNames(rubric: InterviewGuide['rubric']): string[] {
  if (!rubric) return [];
  const fromCriteria = (rubric.criteria ?? [])
    .map((c) => c.name.trim())
    .filter(Boolean);
  if (fromCriteria.length > 0) return fromCriteria;
  const fromCategories: string[] = [];
  for (const category of rubric.categories ?? []) {
    for (const criterion of category.criteria ?? []) {
      const name = criterion.name.trim();
      if (name) fromCategories.push(name);
    }
  }
  return fromCategories;
}

/**
 * Prior Strategy final-round case defaults: Campaign Math / Retention / In-Store vs Delivery.
 * Aggressive: any old HeyTea criterion name is enough to force an upgrade.
 */
function isLegacyStrategyFinalCaseRubric(rubric: InterviewGuide['rubric']): boolean {
  if (!rubric) return false;
  const names = rubricLeafNames(rubric).map((n) => n.toLowerCase());
  if (names.length === 0) return false;
  const joined = names.join(' | ');

  // Explicit retired HeyTea criterion titles (substring match on full name).
  if (
    joined.includes('retention without discounting') ||
    joined.includes('in-store vs') ||
    (joined.includes('in-store') && joined.includes('delivery'))
  ) {
    return true;
  }

  // Old 3-criterion Campaign Math set (even if titles were lightly edited).
  if (
    names.length === 3 &&
    joined.includes('campaign math') &&
    (joined.includes('retention') ||
      joined.includes('in-store') ||
      joined.includes('delivery'))
  ) {
    return true;
  }

  // First-round Supreme criteria mistakenly on final (Market Sizing instead of Campaign Math).
  if (joined.includes('market sizing')) return true;

  return false;
}

function criterionNamesKey(rubric: InterviewGuide['rubric']): string {
  return rubricLeafNames(rubric)
    .map((c) => c.toLowerCase())
    .join(' | ');
}

/** Old Events final-round defaults used a RESET resale case before StudySync. */
function isLegacyEventsResetGuide(saved: InterviewGuide): boolean {
  const title = saved.caseStudy?.title ?? '';
  const prompt = saved.caseStudy?.prompt ?? '';
  const intro = saved.intro ?? '';
  const points = (saved.caseStudy?.discussionPoints ?? []).join('\n');
  const blob = `${title}\n${prompt}\n${intro}\n${points}`;
  return /\bRESET\b/i.test(blob);
}

/** Prior interviewer-facing meta summary before the candidate-facing StudySync brief. */
function isLegacyEventsStudySyncMetaPrompt(prompt: string): boolean {
  return /Candidates get ~2 minutes to read the packet/i.test(prompt);
}

function isEventsWarmupPoint(point: string): boolean {
  const trimmed = point.trim();
  return (
    /^Warm-Up Case \(Boba Launch/i.test(trimmed) || /campus boba shop is launching/i.test(trimmed)
  );
}

function discussionHasEventsWarmup(
  sections: InterviewDiscussionSection[] | undefined,
  points: string[] | undefined,
): boolean {
  if (sections?.some((section) => /warm\s*-?\s*up/i.test(section.title))) return true;
  if (sections?.some((section) => section.points.some(isEventsWarmupPoint))) return true;
  return (points ?? []).some(isEventsWarmupPoint);
}

function looksLikeEventsStudySyncPacket(points: string[]): boolean {
  return (
    points.some((p) => /^Task 1 — Trend/i.test(p.trim())) &&
    points.some((p) => /^Task 2 — The Activation/i.test(p.trim())) &&
    points.some((p) => /^Task 3 — Post Event/i.test(p.trim()))
  );
}

function listsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, i) => item === b[i]);
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
  const dropBehavioralRubric =
    fallback.format === 'case_and_behavioral' &&
    !normalizeInterviewRubric(fallback.behavioralRubric) &&
    Boolean(normalizeInterviewRubric(saved.behavioralRubric));
  const missingQuestionBank =
    fallback.format === 'case_and_behavioral' &&
    (fallback.questionBank?.length ?? 0) > 0 &&
    (saved.questionBank?.length ?? 0) === 0;
  const savedRubricNormalized = normalizeInterviewRubric(saved.rubric);
  const fallbackRubricNormalized = normalizeInterviewRubric(fallback.rubric);
  const missingRubricCategories =
    Boolean(fallback.rubric?.categories?.length) &&
    Boolean(savedRubricNormalized) &&
    !(saved.rubric?.categories && saved.rubric.categories.length > 0) &&
    isLegacyFlatStrategyCaseRubric(saved.rubric);
  const legacyStrategyFinalCaseRubric =
    Boolean(savedRubricNormalized) &&
    Boolean(fallbackRubricNormalized) &&
    isLegacyStrategyFinalCaseRubric(savedRubricNormalized ?? saved.rubric) &&
    criterionNamesKey(savedRubricNormalized ?? saved.rubric) !==
      criterionNamesKey(fallbackRubricNormalized ?? fallback.rubric);

  // Older Strategy defaults baked optional bank prompts into required questions.
  const fallbackBank = (fallback.questionBank ?? []).map((q) => q.trim()).filter(Boolean);
  const fallbackBankSet = new Set(fallbackBank);
  const legacyEmbeddedBank =
    fallback.format === 'case_and_behavioral' &&
    fallbackBank.length > 0 &&
    savedQuestions.some((q) => fallbackBankSet.has(q.trim()));

  if (missingCaseQuestions || missingBehavioral) {
    let rubric = savedRubricNormalized ?? fallback.rubric;
    if (
      rubric &&
      fallback.rubric &&
      isLegacyStrategyFinalCaseRubric(rubric) &&
      criterionNamesKey(rubric) !== criterionNamesKey(fallback.rubric)
    ) {
      rubric = fallback.rubric;
    }
    return {
      ...fallback,
      intro: !saved.intro?.trim()
        ? fallback.intro
        : rewriteLegacyInterviewIntro(saved.intro),
      casePdfUrl: saved.casePdfUrl ?? fallback.casePdfUrl,
      rubric,
      behavioralRubric: dropBehavioralRubric
        ? undefined
        : normalizeInterviewRubric(saved.behavioralRubric) ?? fallback.behavioralRubric,
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
  } else if (legacyStrategyFinalCaseRubric && fallback.rubric) {
    // Upgrade old HeyTea 3-criterion (or Market Sizing) case rubric to Supreme-aligned categories.
    next = { ...next, rubric: fallback.rubric };
  }
  if (dropBehavioralRubric) {
    // Strategy final: drop scored behavioral rubric; questions stay notes-only.
    next = { ...next };
    delete next.behavioralRubric;
  } else if (missingBehavioralRubric && fallback.behavioralRubric) {
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

  // Events: replace legacy RESET case packet with StudySync defaults.
  if (
    isLegacyEventsResetGuide(next) &&
    fallback.caseStudy &&
    /StudySync/i.test(fallback.caseStudy.title ?? fallback.caseStudy.prompt)
  ) {
    next = {
      ...next,
      intro: fallback.intro ?? next.intro,
      caseStudy: fallback.caseStudy,
      questions:
        (fallback.questions?.length ?? 0) > 0 ? [...(fallback.questions ?? [])] : next.questions,
      rubric: fallback.rubric ?? next.rubric,
      behavioralRubric: fallback.behavioralRubric ?? next.behavioralRubric,
    };
  } else if (
    fallback.caseStudy?.discussionSections &&
    fallback.caseStudy.discussionSections.length > 0 &&
    !(next.caseStudy?.discussionSections && next.caseStudy.discussionSections.length > 0) &&
    next.caseStudy
  ) {
    // Attach section labels when saved points still match (or are the prior flat StudySync packet).
    const fallbackFlat = flattenDiscussionSections(fallback.caseStudy.discussionSections);
    const nextFlat = (next.caseStudy.discussionPoints ?? []).map((p) => p.trim()).filter(Boolean);
    const looksLikeStudySyncFlat =
      looksLikeEventsStudySyncPacket(nextFlat) &&
      (discussionHasEventsWarmup(undefined, nextFlat) ||
        // Flat list is only the three StudySync tasks (warm-up dropped).
        nextFlat.every((p) => /^Task [123] —/.test(p.trim())));
    if (listsEqual(nextFlat, fallbackFlat) || looksLikeStudySyncFlat) {
      next = {
        ...next,
        caseStudy: {
          ...next.caseStudy,
          title: next.caseStudy.title?.includes('StudySync')
            ? next.caseStudy.title
            : fallback.caseStudy.title ?? next.caseStudy.title,
          prompt:
            isLegacyEventsStudySyncMetaPrompt(next.caseStudy.prompt) ||
            !/StudySync/i.test(next.caseStudy.prompt)
              ? fallback.caseStudy.prompt
              : next.caseStudy.prompt,
          discussionSections: fallback.caseStudy.discussionSections,
          discussionPoints: fallbackFlat,
        },
      };
    }
  } else if (
    next.caseStudy &&
    fallback.caseStudy?.discussionSections &&
    next.caseStudy.discussionSections &&
    next.caseStudy.discussionSections.length > 0
  ) {
    // Upgrade StudySync brief / restore missing warm-up onto existing sectioned Events guides.
    const needsPromptUpgrade = isLegacyEventsStudySyncMetaPrompt(next.caseStudy.prompt);
    const nextSections = normalizeDiscussionSections(next.caseStudy.discussionSections);
    const fallbackSections = normalizeDiscussionSections(fallback.caseStudy.discussionSections);
    const nextFlat = flattenDiscussionSections(nextSections);
    const fallbackHasWarmup = discussionHasEventsWarmup(fallbackSections, undefined);
    const nextMissingWarmup =
      fallbackHasWarmup &&
      looksLikeEventsStudySyncPacket(nextFlat) &&
      !discussionHasEventsWarmup(nextSections, next.caseStudy.discussionPoints);

    if (nextMissingWarmup) {
      const fallbackFlat = flattenDiscussionSections(fallbackSections);
      next = {
        ...next,
        caseStudy: {
          ...next.caseStudy,
          prompt:
            needsPromptUpgrade || !/StudySync/i.test(next.caseStudy.prompt)
              ? fallback.caseStudy.prompt
              : next.caseStudy.prompt,
          discussionSections: fallbackSections,
          discussionPoints: fallbackFlat,
        },
      };
    } else {
      const mergedSections = nextSections.map((section) => {
        if (section.description?.trim()) return section;
        const match = fallbackSections.find(
          (fallbackSection) =>
            fallbackSection.title === section.title &&
            listsEqual(fallbackSection.points, section.points),
        );
        if (!match?.description) return section;
        return { ...section, description: match.description };
      });
      const attachedDescription = mergedSections.some(
        (section, i) =>
          Boolean(section.description?.trim()) &&
          !Boolean(nextSections[i]?.description?.trim()),
      );
      if (needsPromptUpgrade || attachedDescription) {
        next = {
          ...next,
          caseStudy: {
            ...next.caseStudy,
            ...(needsPromptUpgrade ? { prompt: fallback.caseStudy.prompt } : {}),
            discussionSections: mergedSections,
          },
        };
      }
    }
  }

  if (fallback.intro && !saved.intro?.trim()) {
    next = { ...next, intro: fallback.intro };
  } else if (next.intro?.trim()) {
    const rewritten = rewriteLegacyInterviewIntro(next.intro);
    if (rewritten !== next.intro.trim()) {
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
