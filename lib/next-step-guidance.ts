/**
 * Short “what to do next” copy for team-portal handoffs.
 * Keep these action-first so graders/directors always know the next click.
 */

/** Shared phrase for the five-level advancement scale (see ADVANCEMENT_RATING_LEGEND). */
export const FIVE_LEVEL_RATING_PHRASE = 'five color ratings (Green → Red)';

export function gradingCompleteGuidance(isDirector: boolean): {
  title: string;
  description: string;
  ctaLabel: string;
} {
  if (isDirector) {
    return {
      title: 'Required next step: rate who advances',
      description:
        `Pick ${FIVE_LEVEL_RATING_PHRASE} for each applicant you graded (see the legend on the next page). Then meet with your PMs and submit the final list to Admin.`,
      ctaLabel: 'Rate who advances →',
    };
  }
  return {
    title: 'Required next step: rate who advances',
    description:
      `Pick ${FIVE_LEVEL_RATING_PHRASE} for each applicant you graded. Directors use your ratings when they decide who moves forward.`,
    ctaLabel: 'Rate who advances →',
  };
}

export function gradingCompleteToast(isDirector: boolean, isAdminGrader = false): string {
  if (isAdminGrader) return 'All done grading.';
  return isDirector
    ? `All done grading. Next: ${FIVE_LEVEL_RATING_PHRASE}, then meet with your PMs`
    : `All done grading. Next: ${FIVE_LEVEL_RATING_PHRASE}`;
}

export function interviewCompleteGuidance(isDirector: boolean): {
  title: string;
  description: string;
  ctaLabel: string;
} {
  if (isDirector) {
    return {
      title: "Interviews scored — what's next",
      description:
        `Rate each candidate using ${FIVE_LEVEL_RATING_PHRASE} on who should move forward. Then meet with your PMs and submit the final list to Admin.`,
      ctaLabel: 'Rate who advances →',
    };
  }
  return {
    title: "Interviews scored — what's next",
    description:
      `Rate each candidate using ${FIVE_LEVEL_RATING_PHRASE} on who you think should move forward. Directors use your ratings when they build the advancement list.`,
    ctaLabel: 'Rate who advances →',
  };
}

export function advancementStepGuide(isDirector: boolean): string {
  if (isDirector) {
    return `1) Set ${FIVE_LEVEL_RATING_PHRASE} on each person  ·  2) Meet with your PMs  ·  3) Check Advance and submit the list to Admin`;
  }
  return `Set ${FIVE_LEVEL_RATING_PHRASE} on each applicant you graded. When you're done, Directors finalize the list.`;
}

export function interviewCompleteToast(isDirector: boolean): string {
  return isDirector
    ? `All interviews scored. Next: ${FIVE_LEVEL_RATING_PHRASE}, then meet with your PMs`
    : `All interviews scored. Next: ${FIVE_LEVEL_RATING_PHRASE}`;
}

export function recommendationsCompleteMessage(isDirector: boolean): string {
  if (isDirector) {
    return 'Your ratings are set. Meet with your PMs, then select who to Advance and submit the list to Admin.';
  }
  return "Your ratings are in. You're done here — Directors will finalize the advancement list.";
}
