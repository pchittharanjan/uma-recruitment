import type { InterviewGuide, InterviewGuideStage } from '@/lib/interview-guide';
import { rewriteLegacyInterviewIntro } from '@/lib/strategy-interview';

const KEY_PREFIX = 'uma-interview-preview';

export function interviewPreviewStorageKey(teamId: string, stage: InterviewGuideStage): string {
  return `${KEY_PREFIX}:${teamId}:${stage}`;
}

export function stashInterviewPreviewGuide(
  teamId: string,
  stage: InterviewGuideStage,
  guide: InterviewGuide,
): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(
    interviewPreviewStorageKey(teamId, stage),
    JSON.stringify({ guide, savedAt: Date.now() }),
  );
}

export function readInterviewPreviewGuide(
  teamId: string,
  stage: InterviewGuideStage,
): InterviewGuide | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(interviewPreviewStorageKey(teamId, stage));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { guide?: InterviewGuide };
    const guide = parsed.guide ?? null;
    if (!guide) return null;
    return { ...guide, intro: rewriteLegacyInterviewIntro(guide.intro) };
  } catch {
    return null;
  }
}

export function clearInterviewPreviewGuide(teamId: string, stage: InterviewGuideStage): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(interviewPreviewStorageKey(teamId, stage));
}
