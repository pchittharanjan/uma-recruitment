import type { InterviewGuide, InterviewGuidesRecord } from '@/lib/interview-guide';

export const STRATEGY_GROUP_CASE_PDF = '/interview-cases/strategy-group.pdf';
export const STRATEGY_INDIV_CASE_PDF = '/interview-cases/strategy-individual.pdf';

export const STRATEGY_GROUP_INTRO =
  'Present the Supreme group case. Take notes on each question, then score the evaluation criteria.';

/** Previous default copy — still stored on some saved guides / preview drafts. */
export const STRATEGY_GROUP_INTRO_LEGACY =
  'Present the Liquid Death group case. Take notes on each question, then score the evaluation criteria.';

export function rewriteLegacyInterviewIntro(intro: string | undefined): string | undefined {
  const trimmed = intro?.trim();
  if (!trimmed) return trimmed;
  if (
    trimmed === STRATEGY_GROUP_INTRO_LEGACY ||
    /^group casing:/i.test(trimmed) ||
    /liquid death/i.test(trimmed)
  ) {
    return STRATEGY_GROUP_INTRO;
  }
  return trimmed;
}

export const STRATEGY_GROUP_CASE_PROMPT =
  'Supreme, the New York-founded streetwear label built on weekly "drops," red box logo scarcity, and a rotating cast of surprise collaborators (from Nike and The North Face to Louis Vuitton and even Oreo), turned limited supply into one of the most valuable brand strategies in modern retail. Its business model runs counter to almost every rule of conventional apparel retailing: intentionally under-produce, never restock, and let resale markets (StockX, GOAT, eBay) amplify the brand\'s cultural cachet.\n\n' +
  'This scarcity engine, combined with an insider, "you\'re either in on it or you\'re not" attitude, built a cult following and command premiums of 5–10x retail on the secondary market. Supreme was acquired by VF Corporation in 2020 for roughly $2.1B, and then sold again in 2024 to EssilorLuxottica for about $1.5B — a steep markdown that signaled investor skepticism about the brand\'s growth trajectory under corporate ownership.\n\n' +
  'Throughout this period, Supreme has struggled to convert cult loyalty into sustained growth: drop fatigue has set in among longtime fans, resale prices on many items have softened, counterfeit product has proliferated, and a new generation of consumers has more options (Aimé Leon Dore, Corteiz, Chrome Hearts, and a wave of "quiet luxury" and gorpcore competitors) competing for the same cultural real estate that Supreme once owned outright.\n\n' +
  'The Challenge: Supreme\'s new ownership wants the brand to become a durable, decade-spanning cultural institution rather than a fading 2010s hype phenomenon, without killing the scarcity and insider mystique that made it valuable in the first place. Supreme faces a genuine paradox: broadening its reach (more stores, more product, more markets, more accessible price points) is exactly the kind of move that has diluted comparable brands, while doing nothing risks irrelevance as the customer base ages out and no younger cohort fully replaces it.\n\n' +
  'Your task is to develop a strategy that deepens Supreme\'s relevance with the newest generation of streetwear consumers, particularly college-age and just-post-college consumers who are culturally influential but were mostly too young to experience Supreme\'s 2012–2018 peak, without compromising the exclusivity that is the brand\'s core asset.';

export const STRATEGY_GROUP_CASE_QUESTIONS = [
  'Estimate the annual market size for premium/hype streetwear (apparel and accessories in the $50–500+ per item range) purchased by U.S. college-age consumers (18–24). Consider different channels — direct-to-consumer drops, resale marketplaces, physical flagship/pop-up stores, and secondary "off-brand" collab merchandise — and how purchasing behavior and price sensitivity might differ across each.',
  'What are the common trends among Gen Z students relevant to fashion, status, and community, and how can Supreme utilize this for a campaign? (Please refer to the charts provided)',
  'What challenges and opportunities do you foresee if Supreme attempts to expand its relevance this way among college students, particularly given the risk of diluting scarcity value and the brand\'s history of two acquisitions in four years?',
  'The CEO of Supreme (under EssilorLuxottica) asked you for a final summary of your team\'s findings and observations. Provide an overall recommendation and summarize what you\'ve just discussed.',
];

