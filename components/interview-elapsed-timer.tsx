'use client';

import { ClockIcon, PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ElapsedTimer } from '@/hooks/use-elapsed-timer';

export function InterviewElapsedTimer({
  elapsed,
  running,
  start,
  pause,
  reset,
  className,
}: ElapsedTimer & { className?: string }) {
  return (
    <div
      className={cn('inline-flex h-8 shrink-0 items-center gap-1', className)}
    >
      <div
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-foreground/15 bg-background px-2.5 text-xs font-medium tabular-nums text-muted-foreground sm:text-sm"
        role="timer"
        aria-live="off"
        aria-label={`Timer ${elapsed}${running ? ', running' : ', paused'}`}
        title={`Timer ${elapsed}`}
      >
        <ClockIcon className="size-3.5 shrink-0" aria-hidden />
        <span>
          <span className="hidden sm:inline">Timer </span>
          {elapsed}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="size-8 border-foreground/25 bg-background"
        aria-label="Start timer"
        title="Start"
        disabled={running}
        onClick={start}
      >
        <PlayIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="size-8 border-foreground/25 bg-background"
        aria-label="Pause timer"
        title="Pause"
        disabled={!running}
        onClick={pause}
      >
        <PauseIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="size-8 border-foreground/25 bg-background"
        aria-label="Reset timer"
        title="Reset"
        onClick={reset}
      >
        <RotateCcwIcon className="size-3.5" />
      </Button>
    </div>
  );
}
