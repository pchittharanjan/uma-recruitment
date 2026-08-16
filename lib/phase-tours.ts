import {
  CalendarIcon,
  ClipboardCheckIcon,
  CoffeeIcon,
  FileTextIcon,
  FlagIcon,
  LayoutGridIcon,
  ListChecksIcon,
  MicIcon,
  PenLineIcon,
  UsersIcon,
  UserCheckIcon,
  type LucideIcon,
} from 'lucide-react';
import type { RoundStatus } from '@/lib/db';
import { phaseLabel } from '@/lib/stages';

export type PhaseTourStep = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export type PhaseTourContent = {
  icon: LucideIcon;
  iconClass: string;
  ringClass: string;
  message: string;
  cta: string;
  steps: PhaseTourStep[];
  /** When set, team execs see these steps instead of `steps`. */
  execSteps?: PhaseTourStep[];
};

export const PHASE_TOURS: Partial<Record<RoundStatus, PhaseTourContent>> = {
  pre_application: {
    icon: CoffeeIcon,
    iconClass: 'text-amber-700',
    ringClass: 'bg-amber-100 ring-amber-200/80',
    message:
      'Record & Evaluate your coffee chats here. You will be able to edit your notes while coffee chats are open and view them once the period has closed.',
    cta: 'Log a Coffee Chat',
    steps: [
      {
        icon: PenLineIcon,
        title: 'Log each coffee chat',
        description: 'Record notes and impressions right after you meet someone.',
      },
      {
        icon: ListChecksIcon,
        title: 'Track who you have met',
        description: 'See your history and follow up before applications begin.',
      },
      {
        icon: ClipboardCheckIcon,
        title: 'Prepare for applications',
        description: 'Use what you learned to get ready for blind app grading.',
      },
    ],
  },
  application: {
    icon: FileTextIcon,
    iconClass: 'text-sky-700',
    ringClass: 'bg-sky-100 ring-sky-200/80',
    message:
      'Score the applications assigned to you — names stay hidden for blind review.',
    cta: 'Start grading',
    steps: [
      {
        icon: FileTextIcon,
        title: '1. Grade your assignments',
        description: 'Score each application on merit — identifying info is stripped.',
      },
      {
        icon: FlagIcon,
        title: '2. Add color recommendations',
        description:
          'After grading, mark who you think should move forward with color signals.',
      },
      {
        icon: UsersIcon,
        title: '3. Directors finalize',
        description:
          'Directors meet with PMs, then submit the advancement list to Admin.',
      },
    ],
    execSteps: [
      {
        icon: UsersIcon,
        title: 'Monitor team progress',
        description: 'See who has finished grading and who still has apps left.',
      },
      {
        icon: FlagIcon,
        title: 'Color recommendations',
        description:
          'Graders set signals; Directors align with PMs and submit the list.',
      },
      {
        icon: ClipboardCheckIcon,
        title: 'Advance when ready',
        description: 'Move to First Round once Admin approves the advancement list.',
      },
    ],
  },
  first_round: {
    icon: MicIcon,
    iconClass: 'text-violet-700',
    ringClass: 'bg-violet-100 ring-violet-200/80',
    message:
      'Score each interview on the rubric — prior application scores stay hidden.',
    cta: 'Go to First Round',
    steps: [
      {
        icon: CalendarIcon,
        title: '1. Check your schedule',
        description: 'See interview slots and candidates assigned to you.',
      },
      {
        icon: MicIcon,
        title: '2. Score your interviews',
        description: 'Submit rubric scores after each conversation.',
      },
      {
        icon: FlagIcon,
        title: '3. Add color recommendations',
        description:
          'After scoring, mark who you think should move forward. Directors finalize with PMs.',
      },
    ],
    execSteps: [
      {
        icon: CalendarIcon,
        title: 'Set interview schedules',
        description: 'Configure dates and assign interviewers to slots.',
      },
      {
        icon: UsersIcon,
        title: 'Track completion',
        description: 'Monitor which interviews still need scores.',
      },
      {
        icon: FlagIcon,
        title: 'Recommendations & advance',
        description:
          'Collect color signals, meet with PMs, then submit the list to Admin.',
      },
    ],
  },
  final_round: {
    icon: UserCheckIcon,
    iconClass: 'text-emerald-700',
    ringClass: 'bg-emerald-100 ring-emerald-200/80',
    message:
      'Score each final interview on the rubric before the team moves to deliberations.',
    cta: 'Go to Final Round',
    steps: [
      {
        icon: CalendarIcon,
        title: 'Review your final slots',
        description: 'See who you are interviewing and when.',
      },
      {
        icon: UserCheckIcon,
        title: 'Submit final scores',
        description: 'Rate each candidate on the final-round rubric.',
      },
      {
        icon: ClipboardCheckIcon,
        title: 'Wrap up all interviews',
        description: 'Complete every slot so deliberations can begin.',
      },
    ],
    execSteps: [
      {
        icon: CalendarIcon,
        title: 'Coordinate final schedules',
        description: 'Assign interviewers and confirm slot coverage.',
      },
      {
        icon: UsersIcon,
        title: 'Monitor team progress',
        description: 'Track which final interviews still need scores.',
      },
      {
        icon: ClipboardCheckIcon,
        title: 'Advance to deliberations',
        description: 'Open deliberations once final scoring is complete.',
      },
    ],
  },
  deliberations: {
    icon: LayoutGridIcon,
    iconClass: 'text-orange-700',
    ringClass: 'bg-orange-100 ring-orange-200/80',
    message:
      'Review merged scores and flags with your team, then decide final placements.',
    cta: 'Open deliberations',
    steps: [
      {
        icon: LayoutGridIcon,
        title: 'Explore the canvas',
        description: 'Review merged scores, flags, and notes in one place.',
      },
      {
        icon: FlagIcon,
        title: 'Discuss as a team',
        description: 'Arrange candidates and talk through edge cases together.',
      },
      {
        icon: UsersIcon,
        title: 'Execs save & advance',
        description: 'Only team execs can lock placements and move forward.',
      },
    ],
    execSteps: [
      {
        icon: LayoutGridIcon,
        title: 'Lead the canvas session',
        description: 'Organize candidates and guide the team discussion.',
      },
      {
        icon: FlagIcon,
        title: 'Resolve flags & edge cases',
        description: 'Weigh scores, flags, and notes before deciding.',
      },
      {
        icon: ClipboardCheckIcon,
        title: 'Save placements & advance',
        description: 'Lock your selections and close out the cycle.',
      },
    ],
  },
};

export function getPhaseTourContent(
  status: RoundStatus,
  options?: { isExec?: boolean },
): PhaseTourContent | null {
  const tour = PHASE_TOURS[status];
  if (!tour) return null;

  const steps =
    options?.isExec && tour.execSteps && tour.execSteps.length > 0
      ? tour.execSteps
      : tour.steps;

  return { ...tour, steps };
}

export function phaseOpenedCtaLabel(status: RoundStatus): string {
  return PHASE_TOURS[status]?.cta ?? 'Continue';
}

export function firstNameFromDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Welcome';
  const first = trimmed.split(/\s+/)[0];
  return first || trimmed;
}

/** "{Name}! Welcome to the {Phase} phase!" — or generic welcome if name is missing. */
export function phaseWelcomeHeadline(displayName: string, status: RoundStatus): string {
  const label = phaseLabel(status);
  const firstName = firstNameFromDisplayName(displayName);
  if (firstName === 'Welcome') {
    return `Welcome to the ${label} phase!`;
  }
  return `${firstName}! Welcome to the ${label} phase!`;
}
