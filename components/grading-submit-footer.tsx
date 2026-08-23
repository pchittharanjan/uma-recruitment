'use client';

import LoadingButton from '@/components/loading-button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface GradingSubmitFooterProps {
  scoredCount: number;
  totalScored: number;
  onSubmit: () => void;
  submitting?: boolean;
  locked?: boolean;
  lockedLabel?: string;
  /** Sticky card footer for full-page scroll; flat bar for nested preview panels. */
  variant?: 'sticky' | 'embedded';
  className?: string;
}

export function GradingSubmitFooter({
  scoredCount,
  totalScored,
  onSubmit,
  submitting = false,
  locked = false,
  lockedLabel = 'Editing locked',
  variant = 'sticky',
  className,
}: GradingSubmitFooterProps) {
  const remaining = Math.max(0, totalScored - scoredCount);
  const allScored = totalScored > 0 && remaining === 0;
  const progressValue = totalScored > 0 ? Math.round((scoredCount / totalScored) * 100) : 0;
  const isEmbedded = variant === 'embedded';

  const body = (
    <>
      <Progress
        value={progressValue}
        max={100}
        className="w-full gap-0 [&_[data-slot=progress-track]]:h-2"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">
            {scoredCount} of {totalScored}
          </span>{' '}
          fields scored
          {!allScored && !locked && (
            <span className="text-muted-foreground">
              {' '}
              · {remaining} remaining
            </span>
          )}
        </p>

        <LoadingButton
          onClick={onSubmit}
          loading={submitting}
          disabled={locked}
          variant="primary"
          className="min-w-28 shrink-0"
        >
          {locked ? lockedLabel : 'Submit →'}
        </LoadingButton>
      </div>
    </>
  );

  if (isEmbedded) {
    return (
      <div
        data-tour="grade-form-submit"
        className={cn(
          'flex shrink-0 flex-col gap-4 border-t border-border bg-muted/50 px-6 py-4 sm:px-7 lg:px-8',
          className,
        )}
      >
        {body}
      </div>
    );
  }

  return (
    <div
      data-tour="grade-form-submit"
      className={cn(
        'sticky bottom-0 z-10 -mx-1 bg-background/95 pt-3 backdrop-blur',
        className,
      )}
    >
      <Card className="gap-4 px-5 py-4">
        {body}
      </Card>
    </div>
  );
}
