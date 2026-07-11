'use client';

import { useEffect, useState } from 'react';
import {
  RecruitmentCompleteDialog,
  wasRecruitmentCompleteDismissed,
} from '@/components/recruitment-complete-dialog';

/**
 * Mounts the celebration dialog for team-portal users once every team’s
 * final selection has been locked by admin.
 */
export function RecruitmentCompleteGate() {
  const [open, setOpen] = useState(false);
  const [cycleLabel, setCycleLabel] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/team/nav', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        if (!json.finalSelectionComplete) return;
        const label =
          typeof json.recruitmentCycleShortLabel === 'string' &&
          json.recruitmentCycleShortLabel
            ? json.recruitmentCycleShortLabel
            : typeof json.recruitmentCycleLabel === 'string' && json.recruitmentCycleLabel
              ? json.recruitmentCycleLabel.replace(/\s+Recruitment Cycle$/i, '')
              : 'complete';
        if (wasRecruitmentCompleteDismissed(label)) return;
        setCycleLabel(label);
        setOpen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!cycleLabel) return null;

  return (
    <RecruitmentCompleteDialog
      open={open}
      cycleLabel={cycleLabel}
      onOpenChange={setOpen}
    />
  );
}