export const STRATEGY_INDIV_CASE_PROMPT =
  'Our client is HeyTea (喜茶), a Chinese premium tea chain founded in 2012, credited with pioneering the "cheese tea" and modern fruit tea category that now defines the global new-style tea beverage industry. HeyTea entered the U.S. in 2023 and has since opened dozens of stores across cities like New York, Los Angeles, and San Francisco, betting that American Gen Z consumers, already primed by boba culture and TikTok food trends, will embrace the brand the way Chinese consumers did a decade ago.\n\n' +
  'But the U.S. market looks nothing like China\'s: rent and labor costs are far higher, the boba/bubble tea category is already crowded with established players like Gong Cha, Sharetea, and CoCo, and HeyTea must also compete for the same Gen Z dollar and attention span as Starbucks, Dunkin\', and a constant churn of other TikTok-viral food and drink trends.\n\n' +
  'Premium Pricing in an Unfamiliar Market: In China, HeyTea has had to cut prices sharply to survive a brutal price war with ultra-low-cost chains like Mixue. In the U.S., HeyTea has taken the opposite approach, launching at a premium price point (many drinks $6–8) with no discounting to speak of, betting that Americans will treat it like a specialty, Instagrammable treat rather than a daily commodity purchase. This protects margins but raises the risk that HeyTea becomes a one-time novelty rather than a habitual stop, especially against cheaper boba competitors already embedded in many U.S. cities.\n\n' +
  'Viral Launch Moments: Each new HeyTea U.S. store opening has been engineered to go viral, with hours-long lines, limited-edition merchandise (tote bags, cups, stickers), and heavy TikTok and Instagram coverage of the "aesthetic" in-store experience. These launch-day moments generate enormous short-term buzz and press coverage but are, by nature, one-time spikes tied to novelty and scarcity rather than sustained daily demand.\n\n' +
  'Overarching Challenge: How can HeyTea sustain its cool factor and traffic momentum among American Gen Z consumers without becoming just another viral-launch-day novelty that fades once the next TikTok trend takes its place?\n\n' +
  'You\'ll have 15 minutes to answer the following questions. It is up to you to decide how long to spend on each one. You may use the charts if you wish, but they are not a requirement.';

export const STRATEGY_INDIV_CASE_QUESTIONS = [
  'HeyTea spends $2 million on a social campaign targeting U.S. Gen Z consumers that reaches 50 million people. As a result of the campaign, what percent of people do you think will convert to a visit? Based on this, will the campaign pay for itself? Assume each guest spends $8 per visit.',
  'HeyTea\'s U.S. store openings go viral on TikTok and Instagram, driving hours-long lines and sold-out merchandise on launch day, but each of these moments fades within days or weeks once the novelty wears off. Suggest strategies to convert these one-time viral visitors into long-term, repeat customers in U.S. markets.',
  'Gen-Z in the U.S. is known to prefer delivery, with the percentage of Gen-Z users who use apps like DoorDash, Uber Eats, and Grubhub rising each year. Given that HeyTea\'s in-store "aesthetic" and line culture are a key part of the brand experience, suggest strategies for ensuring American Gen Z consumers visit the physical store rather than defaulting to delivery.',
];

export const STRATEGY_INDIV_INTRO =
  'Individual interview: HeyTea case (15 minutes, part 1), then behavioral & fit questions (part 2). Score each criterion 1–5.';

/** Always asked in the final-round individual interview. */
export const STRATEGY_BEHAVIORAL_QUESTIONS = [
  'Tell me about yourself.',
  'What marketing strategy in the past 12 months captured your attention? It could be anything, ranging from a product, service, to event. Why do you think it was effective?',
  'What motivates you to be part of UMA beyond your professional goals?',
];

