'use client';

import { useRouter } from 'next/navigation';
import { CircleHelpIcon, PencilIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function GradingEditControl({
  teamId,
  applicationId,
  locked,
  lockMessage,
  label = 'Edit scores',
}: {
  teamId: string;
  applicationId: number;
  locked: boolean;
  lockMessage: string;
  label?: string;
}) {
  const router = useRouter();
  const href = `/team/${teamId}/grade/${applicationId}`;

  if (!locked) {
    return (
      <button
        type="button"
        onClick={() => router.push(href)}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={label}
      >
        <PencilIcon className="size-4" />
      </button>
    );
  }

  return (
    <TooltipProvider delay={0}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className="inline-flex h-8 shrink-0 cursor-not-allowed items-center gap-1 rounded-md px-1.5 text-muted-foreground/40"
              aria-label={lockMessage}
            >
              <PencilIcon className="size-4" />
              <CircleHelpIcon className="size-3.5" />
            </span>
          }
        />
        <TooltipContent>{lockMessage}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
