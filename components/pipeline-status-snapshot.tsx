'use client';

import Link from 'next/link';
import StageBadge from '@/components/stage-badge';
import { RecruitmentPhaseStepper } from '@/components/recruitment-phase-stepper';
import type { RoundStatus } from '@/lib/db';
import { phaseLabel, type UnlockableStage } from '@/lib/stages';

/** Read-Only global pipeline status — matches dashboard wording; manage on dashboard. */
export function PipelineStatusSnapshot({
  status,
  unlockedStages = [],
  showStepper = true,
}: {
  status: RoundStatus;
  unlockedStages?: UnlockableStage[];
  showStepper?: boolean;
}) {
  return (
    <div className="display-panel space-y-4">
      <div className="rounded-md border border-border/50 bg-background px-4 pb-4 pt-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          Global status
        </p>
        <div className="mt-3 space-y-2">
          <StageBadge label={phaseLabel(status)} color="blue" />
          <p className="text-sm text-muted-foreground">
            All active teams are officially in this phase.{' '}
            <Link
              href="/admin/dashboard"
              className="text-primary underline-offset-2 hover:underline"
            >
              Manage on dashboard
            </Link>
          </p>
        </div>
      </div>

      {showStepper && (
        <RecruitmentPhaseStepper
          currentStatus={status}
          unlockedStages={unlockedStages}
          mode="viewer"
        />
      )}
    </div>
  );
}
