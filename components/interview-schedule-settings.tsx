'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDownIcon } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RoundStatus } from '@/lib/db';
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

  if (!config && !loading) {
    return error ? <p className="text-sm text-destructive">{error}</p> : null;
  }

  return (
    <div className="display-panel">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="space-y-1">
          <p className="text-sm font-medium">{roundLabel} Interview day</p>
        </div>
        <ChevronDownIcon
          className={cn(
            'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {loading || !config ? (
            <div className="space-y-4" role="status" aria-label="Loading">
              <div className="grid gap-4 rounded-md bg-muted/30 p-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-9 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-9 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>
            </div>
          ) : (
            <>
          <div className="grid gap-4 rounded-md border border-primary/30 bg-primary/5 p-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="interviewDate" required>
                Interview date
              </Label>
              <Input
                id="interviewDate"
                type="date"
                value={
                  isFirstRound ? (config.firstRoundDate ?? '') : (config.finalRoundDate ?? '')
                }
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
            <div className="space-y-2">
              <Label htmlFor="interviewStartTime" required>
                First block starts
              </Label>
              <Input
                id="interviewStartTime"
                type="time"
                value={isFirstRound ? config.firstRoundStartTime : config.finalRoundStartTime}
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
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="blockMinutes" required>
                Block length (minutes)
              </Label>
              <Input
                id="blockMinutes"
                type="number"
                min={15}
                max={120}
                step={5}
                value={config.blockMinutes}
                onChange={(e) =>
                  setConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          blockMinutes: Number.parseInt(e.target.value, 10) || 30,
                        }
                      : prev,
                  )
                }
              />
            </div>
            {isFirstRound && (
              <div className="space-y-2">
                <Label htmlFor="groupSize" required>
                  Max group size
                </Label>
                <Input
                  id="groupSize"
                  type="number"
                  min={2}
                  max={12}
                  value={config.groupSize}
                  onChange={(e) =>
                    setConfig((prev) =>
                      prev
                        ? { ...prev, groupSize: Number.parseInt(e.target.value, 10) || 4 }
                        : prev,
                    )
                  }
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <LoadingButton size="sm" disabled={saving} onClick={handleSave}>
              Save {roundLabel.toLowerCase()} schedule
            </LoadingButton>
          </div>

          {success && <p className="text-sm text-green-700 dark:text-green-400">{success}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <p className="text-sm text-muted-foreground">
            Per-team slot assignments live on each team&apos;s{' '}
            <Link
              href={`/admin/dashboard?view=${viewingStatus}`}
              className="underline underline-offset-2"
            >
              schedule pages
            </Link>
            .
          </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
