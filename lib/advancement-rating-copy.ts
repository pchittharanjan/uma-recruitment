import type { AdvancementVerdict } from '@/lib/advancement-verdict-types';
import {
  ADVANCEMENT_RATING_LEGEND,
  verdictLabel,
  verdictMeaning,
} from '@/lib/advancement-verdict-types';
import { FIVE_LEVEL_RATING_PHRASE } from '@/lib/next-step-guidance';

export { ADVANCEMENT_RATING_LEGEND, FIVE_LEVEL_RATING_PHRASE };

export function advancementRequiredStepIntro(isDirector: boolean): string {
  if (isDirector) {
    return `Required after grading: set ${FIVE_LEVEL_RATING_PHRASE} on every applicant you graded (see legend below). Then meet with your PMs and submit the final list.`;
  }
  return `Required after grading: set ${FIVE_LEVEL_RATING_PHRASE} on every applicant you graded. Directors use your ratings when they build the advancement list.`;
}

export function advancementIncompleteReminder(count: number, noun: string): string {
  return `${count} ${noun} still need your rating before directors can submit.`;
}

export function verdictPickerAriaLabel(applicantLabel: string): string {
  return `Color rating for ${applicantLabel}. ${FIVE_LEVEL_RATING_PHRASE} — Green means advance, Red means do not advance.`;
}

/** Compact per-grader counts for admin readiness tables. */
export function formatGraderVerdictBreakdown(counts: {
  green: number;
  highYellow: number;
  yellow: number;
  lowYellow: number;
  red: number;
}): string {
  const parts: string[] = [];
  if (counts.green > 0) parts.push(`${counts.green} Green`);
  if (counts.highYellow > 0) parts.push(`${counts.highYellow} High Yellow`);
  if (counts.yellow > 0) parts.push(`${counts.yellow} Yellow`);
  if (counts.lowYellow > 0) parts.push(`${counts.lowYellow} Low Yellow`);
  if (counts.red > 0) parts.push(`${counts.red} Red`);
  return parts.length > 0 ? parts.join(' · ') : '-';
}

export function formatVerdictOptionLabel(verdict: AdvancementVerdict): string {
  return `${verdictLabel(verdict)} — ${verdictMeaning(verdict)}`;
}
