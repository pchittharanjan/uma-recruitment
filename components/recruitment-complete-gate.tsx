'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  RecruitmentCompleteDialog,
  wasRecruitmentCompleteDismissed,
} from '@/components/recruitment-complete-dialog';
import { useTeamNav } from '@/components/team-nav-provider';

function isAdvancementPath(pathname: string): boolean {
  return /\/advancement(?:\/|$)/.test(pathname);
}

function pipelineIsFinished(nav: NonNullable<ReturnType<typeof useTeamNav>['nav']>): boolean {
  if (nav.pipelineClosed) return true;
  return nav.teams.some(
    (team) =>
      team.round?.status === 'closed' || team.round?.status === 'deliberations',
  );
}

/**
 * Mounts the celebration dialog for team-portal users once every team’s
 * final selection has been locked by admin — never mid-pipeline, and never
 * on advancement pages.
 */
export function RecruitmentCompleteGate() {
  const { nav } = useTeamNav();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [cycleLabel, setCycleLabel] = useState('');

  useEffect(() => {
    if (!nav) {
      setOpen(false);
      return;
    }

    const shouldShow =
      nav.finalSelectionComplete &&
      pipelineIsFinished(nav) &&
      !isAdvancementPath(pathname);

    if (!shouldShow) {
      setOpen(false);
      return;
    }

    const label =
      nav.recruitmentCycleShortLabel ||
      (nav.recruitmentCycleLabel
        ? nav.recruitmentCycleLabel.replace(/\s+Recruitment Cycle$/i, '')
        : 'complete');
    if (wasRecruitmentCompleteDismissed(label)) {
      setOpen(false);
      return;
    }
    setCycleLabel(label);
    setOpen(true);
  }, [nav, pathname]);

  if (!cycleLabel) return null;

  return (
    <RecruitmentCompleteDialog
      open={open}
      cycleLabel={cycleLabel}
      onOpenChange={setOpen}
    />
  );
}