/** Optional prompts — interviewers pick from these at random (notes only, not scored). */
export const STRATEGY_BEHAVIORAL_QUESTION_BANK = [
  'Can you give an example of a time when you had to persuade a group to see things your way? What strategies did you use, and were you successful?',
  'Tell me about a time when you identified an opportunity for improvement within a process or system. What steps did you take to implement change?',
  'What are your strengths and what are your weaknesses?',
  'Tell me about a time you had to make a decision or move forward on a project with incomplete information. What did you do, and how did you know when you had enough to act?',
  'What is one of your favorite brands that you use every day? (wait for an answer) Market it to us.',
  'What is your Roman Empire?',
  'Teach us something in 1 minute',
];

export function strategyDefaultGuides(): InterviewGuidesRecord {
  const firstRound: InterviewGuide = {
    format: 'case_study',
    casePdfUrl: STRATEGY_GROUP_CASE_PDF,
    intro: STRATEGY_GROUP_INTRO,
    caseStudy: {
      title: 'Supreme — Group Interview Case',
      prompt: STRATEGY_GROUP_CASE_PROMPT,
      discussionPoints: [...STRATEGY_GROUP_CASE_QUESTIONS],
    },
    rubric: {
      scaleMax: 5,
      categories: [
        {
          name: 'Supreme Case',
          weight: 60,
          criteria: [
            {
              name: 'Q1. Market Sizing',
              weight: 15,
              description: 'Can they structure a market-sizing estimate and sanity-check it?',
            },
            {
              name: 'Q2. Gen Z Insight & Campaign Idea',
              weight: 30,
              description:
                'Do they understand Gen Z behavior and turn it into one real, specific campaign idea?',
            },
            {
              name: 'Q3. Growth vs. Scarcity Tradeoff',
              weight: 30,
              description:
                'Do they see both the real risk (dilution) and real upside (a fresh cohort)?',
            },
            {
              name: 'Q4. Recommendation & Summary',
              weight: 25,
              description: 'Do they land on one clear recommendation instead of listing everything?',
            },
          ],
        },
        {
          name: 'Group Process',
          weight: 40,
          criteria: [
            {
              name: 'Group Contribution',
              weight: 100,
              description: 'Do they actively participate and present their part clearly?',
            },
          ],
        },
      ],
      criteria: [
        { name: 'Q1. Market Sizing', weight: 9 },
        { name: 'Q2. Gen Z Insight & Campaign Idea', weight: 18 },
        { name: 'Q3. Growth vs. Scarcity Tradeoff', weight: 18 },
        { name: 'Q4. Recommendation & Summary', weight: 15 },
        { name: 'Group Contribution', weight: 40 },
      ],
    },
  };

  const finalRound: InterviewGuide = {
    format: 'case_and_behavioral',
    casePdfUrl: STRATEGY_INDIV_CASE_PDF,
    intro: STRATEGY_INDIV_INTRO,
    caseStudy: {
      title: 'HeyTea U.S. Expansion — Individual Interview Case',
      prompt: STRATEGY_INDIV_CASE_PROMPT,
      discussionPoints: [...STRATEGY_INDIV_CASE_QUESTIONS],
    },
    questions: [...STRATEGY_BEHAVIORAL_QUESTIONS],
    questionBank: [...STRATEGY_BEHAVIORAL_QUESTION_BANK],
    rubric: {
      scaleMax: 5,
      criteria: [
        { name: 'Q1. Campaign Math & ROI Reasoning', weight: 34 },
        { name: 'Q2. Retention Without Discounting', weight: 33 },
        { name: 'Q3. In-Store vs. Delivery', weight: 33 },
      ],
    },
    behavioralRubric: {
      scaleMax: 5,
      criteria: [
        { name: 'Communication (incl. tell me about yourself)', weight: 27 },
        { name: 'Trend Awareness', weight: 18 },
        { name: 'Motivation & Fit', weight: 18 },
        { name: 'Persuasion & Influence', weight: 18 },
        { name: 'Initiative & Process Improvement', weight: 19 },
      ],
    },
  };

  return { first_round: firstRound, final_round: finalRound };
}
