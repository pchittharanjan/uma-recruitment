import type { InterviewGuide, InterviewGuidesRecord } from '@/lib/interview-guide';

export const DESIGN_BEHAVIORAL_QUESTIONS = [
  'Tell us about yourself and why you want to join UMA Design.',
  'Describe a time you received critical feedback on creative work. How did you respond, and what changed in your process?',
  'Tell us about a project where you had to balance speed with quality. What tradeoffs did you make?',
];

export const DESIGN_THINKING_QUESTIONS = [
  'Walk us through your design process from brief to final deliverable. Where do you start, and how do you know when you are done?',
  'How do you decide what to prototype versus what to ship? Give a concrete example.',
  'Describe a time you had to design for a user group very different from yourself. How did you build empathy and validate your ideas?',
];

export const DESIGN_BART_CRITIQUE = {
  title: 'Homepage Critique: BART',
  prompt:
    'Open bart.gov on your phone (or imagine the mobile homepage). In 3–4 minutes, critique the information hierarchy, visual language, and clarity for a first-time rider trying to plan a trip.',
  discussionPoints: [
    'What works well for discoverability and trust?',
    'What creates friction for a rider under time pressure?',
    'What would you change first, and why?',
  ],
};

export const DESIGN_BART_CHALLENGE = {
  title: 'Design Challenge: BART Rider Pain Point',
  prompt:
    'Pick one recurring pain point for BART riders (delays, wayfinding, payment, accessibility, etc.). You have 5 minutes to sketch a lightweight solution on paper. Focus on the core interaction, not polish.',
  discussionPoints: [
    'Which pain point did you choose, and who is most affected?',
    'Walk us through your sketch and the key screen/state.',
    'How would you test whether this actually helps riders?',
  ],
};

export const DESIGN_WRAP_UP_QUESTIONS = [
  'What teams or roles are you most interested in at UMA, and why Design?',
  'What questions do you have for us about the team or the recruitment process?',
];

export function designDefaultGuides(): InterviewGuidesRecord {
  const firstRound: InterviewGuide = {
    format: 'questions',
    intro:
      'Design interview: behavioral and design thinking (part 1), short BART critique and sketch challenge (part 2), then wrap up. No case PDF.',
    questions: [
      ...DESIGN_BEHAVIORAL_QUESTIONS,
      ...DESIGN_THINKING_QUESTIONS,
      `Short Design Casing: ${DESIGN_BART_CRITIQUE.title}: ${DESIGN_BART_CRITIQUE.prompt}`,
      ...DESIGN_BART_CRITIQUE.discussionPoints.map((p) => `Critique: ${p}`),
      `Short Design Casing: ${DESIGN_BART_CHALLENGE.title}: ${DESIGN_BART_CHALLENGE.prompt}`,
      ...DESIGN_BART_CHALLENGE.discussionPoints.map((p) => `Challenge: ${p}`),
      ...DESIGN_WRAP_UP_QUESTIONS,
    ],
    rubric: {
      scaleMax: 5,
      criteria: [
        { name: 'Precision', weight: 1 },
        { name: 'Creativity', weight: 1 },
        { name: 'Efficiency', weight: 1 },
        { name: 'Communication', weight: 1 },
      ],
    },
  };

  return { first_round: firstRound, final_round: null };
}
