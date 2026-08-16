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
    <div className="display-panel space-y-5 p-5 sm:p-6">
      <div>
        <p className="uma-section-label">Global status</p>
        <div className="mt-3 space-y-2">
          <StageBadge label={phaseLabel(status)} color="blue" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            <Link
              href="/admin/dashboard"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Manage on dashboard
            </Link>
          </p>
        </div>
      </div>

      {showStepper && (
        <div>
          <p className="uma-section-label mb-3">Phase progression</p>
          <RecruitmentPhaseStepper
            currentStatus={status}
            unlockedStages={unlockedStages}
            mode="viewer"
          />
        </div>
      )}
    </div>
  );
}
