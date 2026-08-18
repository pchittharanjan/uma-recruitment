/**
 * Short “what to do next” copy for team-portal handoffs.
 * Keep these action-first so graders/directors always know the next click.
 */

export function gradingCompleteGuidance(isDirector: boolean): {
  title: string;
  description: string;
  ctaLabel: string;
} {
  if (isDirector) {
    return {
      title: "Grading complete: what's next",
      description:
        'Click Next to add color recommendations on who should move forward. Then get on a call with your PMs to discuss the list before you submit it to Admin.',
      ctaLabel: 'Next: color recommendations →',
    };
  }
  return {
    title: "Grading complete: what's next",
    description:
      'Click Next to add color recommendations on who you think should move forward. Directors use these when they decide the advancement list.',
    ctaLabel: 'Next: color recommendations →',
  };
}

export function gradingCompleteToast(isDirector: boolean): string {
  return isDirector
    ? 'All done grading. Next: color recommendations, then meet with your PMs'
    : 'All done grading. Next: color recommendations';
}

export function interviewCompleteGuidance(isDirector: boolean): {
  title: string;
  description: string;
  ctaLabel: string;
} {
  if (isDirector) {
    return {
      title: "Interviews scored: what's next",
      description:
        'Click Next to add color recommendations on who should move forward. Then get on a call with your PMs to discuss the list before you submit it to Admin.',
      ctaLabel: 'Next: color recommendations →',
    };
  }
  return {
    title: "Interviews scored: what's next",
    description:
      'Click Next to add color recommendations on who you think should move forward. Directors use these when they decide the advancement list.',
    ctaLabel: 'Next: color recommendations →',
  };
}

export function advancementStepGuide(isDirector: boolean): string {
  if (isDirector) {
    return '1) Set color recommendations  ·  2) Meet with your PMs  ·  3) Check Advance and submit the list to Admin';
  }
  return       'Set a color recommendation on each applicant you graded. When you\'re done, Directors finalize the list.';
}

export function recommendationsCompleteMessage(isDirector: boolean): string {
  if (isDirector) {
    return 'Your color recommendations are set. Meet with your PMs, then select who to Advance and submit the list to Admin.';
  }
  return "Your color recommendations are in. You're done here. Directors will finalize the advancement list.";
}
