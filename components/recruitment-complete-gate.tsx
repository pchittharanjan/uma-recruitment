'use client';

import { useEffect, useState } from 'react';
import {
  RecruitmentCompleteDialog,
  wasRecruitmentCompleteDismissed,
} from '@/components/recruitment-complete-dialog';
import { useTeamNav } from '@/components/team-nav-provider';

/**
 * Mounts the celebration dialog for team-portal users once every team’s
 * final selection has been locked by admin.
 */
export function RecruitmentCompleteGate() {
  const { nav } = useTeamNav();
  const [open, setOpen] = useState(false);
  const [cycleLabel, setCycleLabel] = useState('');

  useEffect(() => {
    if (!nav?.finalSelectionComplete) return;
    const label =
      nav.recruitmentCycleShortLabel ||
      (nav.recruitmentCycleLabel
        ? nav.recruitmentCycleLabel.replace(/\s+Recruitment Cycle$/i, '')
        : 'complete');
    if (wasRecruitmentCompleteDismissed(label)) return;
    setCycleLabel(label);
    setOpen(true);
  }, [nav]);

  if (!cycleLabel) return null;

  return (
    <RecruitmentCompleteDialog
      open={open}
      cycleLabel={cycleLabel}
      onOpenChange={setOpen}
    />
  );
}
