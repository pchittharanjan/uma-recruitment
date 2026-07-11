'use client';

import { useRouter } from 'next/navigation';
import { CircleArrowRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { RoundStatus } from '@/lib/db';
import { phaseLabel } from '@/lib/stages';

const DISMISS_KEY_PREFIX = 'uma-phase-opened-dismissed:';

function dismissKey(cycleLabel: string, status: RoundStatus) {
  return `${DISMISS_KEY_PREFIX}${cycleLabel}:${status}`;
}

/** Phases that warrant a “new phase open” invite (not setup / closed). */
export const ANNOUNCEABLE_PHASES: RoundStatus[] = [
  'pre_application',
  'application',
  'first_round',
  'final_round',
  'deliberations',
];

export function isAnnounceablePhase(status: RoundStatus): boolean {
  return ANNOUNCEABLE_PHASES.includes(status);
}

export function phaseOpenedCtaLabel(status: RoundStatus): string {
  switch (status) {
    case 'pre_application':
      return 'View coffee chats';
    case 'application':
      return 'Start grading';
    case 'first_round':
      return 'Go to First Round';
    case 'final_round':
      return 'Go to Final Round';
    case 'deliberations':
      return 'Open deliberations';
    default:
      return 'Continue';
  }
}

function phaseOpenedDescription(status: RoundStatus): string {
  switch (status) {
    case 'pre_application':
      return 'Coffee Chats are open. Log chats and get ready for applications.';
    case 'application':
      return 'Application grading is open. Review the apps assigned to you.';
    case 'first_round':
      return 'First Round interviews are open. Score your assigned slots.';
    case 'final_round':
      return 'Final Round interviews are open. Score your assigned slots.';
    case 'deliberations':
      return 'Deliberations are open. Review candidates and explore placements.';
    default:
      return 'A new recruitment phase is open. Continue where the team needs you.';
  }
}

/**
 * Single-CTA dialog (blocks-so dialog-01 style) when a pipeline phase opens.
 * No confetti — that stays reserved for final selection.
 */
export function PhaseOpenedDialog({
  open,
  status,
  cycleLabel,
  href,
  onOpenChange,
}: {
  open: boolean;
  status: RoundStatus;
  cycleLabel: string;
  href: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const label = phaseLabel(status);
  const cta = phaseOpenedCtaLabel(status);

  const dismiss = () => {
    try {
      sessionStorage.setItem(dismissKey(cycleLabel, status), '1');
    } catch {
      // ignore
    }
    onOpenChange(false);
  };

  const goToPhase = () => {
    dismiss();
    router.push(href);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="flex flex-col items-center sm:max-w-sm">
        <div className="flex justify-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-100">
            <CircleArrowRightIcon className="h-6 w-6 text-sky-700" />
          </div>
        </div>

        <DialogHeader className="gap-0 text-center">
          <DialogTitle className="text-balance text-center">{label} is open</DialogTitle>
          <DialogDescription className="mx-auto mt-2 text-pretty text-center sm:max-w-[90%]">
            {phaseOpenedDescription(status)}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="w-full sm:justify-center">
          <Button type="button" className="w-full" onClick={goToPhase}>
            {cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function wasPhaseOpenedDismissed(cycleLabel: string, status: RoundStatus): boolean {
  try {
    return sessionStorage.getItem(dismissKey(cycleLabel, status)) === '1';
  } catch {
    return false;
  }
}
