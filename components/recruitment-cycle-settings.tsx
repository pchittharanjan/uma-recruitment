'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  RECRUITMENT_CYCLE_MAX_YEAR,
  RECRUITMENT_CYCLE_MIN_YEAR,
  type RecruitmentSemester,
} from '@/lib/org-recruitment-cycle';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface CycleSettingsResponse {
  semester: RecruitmentSemester;
  year: number;
  label: string;
  activeRoundCount: number;
}

const YEAR_OPTIONS = Array.from(
  { length: RECRUITMENT_CYCLE_MAX_YEAR - RECRUITMENT_CYCLE_MIN_YEAR + 1 },
  (_, index) => RECRUITMENT_CYCLE_MIN_YEAR + index,
);

function saveButtonLabel(loading: boolean, dirty: boolean): string {
  if (loading) return 'Saving…';
  if (!dirty) return 'Saved';
  return 'Save cycle';
}

export function RecruitmentCycleSettings({ onSaved }: { onSaved?: () => void }) {
  const [semester, setSemester] = useState<RecruitmentSemester>('fall');
  const [year, setYear] = useState(RECRUITMENT_CYCLE_MIN_YEAR);
  const [savedSemester, setSavedSemester] = useState<RecruitmentSemester>('fall');
  const [savedYear, setSavedYear] = useState(RECRUITMENT_CYCLE_MIN_YEAR);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [open, setOpen] = useState(true);

  const isDirty = useMemo(
    () => semester !== savedSemester || year !== savedYear,
    [semester, year, savedSemester, savedYear],
  );

  const applyLoadedCycle = useCallback((json: CycleSettingsResponse) => {
    setSemester(json.semester);
    setYear(json.year);
    setSavedSemester(json.semester);
    setSavedYear(json.year);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/recruitment-cycle');
      const json = (await res.json()) as CycleSettingsResponse;
      if (!res.ok) {
        setError((json as { error?: string }).error ?? 'Failed to load recruitment cycle.');
        return;
      }
      applyLoadedCycle(json);
    } catch {
      setError('Failed to load recruitment cycle.');
    } finally {
      setLoading(false);
    }
  }, [applyLoadedCycle]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!isDirty || saving) return;

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/recruitment-cycle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semester, year }),
      });
      const json = (await res.json()) as CycleSettingsResponse & { error?: string };
      if (!res.ok) {
        const message = json.error ?? 'Save failed.';
        setError(message);
        toast.error(message);
        return;
      }

      const savedRounds = json.activeRoundCount ?? 0;
      setSavedSemester(semester);
      setSavedYear(year);
      setSuccess(
        savedRounds > 0
          ? `Recruitment cycle saved and applied to ${savedRounds} active round(s).`
          : 'Recruitment cycle saved.',
      );
      toast.success('Recruitment cycle saved.');
      onSaved?.();
    } catch {
      setError('Network error.');
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="display-panel px-4 py-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <div>
          <p className="uma-section-label">Recruitment cycle</p>
          {!open && !loading && (
            <p className="mt-1 text-sm font-medium text-foreground">
              {semester === 'fall' ? 'Fall' : 'Spring'} {year}
            </p>
          )}
        </div>
        <ChevronDownIcon
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {loading ? (
            <div className="flex flex-wrap items-end gap-3" role="status" aria-label="Loading">
              <div className="w-[7.5rem] space-y-1">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-full" />
              </div>
              <div className="w-[5.5rem] space-y-1">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          ) : (
            <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-[7.5rem] space-y-1">
              <Label htmlFor="recruitmentSemester" className="text-sm" required>
                Semester
              </Label>
              <NativeSelect
                id="recruitmentSemester"
                className="h-8"
                value={semester}
                onChange={(e) => setSemester(e.target.value as RecruitmentSemester)}
              >
                <option value="fall">Fall</option>
                <option value="spring">Spring</option>
              </NativeSelect>
            </div>
            <div className="w-[5.5rem] space-y-1">
              <Label htmlFor="recruitmentYear" className="text-sm" required>
                Year
              </Label>
              <NativeSelect
                id="recruitmentYear"
                className="h-8"
                value={year}
                onChange={(e) => setYear(Number.parseInt(e.target.value, 10))}
              >
                {YEAR_OPTIONS.map((optionYear) => (
                  <option key={optionYear} value={optionYear}>
                    {optionYear}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <LoadingButton
              size="sm"
              className="ml-auto"
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
