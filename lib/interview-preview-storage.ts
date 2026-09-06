import {
  applyTeamInterviewGuideDefaults,
  type InterviewGuide,
  type InterviewGuideStage,
} from '@/lib/interview-guide';
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

/**
 * Read a stashed preview draft. When `teamName` is provided, always re-merge
 * with team defaults so an old sessionStorage draft cannot freeze a retired
 * rubric (e.g. Strategy final HeyTea 3-criterion list).
 */
export function readInterviewPreviewGuide(
  teamId: string,
  stage: InterviewGuideStage,
  teamName?: string,
): InterviewGuide | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(interviewPreviewStorageKey(teamId, stage));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { guide?: InterviewGuide };
    const guide = parsed.guide ?? null;
    if (!guide) return null;

    const withIntro = {
      ...guide,
      intro: rewriteLegacyInterviewIntro(guide.intro),
    };

    if (!teamName?.trim()) return withIntro;

    const merged =
      applyTeamInterviewGuideDefaults(teamName, {
        first_round: stage === 'first_round' ? withIntro : null,
        final_round: stage === 'final_round' ? withIntro : null,
      })[stage] ?? withIntro;

    // Rewrite stash when merge upgraded the guide so later reads stay current.
    if (JSON.stringify(merged) !== JSON.stringify(withIntro)) {
      stashInterviewPreviewGuide(teamId, stage, merged);
    }

    return merged;
  } catch {
    return null;
  }
}

export function clearInterviewPreviewGuide(teamId: string, stage: InterviewGuideStage): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(interviewPreviewStorageKey(teamId, stage));
}
