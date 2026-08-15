'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface DateSettingsResponse {
  coffeeChatStartDate: string | null;
  applicationDueDate: string | null;
  activeRoundCount: number;
}

function normalizeDate(value: string | null | undefined): string {
  return value ?? '';
}

function saveButtonLabel(loading: boolean, dirty: boolean): string {
  if (loading) return 'Saving…';
  if (!dirty) return 'Saved';
  return 'Save dates';
}

export function CoffeeChatDateSettings({ onSaved }: { onSaved?: () => void }) {
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [savedStartDate, setSavedStartDate] = useState('');
  const [savedDueDate, setSavedDueDate] = useState('');
  const [roundCount, setRoundCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [open, setOpen] = useState(true);

  const isDirty = useMemo(
    () => startDate !== savedStartDate || dueDate !== savedDueDate,
    [startDate, dueDate, savedStartDate, savedDueDate],
  );

  const applyLoadedDates = useCallback((json: DateSettingsResponse) => {
    const nextStart = normalizeDate(json.coffeeChatStartDate);
    const nextDue = normalizeDate(json.applicationDueDate);
    setStartDate(nextStart);
    setDueDate(nextDue);
    setSavedStartDate(nextStart);
    setSavedDueDate(nextDue);
    setRoundCount(json.activeRoundCount ?? 0);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/coffee-chat-dates');
      const json = (await res.json()) as DateSettingsResponse;
      if (!res.ok) {
        setError((json as { error?: string }).error ?? 'Failed to load dates.');
        return;
      }
      applyLoadedDates(json);
    } catch {
      setError('Failed to load dates.');
    } finally {
      setLoading(false);
    }
  }, [applyLoadedDates]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!isDirty || saving) return;

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/coffee-chat-dates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coffeeChatStartDate: startDate || null,
          applicationDueDate: dueDate || null,
        }),
      });
      const json = (await res.json()) as DateSettingsResponse & { error?: string };
      if (!res.ok) {
        const message = json.error ?? 'Save failed.';
        setError(message);
        toast.error(message);
        return;
      }

      const savedRounds = json.activeRoundCount ?? 0;
      setSavedStartDate(startDate);
      setSavedDueDate(dueDate);
      setRoundCount(savedRounds);
      setSuccess(
        savedRounds > 0
          ? `Saved for all ${savedRounds} teams.`
          : 'Ready for intake.',
      );
      toast.success('Dates saved.');
      onSaved?.();
    } catch {
      setError('Network error.');
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="display-panel">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <div>
          <p className="text-sm font-medium">Coffee chat window</p>
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
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="Loading">
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          ) : (
            <>
          {roundCount === 0 && (
            <p className="text-sm text-muted-foreground">
              No teams set up yet. Saving will initialize this phase for every team.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="coffeeChatStartDate" required>
                Opens
              </Label>
              <Input
                id="coffeeChatStartDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="applicationDueDate" required>
                Closes
              </Label>
              <Input
                id="applicationDueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <LoadingButton
              size="sm"
              loading={saving}
              disabled={!isDirty}
              onClick={handleSave}
            >
              {saveButtonLabel(saving, isDirty)}
            </LoadingButton>
          </div>

          {success && <p className="text-sm text-green-700 dark:text-green-400">{success}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
