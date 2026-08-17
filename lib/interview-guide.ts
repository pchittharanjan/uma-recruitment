import { strategyDefaultGuides } from '@/lib/strategy-interview';

export type InterviewGuideFormat = 'questions' | 'case_study' | 'case_and_behavioral';
export type InterviewGuideStage = 'first_round' | 'final_round';

export interface InterviewGuide {
  format: InterviewGuideFormat;
  intro?: string;
  /** Public path to the case PDF shown during scoring, e.g. `/interview-cases/strategy-group.pdf`. */
  casePdfUrl?: string;
  questions?: string[];
  caseStudy?: {
    title?: string;
    prompt: string;
    discussionPoints?: string[];
  };
}

export type InterviewGuidesRecord = Record<InterviewGuideStage, InterviewGuide | null>;

export type InterviewScoreFieldGroup = {
  key: 'case' | 'behavioral' | 'questions' | 'overall';
  label: string;
  fields: string[];
};

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

  if (obj.format === 'questions') {
    const questions = trimList(obj.questions);
    if (questions.length === 0) return null;
    return { format: 'questions', intro, casePdfUrl, questions };
  }

  const caseStudy = normalizeCaseStudy(obj.caseStudy);
  if (!caseStudy) return null;

  if (obj.format === 'case_study') {
    return { format: 'case_study', intro, casePdfUrl, caseStudy };
  }

  const questions = trimList(obj.questions);
  return { format: 'case_and_behavioral', intro, casePdfUrl, caseStudy, questions };
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
    lines.push('Discussion points:');
    for (const point of cs.discussionPoints) {
      if (point.trim()) lines.push(`• ${point.trim()}`);
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
    lines.push('Part 1 — Case');
    lines.push('');
    lines.push(...formatCaseStudyLines(guide));
    lines.push('');
    lines.push('Part 2 — Behavioral');
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

function caseScoreFields(guide: InterviewGuide): string[] {
  const points = (guide.caseStudy?.discussionPoints ?? [])
    .map((p) => p.trim())
    .filter(Boolean);
  if (points.length > 0) return points;
  const title = guide.caseStudy?.title?.trim();
  if (title) return [title];
  return ['Case assessment'];
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

  if (guide.format === 'case_study') {
    return [{ key: 'case', label: '', fields: caseScoreFields(guide) }];
  }

  const caseFields = caseScoreFields(guide);
  const behavioralFields = uniquifyAgainst(
    caseFields,
    questionScoreFields(guide.questions, 'Behavioral assessment'),
  );
  return [
    { key: 'case', label: 'Part 1 — Case', fields: caseFields },
    { key: 'behavioral', label: 'Part 2 — Behavioral', fields: behavioralFields },
  ];
}

/** Scoreable rubric fields for live interview scoring (not application CSV columns). */
export function interviewScoreFieldsFromGuide(guide: InterviewGuide | null): string[] {
  return interviewScoreFieldGroups(guide).flatMap((group) => group.fields);
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
  if (teamName !== 'Strategy') return guides;

  const defaults = strategyDefaultGuides();

  return {
    first_round: mergeGuideWithDefault(guides.first_round, defaults.first_round),
    final_round: mergeGuideWithDefault(guides.final_round, defaults.final_round),
  };
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

  if (missingCaseQuestions || missingBehavioral) {
    return {
      ...fallback,
      intro: saved.intro ?? fallback.intro,
      casePdfUrl: saved.casePdfUrl ?? fallback.casePdfUrl,
    };
  }

  if (!saved.casePdfUrl && fallback.casePdfUrl) {
    return { ...saved, casePdfUrl: fallback.casePdfUrl };
  }
  return saved;
}

export function interviewStageSetupCopy(
  teamName: string,
  stage: InterviewGuideStage,
): { label: string; hint: string | null } {
  if (teamName === 'Strategy') {
    if (stage === 'first_round') {
      return {
        label: 'First Round (Group)',
        hint: 'Group casing — case only.',
      };
    }
    return {
      label: 'Final Round (Individual)',
      hint: 'Case (part 1), then behavioral questions (part 2).',
    };
  }
  return {
    label: stage === 'first_round' ? 'First Round Interview' : 'Final Round Interview',
    hint: null,
  };
}
