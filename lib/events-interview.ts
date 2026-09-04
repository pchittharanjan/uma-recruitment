import type { InterviewGuide, InterviewGuidesRecord } from '@/lib/interview-guide';

export const EVENTS_GROUP_CASE_PDF = '/interview-cases/events-group.pdf';
export const EVENTS_FINAL_CASE_PDF = '/interview-cases/events-individual.pdf';

export const EVENTS_GROUP_CASE_PROMPT =
  'You\'re a consultant for a skincare brand looking to break into the US college market. They\'re not well known outside a niche group of skincare enthusiasts and want to reach a more mainstream student audience. Their goal is to drive brand awareness/interest in one specific product while also growing their student ambassador program.\n\n' +
  'You\'re tasked with designing an activation that accomplishes both: drives interest in the product and recruits students into the brand\'s ambassador program. This can be one combined event, or two separate but connected events (ex: a smaller ambassador-focused event that feeds into a larger public event) — your choice, as long as the two goals work together rather than separately.';

export const EVENTS_GROUP_CASE_QUESTIONS = [
  'Part 1 — Audience Research: What information would you collect from Berkeley students before designing your activation? How would you collect it (surveys, interviews, focus groups, social listening, etc.)? What are 3–4 specific questions you\'d ask students?',
  'Part 2 — Campaign Concept & Ambassador Recruitment: How do you pitch/encourage students to become ambassadors? How would you identify/recruit candidates? One combined event or two connected events — and why? Walk through activities, flow, timing, and location for a mainstream (not just niche skincare) audience.',
  'Part 3 — Measuring Success: What data proves the product promotion worked? What data proves ambassador recruitment worked? If the two goals showed conflicting results, how would you interpret that?',
];

export const EVENTS_BEHAVIORAL_QUESTIONS = [
  'Tell me about yourself (name, major, hobbies, interest in events) — 1 min',
  'Tell me about the most successful marketing event you\'ve interacted with, and what led to its success — 1 min',
  'Where do you see yourself fitting into the UMA picture? — 1 min',
  'Tell us about a time you had to learn something new to complete a task — 1 min',
  'What are you an expert in? Teach us.',
];

export const EVENTS_WARMUP_QUESTIONS = [
  'Warm-Up Case (Boba Launch): Where would you place a boba pop-up on campus and why?',
];

export const EVENTS_RESET_CASE_QUESTIONS = [
  'Research Instinct: What sources would you use to understand Gen Z resale behavior?',
  'Authenticity Strategy: How would RESET avoid feeling like a sustainability gimmick to Gen Z?',
  'Campus Activation Design: Design a campus activation that sparks word-of-mouth and app engagement.',
];

export function eventsDefaultGuides(): InterviewGuidesRecord {
  const firstRound: InterviewGuide = {
    format: 'case_study',
    casePdfUrl: EVENTS_GROUP_CASE_PDF,
    intro:
      'Group interview: skincare activation case. Take notes on each question, then score case analysis and group process.',
    caseStudy: {
      title: 'Skincare Activation — Group Interview Case',
      prompt: EVENTS_GROUP_CASE_PROMPT,
      discussionPoints: [...EVENTS_GROUP_CASE_QUESTIONS],
    },
    rubric: {
      scaleMax: 5,
      criteria: [
        { name: 'Audience Research Quality', weight: 34 },
        { name: 'Campaign Concept & Ambassador Integration', weight: 33 },
        { name: 'Success Metrics', weight: 33 },
      ],
    },
  };

  const finalRound: InterviewGuide = {
    format: 'case_and_behavioral',
    casePdfUrl: EVENTS_FINAL_CASE_PDF,
    intro:
      'Individual interview: behavioral & fit (~5 min), warm-up case, RESET case, then overall communication. Score each criterion 1–5.',
    caseStudy: {
      title: 'RESET Resale App',
      prompt:
        'RESET wants to reach Gen Z with an authentic sustainability message and prove campus demand through word-of-mouth.',
      discussionPoints: [...EVENTS_WARMUP_QUESTIONS, ...EVENTS_RESET_CASE_QUESTIONS],
    },
    questions: [...EVENTS_BEHAVIORAL_QUESTIONS],
    rubric: {
      scaleMax: 5,
      criteria: [
        { name: 'Placement Creativity & Reasoning', weight: 21 },
        { name: 'Research Instinct', weight: 19 },
        { name: 'Authenticity Strategy', weight: 19 },
        { name: 'Campus Activation Design', weight: 19 },
        { name: 'Overall Communication', weight: 22 },
      ],
    },
    behavioralRubric: {
      scaleMax: 5,
      criteria: [
        { name: 'Introduction & Communication', weight: 20 },
        { name: 'Event Marketing Instinct', weight: 20 },
        { name: 'Motivation / Fit', weight: 20 },
        { name: 'Learning Agility', weight: 20 },
        { name: 'Expertise & Teaching', weight: 20 },
      ],
    },
  };

  return { first_round: firstRound, final_round: finalRound };
}
