'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import {
  SettingsPanel,
  settingsControlClass,
  settingsDateFieldWidth,
  settingsTimeFieldWidth,
} from '@/components/settings-panel';
import { NumberDraftInput } from '@/components/number-draft-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RoundStatus } from '@/lib/db';
import {
  MAX_INTERVIEW_GROUP_SIZE,
  MIN_INTERVIEW_GROUP_SIZE,
} from '@/lib/interview-schedule-constants';
import { phaseLabel } from '@/lib/stages';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface InterviewScheduleConfig {
  firstRoundDate: string | null;
  firstRoundStartTime: string;
  finalRoundDate: string | null;
  finalRoundStartTime: string;
  blockMinutes: number;
  groupSize: number;
  parallelGroupsPerBlock: number;
}

type InterviewRoundView = Extract<RoundStatus, 'first_round' | 'final_round'>;

export function InterviewScheduleSettings({
  viewingStatus,
  onSaved,
}: {
  viewingStatus: InterviewRoundView;
  onSaved?: () => void;
}) {
  const [config, setConfig] = useState<InterviewScheduleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [open, setOpen] = useState(true);

  const isFirstRound = viewingStatus === 'first_round';
  const roundLabel = phaseLabel(viewingStatus);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/interview-schedule');
      const json = (await res.json()) as InterviewScheduleConfig & { error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Failed to load interview schedule settings.');
        return;
      }
      setConfig(json);
    } catch {
      setError('Failed to load interview schedule settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/interview-schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error ?? 'Save failed.';
        setError(message);
        toast.error(message);
        return;
      }
      setConfig(json);
      const message = `${roundLabel} interview schedule saved.`;
      setSuccess(message);
      toast.success(message);
      onSaved?.();
    } catch {
      setError('Network error.');
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

  const dateValue = isFirstRound ? (config?.firstRoundDate ?? '') : (config?.finalRoundDate ?? '');
  const timeValue = isFirstRound ? (config?.firstRoundStartTime ?? '') : (config?.finalRoundStartTime ?? '');

  if (!config && !loading) {
    return error ? <p className="text-sm text-destructive">{error}</p> : null;
  }

  return (
    <SettingsPanel
      label={`${roundLabel} interview day`}
      open={open}
      onOpenChange={setOpen}
      loading={loading}
      collapsedSummary={dateValue || undefined}
    >
      {loading || !config ? (
        <div className="flex flex-wrap items-end gap-3" role="status" aria-label="Loading">
          <div className={cn(settingsDateFieldWidth, 'space-y-1')}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className={cn(settingsTimeFieldWidth, 'space-y-1')}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className={cn(settingsDateFieldWidth, 'space-y-1')}>
              <Label htmlFor="interviewDate" className="text-sm" required>
                Interview date
              </Label>
              <Input
                id="interviewDate"
                type="date"
                className={settingsControlClass}
                value={dateValue}
                onChange={(e) =>
                  setConfig((prev) =>
                    prev
                      ? isFirstRound
                        ? { ...prev, firstRoundDate: e.target.value || null }
                        : { ...prev, finalRoundDate: e.target.value || null }
                      : prev,
                  )
                }
              />
            </div>
            <div className={cn(settingsTimeFieldWidth, 'space-y-1')}>
              <Label htmlFor="interviewStartTime" className="text-sm" required>
                First block starts
              </Label>
              <Input
                id="interviewStartTime"
                type="time"
                className={settingsControlClass}
                value={timeValue}
                onChange={(e) =>
                  setConfig((prev) =>
                    prev
                      ? isFirstRound
                        ? { ...prev, firstRoundStartTime: e.target.value }
                        : { ...prev, finalRoundStartTime: e.target.value }
                      : prev,
                  )
                }
              />
            </div>
            <div className="w-[8.5rem] space-y-1">
              <Label htmlFor="blockMinutes" className="text-sm" required>
                Block minutes
              </Label>
              <NumberDraftInput
                id="blockMinutes"
                integer
                className={settingsControlClass}
                min={15}
                max={120}
                value={config.blockMinutes}
                onCommit={(blockMinutes) =>
                  setConfig((prev) => (prev ? { ...prev, blockMinutes } : prev))
                }
              />
            </div>
            {isFirstRound ? (
              <div className="w-[7.5rem] space-y-1">
                <Label htmlFor="groupSize" className="text-sm" required>
                  Group size
                </Label>
                <NumberDraftInput
                  id="groupSize"
                  integer
                  className={settingsControlClass}
                  min={MIN_INTERVIEW_GROUP_SIZE}
                  max={MAX_INTERVIEW_GROUP_SIZE}
                  value={config.groupSize}
                  onCommit={(groupSize) =>
                    setConfig((prev) => (prev ? { ...prev, groupSize } : prev))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Target size for auto-scheduling. You can put up to{' '}
                  {MAX_INTERVIEW_GROUP_SIZE} applicants in a session manually.
                </p>
              </div>
            ) : null}
            <LoadingButton size="sm" className="ml-auto" disabled={saving} onClick={handleSave}>
              Save {roundLabel.toLowerCase()} schedule
            </LoadingButton>
          </div>

          {success && <p className="text-sm text-success">{success}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <p className="text-sm text-muted-foreground">
            Per-team slot assignments live on each team&apos;s{' '}
            <Link
              href={`/admin/dashboard?view=${viewingStatus}`}
              className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
            >
              schedule pages
            </Link>
            .
          </p>
        </>
      )}
    </SettingsPanel>
  );
}
