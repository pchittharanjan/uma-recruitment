export type InterviewGuideFormat = 'questions' | 'case_study';
export type InterviewGuideStage = 'first_round' | 'final_round';

export interface InterviewGuide {
  format: InterviewGuideFormat;
  intro?: string;
  questions?: string[];
  caseStudy?: {
    title?: string;
    prompt: string;
    discussionPoints?: string[];
  };
}

export type InterviewGuidesRecord = Record<InterviewGuideStage, InterviewGuide | null>;

const STAGES: InterviewGuideStage[] = ['first_round', 'final_round'];

export function emptyInterviewGuides(): InterviewGuidesRecord {
  return { first_round: null, final_round: null };
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Normalize raw API/client input into a validated guide shape (may still fail validateInterviewGuide). */
export function normalizeGuideInput(raw: unknown): InterviewGuide | null {
  return normalizeGuide(raw);
}

function normalizeGuide(raw: unknown): InterviewGuide | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<InterviewGuide>;
  if (obj.format !== 'questions' && obj.format !== 'case_study') return null;

  const intro = trimOptional(obj.intro);

  if (obj.format === 'questions') {
    const questions = (obj.questions ?? [])
      .map((q) => (typeof q === 'string' ? q.trim() : ''))
      .filter(Boolean);
    if (questions.length === 0) return null;
    return { format: 'questions', intro, questions };
  }

  const caseStudyRaw = obj.caseStudy;
  if (!caseStudyRaw || typeof caseStudyRaw !== 'object') return null;
  const prompt =
    typeof caseStudyRaw.prompt === 'string' ? caseStudyRaw.prompt.trim() : '';
  if (!prompt) return null;

  const discussionPoints = (caseStudyRaw.discussionPoints ?? [])
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);

  return {
    format: 'case_study',
    intro,
    caseStudy: {
      title: trimOptional(
        typeof caseStudyRaw.title === 'string' ? caseStudyRaw.title : undefined,
      ),
      prompt,
      discussionPoints: discussionPoints.length > 0 ? discussionPoints : undefined,
    },
  };
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
  if (guide.format === 'questions') {
    const questions = (guide.questions ?? []).map((q) => q.trim()).filter(Boolean);
    if (questions.length === 0) {
      return 'Add at least one interview question.';
    }
    return null;
  }

  const prompt = guide.caseStudy?.prompt?.trim();
  if (!prompt) {
    return 'Case study prompt is required.';
  }
  return null;
}

export function formatInterviewGuideForDisplay(guide: InterviewGuide): string {
  const lines: string[] = [];

  if (guide.intro?.trim()) {
    lines.push(guide.intro.trim());
    lines.push('');
  }

  if (guide.format === 'questions') {
    const questions = (guide.questions ?? []).filter((q) => q.trim());
    questions.forEach((q, i) => {
      lines.push(`${i + 1}. ${q.trim()}`);
    });
    return lines.join('\n').trim();
  }

  const cs = guide.caseStudy!;
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
  return lines.join('\n').trim();
}

/** API-safe shape for interviewer views (no internal-only fields). */
export function interviewGuideForApi(
  guide: InterviewGuide | null,
): InterviewGuide | null {
  if (!guide) return null;
  return normalizeGuide(guide);
}

/** Scoreable rubric fields for live interview scoring (not application CSV columns). */
export function interviewScoreFieldsFromGuide(guide: InterviewGuide | null): string[] {
  if (!guide) return ['Overall assessment'];

  if (guide.format === 'questions') {
    const questions = (guide.questions ?? []).map((q) => q.trim()).filter(Boolean);
    return questions.length > 0 ? questions : ['Overall assessment'];
  }

  const points = (guide.caseStudy?.discussionPoints ?? [])
    .map((p) => p.trim())
    .filter(Boolean);
  if (points.length > 0) return points;

  const title = guide.caseStudy?.title?.trim();
  if (title) return [title];

  return ['Case study assessment'];
}
