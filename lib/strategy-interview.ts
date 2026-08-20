import type { InterviewGuide, InterviewGuidesRecord } from '@/lib/interview-guide';

export const STRATEGY_GROUP_CASE_PDF = '/interview-cases/strategy-group.pdf';
export const STRATEGY_INDIV_CASE_PDF = '/interview-cases/strategy-individual.pdf';

export const STRATEGY_GROUP_INTRO =
  'Present the Liquid Death group case. Take notes on each question, then score the evaluation criteria.';

/** Previous default copy — still stored on some saved guides / preview drafts. */
export const STRATEGY_GROUP_INTRO_LEGACY =
  'Group casing: Liquid Death. Present the case from the PDF, take notes on each question, then score the evaluation criteria.';

export function rewriteLegacyInterviewIntro(intro: string | undefined): string | undefined {
  const trimmed = intro?.trim();
  if (!trimmed) return trimmed;
  if (
    trimmed === STRATEGY_GROUP_INTRO_LEGACY ||
    /^group casing:/i.test(trimmed)
  ) {
    return STRATEGY_GROUP_INTRO;
  }
  return trimmed;
}

export const STRATEGY_GROUP_CASE_QUESTIONS = [
  'Estimate the annual market size for single-serve water, across any different packaging type, consumed by students at U.S. colleges and universities. Consider different consumption occasions, such as dining halls, studying, athletics, and social events, and how students\' purchasing behavior might differ across each.',
  'What are the common trends among Gen Z students, and how can Liquid Death utilize this for a campaign? (Please refer to the charts provided)',
  'What challenges and opportunities do you foresee if Liquid Death attempts to expand in this way on college campuses?',
  'The CEO of Liquid Death asked you for a final summary of your team’s findings and observations. Provide an overall recommendation and summarize what you\'ve just discussed.',
];

export const STRATEGY_INDIV_CASE_QUESTIONS = [
  'Chili\'s spends $5 million on a social campaign that reaches 100 million people. As a result of the campaign, what percent of people do you think will convert to a visit? Based on this, will the campaign pay for itself? Assume each guest spends $20 for each visit.',
  'The Triple Dipper appetizer went viral on TikTok, creating a trend for people to visit Chili’s. This has become a core part of their brand; however, trends fade quickly. Suggest strategies to convert these one-time viral visitors into long-term customers.',
  'Gen-Z is known to prefer delivery, with the percentage of Gen-Z users who use sites like DoorDash, GrubHub, and Uber Eats, rising each year. With Chili’s emphasis on in-person dining, suggest strategies for ensuring Gen Z enters the restaurant.',
];

export const STRATEGY_BEHAVIORAL_QUESTIONS = [
  'Considering yesterday’s social round, what motivates you to be part of this club beyond your professional goals?',
  'Can you give an example of a time when you had to persuade a group to see things your way? What strategies did you use, and were you successful?',
  'Describe a time when you had to adapt quickly to a significant change in your work environment in your last job or internship role. How did you handle it, and what was the outcome?',
  'Describe a situation where you had to manage multiple priorities. How did you ensure everything was completed on time?',
  'Any other committees applying for? Which preference?',
  'What other time commitments do you have this semester?',
];

export function strategyDefaultGuides(): InterviewGuidesRecord {
  const firstRound: InterviewGuide = {
    format: 'case_study',
    casePdfUrl: STRATEGY_GROUP_CASE_PDF,
    intro: STRATEGY_GROUP_INTRO,
    caseStudy: {
      title: 'Liquid Death',
      prompt:
        'Liquid Death wants to become the largest hydration brand on college campuses. Develop a strategy that bypasses traditional corporate barriers and makes the brand integral to campus culture.',
      discussionPoints: [...STRATEGY_GROUP_CASE_QUESTIONS],
    },
    rubric: {
      scaleMax: 5,
      criteria: [
        { name: 'Structure', weight: 25 },
        { name: 'Quant / analytics', weight: 25 },
        { name: 'Insight', weight: 25 },
        { name: 'Communication', weight: 25 },
      ],
    },
  };

  const finalRound: InterviewGuide = {
    format: 'case_and_behavioral',
    casePdfUrl: STRATEGY_INDIV_CASE_PDF,
    intro: "Individual interview: Chili's case (part 1), then behavioral questions (part 2). Candidates have 15 minutes for the case.",
    caseStudy: {
      title: 'Chili’s Grill & Bar',
      prompt:
        'How can Chili’s sustain its cool factor and traffic momentum among Gen Z without becoming overly reliant on low-margin value deals that could hurt long-term profitability?',
      discussionPoints: [...STRATEGY_INDIV_CASE_QUESTIONS],
    },
    questions: [...STRATEGY_BEHAVIORAL_QUESTIONS],
    rubric: {
      scaleMax: 5,
      criteria: [
        { name: 'Structure', weight: 25 },
        { name: 'Quant / analytics', weight: 25 },
        { name: 'Insight', weight: 25 },
        { name: 'Communication', weight: 25 },
      ],
    },
  };

  return { first_round: firstRound, final_round: finalRound };
}
