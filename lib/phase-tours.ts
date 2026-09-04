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
      'Coffee chat notes are collected through the Google Form. Admins import the responses sheet and match notes to members and applicants.',
    cta: 'Got it',
    steps: [
      {
        icon: PenLineIcon,
        title: 'Submit Via Google Form',
        description: 'After each chat, fill out the shared form with notes and impressions.',
      },
      {
        icon: ListChecksIcon,
        title: 'Admins Import Responses',
        description: 'Form responses are uploaded from Sheets and matched to UMA members.',
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
        title: 'Rate Who Advances',
        description:
          'After grading, pick five color ratings (Green → Red) on each applicant. Required before directors submit.',
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
        title: 'Rate Who Advances',
        description:
          'Graders set five color ratings (Green → Red); directors align with PMs and submit the list.',
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
        title: 'Rate Who Advances',
        description:
          'After scoring, pick five color ratings (Green → Red) on each candidate you interviewed.',
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
        title: 'Collect color ratings',
        description: 'Gather five color ratings (Green → Red) from interviewers.',
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
        title: 'Admin Saves Official Board',
        description: 'Only admins lock final acceptances on the official deliberations screen.',
      },
    ],
    execSteps: [
      {
        icon: LayoutGridIcon,
        title: 'Use Your Personal Board',
        description: 'Drag candidates and explore placements — your board autosaves.',
      },
      {
        icon: FlagIcon,
        title: 'Resolve Flags & Edge Cases',
        description: 'Weigh scores, flags, and notes before deciding.',
      },
      {
        icon: ClipboardCheckIcon,
        title: 'Follow the Admin Screen',
        description: 'Final acceptances come from the admin deliberations board.',
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
