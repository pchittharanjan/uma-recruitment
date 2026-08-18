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
        title: 'Log Each Coffee Chat',
        description: 'Record notes and impressions right after you meet someone.',
      },
      {
        icon: ListChecksIcon,
        title: 'Track Who You Have Met',
        description: 'See your history and follow up before applications begin.',
      },
      {
        icon: ClipboardCheckIcon,
        title: 'Prepare for Applications',
        description: 'Use what you learned to get ready for blind app grading.',
      },
    ],
  },
  application: {
    icon: FileTextIcon,
    iconClass: 'text-sky-700',
    ringClass: 'bg-sky-100 ring-sky-200/80',
    message:
      'Score the applications assigned to you, and names stay hidden for blind review.',
    cta: 'Start Grading',
    steps: [
      {
        icon: FileTextIcon,
        title: 'Grade Your Assignments',
        description: 'Score each application on merit, and identifying info is stripped.',
      },
      {
        icon: FlagIcon,
        title: 'Add Color Recommendations',
        description:
          'After grading, mark who you think should move forward with color signals.',
      },
      {
        icon: UsersIcon,
        title: 'Directors Finalize',
        description:
          'Directors meet with PMs, then submit the advancement list to Admin.',
      },
    ],
    execSteps: [
      {
        icon: UsersIcon,
        title: 'Monitor Team Progress',
        description: 'See who has finished grading and who still has apps left.',
      },
      {
        icon: FlagIcon,
        title: 'Color Recommendations',
        description:
          'Graders set signals; Directors align with PMs and submit the list.',
      },
      {
        icon: ClipboardCheckIcon,
        title: 'Advance When Ready',
        description: 'Move to First Round once Admin approves the advancement list.',
      },
    ],
  },
  first_round: {
    icon: MicIcon,
    iconClass: 'text-violet-700',
    ringClass: 'bg-violet-100 ring-violet-200/80',
    message: '',
    cta: 'Begin Interviews',
    steps: [
      {
        icon: CalendarIcon,
        title: 'Check Your Schedule',
        description: 'See which interviews are assigned to you.',
      },
      {
        icon: MicIcon,
        title: 'Score Your Interviews',
        description: 'Submit your score after each interview.',
      },
      {
        icon: FlagIcon,
        title: 'Add Color Recommendations',
        description: 'After scoring, mark each candidate Green, Yellow, or Red.',
      },
    ],
    execSteps: [
      {
        icon: CalendarIcon,
        title: 'Set Interview Schedules',
        description: 'Configure dates and assign interviewers to slots.',
      },
      {
        icon: UsersIcon,
        title: 'Track Completion',
        description: 'Watch until all assigned interviews are scored.',
      },
      {
        icon: FlagIcon,
        title: 'Collect Color Signals',
        description: 'Gather Green/Yellow/Red signals from interviewers.',
      },
      {
        icon: UsersIcon,
        title: 'Discuss Who Advances with PMs',
        description:
          'Set up a call to discuss who advances and who doesn’t, then submit the list to Admin.',
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
        title: 'Review Your Final Slots',
        description: 'See who you are interviewing and when.',
      },
      {
        icon: UserCheckIcon,
        title: 'Submit Final Scores',
        description: 'Rate each candidate on the final-round rubric.',
      },
      {
        icon: ClipboardCheckIcon,
        title: 'Wrap Up All Interviews',
        description: 'Complete every slot so deliberations can begin.',
      },
    ],
    execSteps: [
      {
        icon: CalendarIcon,
        title: 'Coordinate Final Schedules',
        description: 'Assign interviewers and confirm slot coverage.',
      },
      {
        icon: UsersIcon,
        title: 'Monitor Team Progress',
        description: 'Track which final interviews still need scores.',
      },
      {
        icon: ClipboardCheckIcon,
        title: 'Advance to Deliberations',
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
    cta: 'Open Deliberations',
    steps: [
      {
        icon: LayoutGridIcon,
        title: 'Explore the Canvas',
        description: 'Review merged scores, flags, and notes in one place.',
      },
      {
        icon: FlagIcon,
        title: 'Discuss as a Team',
        description: 'Arrange candidates and talk through edge cases together.',
      },
      {
        icon: UsersIcon,
        title: 'Execs Save & Advance',
        description: 'Only team execs can lock placements and move forward.',
      },
    ],
    execSteps: [
      {
        icon: LayoutGridIcon,
        title: 'Lead the Canvas Session',
        description: 'Organize candidates and guide the team discussion.',
      },
      {
        icon: FlagIcon,
        title: 'Resolve Flags & Edge Cases',
        description: 'Weigh scores, flags, and notes before deciding.',
      },
      {
        icon: ClipboardCheckIcon,
        title: 'Save Placements & Advance',
        description: 'Lock your selections and close out the cycle.',
      },
    ],
  },
};

export function getPhaseTourContent(
  status: RoundStatus,
  options?: { isDirector?: boolean },
): PhaseTourContent | null {
  const tour = PHASE_TOURS[status];
  if (!tour) return null;

  const steps =
    options?.isDirector && tour.execSteps && tour.execSteps.length > 0
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

/** "{Name}! Welcome to the {Team}'s {Phase} phase!" — or generic welcome if name is missing. */
export function phaseWelcomeHeadline(displayName: string, status: RoundStatus, teamName?: string | null): string {
  const label = phaseLabel(status);
  const firstName = firstNameFromDisplayName(displayName);
  const teamPrefix = teamName ? `${teamName}'s ` : '';
  if (firstName === 'Welcome') {
    return `Welcome to the ${teamPrefix}${label} phase!`;
  }
  return `${firstName}! Welcome to the ${teamPrefix}${label} phase!`;
}
