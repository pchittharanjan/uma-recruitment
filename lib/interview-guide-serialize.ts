import {
  normalizeInterviewRubric,
  type InterviewGuide,
} from '@/lib/interview-guide';

/** Stable JSON key for comparing guide drafts (save / autosave). */
export function serializeInterviewGuidePayload(guide: InterviewGuide): string {
  const intro = guide.intro?.trim() || undefined;
  const casePdfUrl = guide.casePdfUrl;

  if (guide.format === 'questions') {
    return JSON.stringify({
      format: 'questions',
      intro,
      casePdfUrl,
      questions: (guide.questions ?? []).map((q) => q.trim()).filter(Boolean),
    });
  }

  const caseStudy = {
    title: guide.caseStudy?.title?.trim() || undefined,
    prompt: guide.caseStudy?.prompt?.trim() ?? '',
    discussionPoints: (guide.caseStudy?.discussionPoints ?? [])
      .map((p) => p.trim())
      .filter(Boolean),
  };
  const rubric = normalizeInterviewRubric(guide.rubric);

  if (guide.format === 'case_study') {
    return JSON.stringify({ format: 'case_study', intro, casePdfUrl, caseStudy, rubric });
  }

  return JSON.stringify({
    format: 'case_and_behavioral',
    intro,
    casePdfUrl,
    caseStudy,
    questions: (guide.questions ?? []).map((q) => q.trim()).filter(Boolean),
    rubric,
  });
}
