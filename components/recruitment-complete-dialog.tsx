'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckIcon, PartyPopperIcon } from 'lucide-react';
import { fireRecruitmentConfetti } from '@/lib/confetti-fireworks';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const DISMISS_KEY_PREFIX = 'uma-recruitment-complete-dismissed:';

function dismissKey(cycleLabel: string) {
  return `${DISMISS_KEY_PREFIX}${cycleLabel}`;
}

/**
 * Celebration dialog (blocks-so dialog-02 style) shown to non-admins once
 * admin has locked final selection for every team.
 */
export function RecruitmentCompleteDialog({
  open,
  cycleLabel,
  onOpenChange,
}: {
  open: boolean;
  cycleLabel: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    fireRecruitmentConfetti();
  }, [open]);

  const dismiss = () => {
    try {
      sessionStorage.setItem(dismissKey(cycleLabel), '1');
    } catch {
      // ignore
    }
    onOpenChange(false);
  };

  const viewFinalSelection = () => {
    dismiss();
    router.push('/team/final-selection');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-sm">
        <div className="flex flex-col items-center gap-4 px-6 pt-6 pb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <CheckIcon className="h-6 w-6 text-emerald-600" />
          </div>

          <DialogHeader className="gap-0 text-center">
            <DialogTitle className="text-balance text-center">
              Recruitment {cycleLabel} complete
            </DialogTitle>
            <DialogDescription className="mx-auto mt-2 text-pretty text-center sm:max-w-[90%]">
              Thank you everyone for your time and hard work! Click to view the next
              class of newbies!
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 px-6 pt-4 pb-6">
          <Button type="button" onClick={() => fireRecruitmentConfetti()}>
            <PartyPopperIcon data-icon="inline-start" />
            Celebrate
          </Button>
          <Button type="button" variant="outline" onClick={viewFinalSelection}>
            View final selection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function wasRecruitmentCompleteDismissed(cycleLabel: string): boolean {
  try {
    return sessionStorage.getItem(dismissKey(cycleLabel)) === '1';
  } catch {
    return false;
  }
}
