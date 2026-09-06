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

/**
 * Final individual interview — required behavioral prompts (always ask).
 * Source: [UMA FA26] Events Individual Interview Round PDF.
 */
export const EVENTS_BEHAVIORAL_QUESTIONS = [
  'Tell me about yourself (ex: name, major, hobbies, interest in events): 1 min',
  'Tell me about an event you helped plan or host (doesn\'t have to be marketing-related, could be something as simple as a dinner). What made it successful, and what was your role in making that happen?: 2 mins',
  'What\'s a marketing event or campaign that\'s stuck with you personally and why? (could be positive/negative) 2 mins',
  'Considering yesterday\'s social round, what motivates you to be part of UMA beyond your professional goals? 1 min',
  'Tell us about a time you had to learn something new to complete a task 1 min',
  'Teach us something in 1 minute. (1 min to brainstorm, 1 min to teach) 2 min',
];

/** Warm-up case (~3 min) — Part of final-round case discussion points. */
export const EVENTS_WARMUP_QUESTIONS = [
  'Warm-Up Case (Boba Launch, 3 mins): A campus boba shop is launching a limited-edition drink and wants buzz before it launches. You\'re asked to feature it in an unconventional, high-traffic spot to catch students\' attention. What kind of location would you look for (examples include: time of day, foot traffic pattern, what students are doing there), and why would that generate the most excitement and curiosity?',
];

/** Full 3-part StudySync case — after warm-up. */
export const EVENTS_STUDYSYNC_CASE_QUESTIONS = [
  'Task 1 — Trend & Competitor Research (4 mins brainstorm, 2 to present): What would you research to understand what makes something go viral or "stop traffic" among college students right now? This could include looking at specific companies, apps, or campus activations. What would you actually take from that research to apply here?',
  'Task 2 — The Activation (4 mins brainstorm, 2 to present): Now that you\'ve done your research, design the activation! Create something that attracts students\' attention — what makes someone stop, and why would they want to share it? Then walk us through the event. This could include where and when it takes place, what\'s actually happening, and potential partnerships. Remember, the goal is brand awareness and promoting StudySync\'s AI feature.',
  'Task 3 — Post Event (4 mins brainstorm, 2 to present): You\'ve designed the activation, and StudySync wants to know if it actually drove awareness of the AI feature. What data or signals would tell you that? You\'ve determined from this that this event was a success at UC Berkeley. StudySync recreates this exactly at a different university, and it is not as effective. Ideate reasons why this activation could have flopped and how would you have prevented this?',
];

export const EVENTS_FINAL_CASE_PROMPT =
  'StudySync is a productivity and study app. Candidates get ~2 minutes to read the packet, then complete a warm-up (boba launch location) and a 3-part case: trend & competitor research, design a campus activation promoting StudySync\'s AI feature (brand awareness), and post-event measurement / transferability.';

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

  // Final individual: (1) Behavioral → (2) Warm-up case → (3) Full StudySync case.
  // Modeled as case_and_behavioral: required questions = behavioral; discussionPoints = warm-up + case.
  const finalRound: InterviewGuide = {
    format: 'case_and_behavioral',
    casePdfUrl: EVENTS_FINAL_CASE_PDF,
    intro:
      'Individual interview: Behavioral (~10 min), warm-up case (~3 min), then StudySync 3-part case. Score each criterion 1–5.',
    caseStudy: {
      title: 'StudySync — Productivity and Study App',
      prompt: EVENTS_FINAL_CASE_PROMPT,
      discussionPoints: [...EVENTS_WARMUP_QUESTIONS, ...EVENTS_STUDYSYNC_CASE_QUESTIONS],
    },
    questions: [...EVENTS_BEHAVIORAL_QUESTIONS],
    rubric: {
      scaleMax: 5,
      criteria: [
        { name: 'Warm-Up: Location Reasoning', weight: 20 },
        { name: 'Task 1: Trend & Competitor Research', weight: 20 },
        { name: 'Task 2: The Activation', weight: 25 },
        { name: 'Task 3: Post Event', weight: 20 },
        { name: 'Overall Communication', weight: 15 },
      ],
    },
    behavioralRubric: {
      scaleMax: 5,
      criteria: [
        { name: 'Introduction & Communication', weight: 17 },
        { name: 'Event Planning Experience', weight: 17 },
        { name: 'Event / Campaign Instinct', weight: 17 },
        { name: 'Motivation / Fit', weight: 16 },
        { name: 'Learning Agility', weight: 16 },
        { name: 'Expertise & Teaching', weight: 17 },
      ],
    },
  };

  return { first_round: firstRound, final_round: finalRound };
}
