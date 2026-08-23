'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cachedJsonFetch, invalidateClientFetchCache } from '@/lib/client-fetch-cache';
import { teamDotClass } from '@/lib/team-colors';
import { cn } from '@/lib/utils';

const CAP_INPUT_CLASS =
  'h-9 w-full max-w-[6rem] border-foreground/20 bg-background ';

type CapField = 'applicationCap' | 'firstRoundCap' | 'deliberationsCap';
type ExtraField =
  | 'applicationOverCapExtra'
  | 'firstRoundOverCapExtra'
  | 'deliberationsOverCapExtra';

interface TeamCapRow {
  teamId: number;
  teamName: string;
  applicationCap: number | null;
  firstRoundCap: number | null;
  deliberationsCap: number | null;
  applicationOverCapExtra: number;
  firstRoundOverCapExtra: number;
  deliberationsOverCapExtra: number;
}

function capInputValue(cap: number | null): string {
  return cap === null ? '' : String(cap);
}

function parseCapInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

function CapCell({
  teamName,
  stageLabel,
  inputId,
  value,
  extra,
  onCapChange,
  onClearExtra,
}: {
  teamName: string;
  stageLabel: string;
  inputId: string;
  value: number | null;
  extra: number;
  onCapChange: (value: string) => void;
  onClearExtra: () => void;
}) {
  return (
    <div role="cell" className="space-y-1.5 py-1.5">
      <Label htmlFor={inputId} className="sr-only">
        {stageLabel} limit for {teamName}
      </Label>
      <Input
        id={inputId}
        type="number"
        min={1}
        inputMode="numeric"
        placeholder="-"
        className={CAP_INPUT_CLASS}
        value={capInputValue(value)}
        onChange={(e) => onCapChange(e.target.value)}
      />
      {extra > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">+{extra} extra</p>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-6 px-1.5 text-[0.7rem] text-muted-foreground"
            onClick={onClearExtra}
          >
            Clear extra
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function TeamAdvancementCapSettings() {
  const [rows, setRows] = useState<TeamCapRow[]>([]);
  const [savedRows, setSavedRows] = useState<TeamCapRow[]>([]);
  const [overCapCodeSet, setOverCapCodeSet] = useState(false);
  const [goOverCode, setGoOverCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCode, setSavingCode] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { ok, json } = await cachedJsonFetch<{
        teams?: TeamCapRow[];
        overCapCodeSet?: boolean;
        error?: string;
      }>('/api/admin/advancement-caps');
      if (!ok || !json) {
        setError(json?.error ?? 'Failed to load advancement limits.');
        return;
      }
      const teams = (json.teams ?? []).map((team) => ({
        ...team,
        applicationOverCapExtra: Number(team.applicationOverCapExtra) || 0,
        firstRoundOverCapExtra: Number(team.firstRoundOverCapExtra) || 0,
        deliberationsOverCapExtra: Number(team.deliberationsOverCapExtra) || 0,
      })) as TeamCapRow[];
      setRows(teams);
      setSavedRows(teams);
      setOverCapCodeSet(Boolean(json.overCapCodeSet));
    } catch {
      setError('Failed to load advancement limits.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isDirty = useMemo(() => {
    if (rows.length !== savedRows.length) return true;
    return rows.some((row, index) => {
      const saved = savedRows[index];
      return (
        row.teamId !== saved?.teamId ||
        row.applicationCap !== saved.applicationCap ||
        row.firstRoundCap !== saved.firstRoundCap ||
        row.deliberationsCap !== saved.deliberationsCap ||
        row.applicationOverCapExtra !== saved.applicationOverCapExtra ||
        row.firstRoundOverCapExtra !== saved.firstRoundOverCapExtra ||
        row.deliberationsOverCapExtra !== saved.deliberationsOverCapExtra
      );
    });
  }, [rows, savedRows]);

  const updateCap = (teamId: number, field: CapField, value: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.teamId === teamId ? { ...row, [field]: parseCapInput(value) } : row,
      ),
    );
  };

  const clearExtra = (teamId: number, field: ExtraField) => {
    setRows((prev) =>
      prev.map((row) => (row.teamId === teamId ? { ...row, [field]: 0 } : row)),
    );
  };

  const loweredCapWarnings = useMemo(() => {
    const warnings: string[] = [];
    for (const row of rows) {
      const saved = savedRows.find((item) => item.teamId === row.teamId);
      if (!saved) continue;
      if (
        row.applicationCap !== null &&
        saved.applicationCap !== null &&
        row.applicationCap < saved.applicationCap &&
        row.applicationOverCapExtra === 0
      ) {
        warnings.push(
          `${row.teamName}: application ${saved.applicationCap} → ${row.applicationCap}. Over-limit pending lists can keep picks but not add more.`,
        );
      }
      if (
        row.firstRoundCap !== null &&
        saved.firstRoundCap !== null &&
        row.firstRoundCap < saved.firstRoundCap &&
        row.firstRoundOverCapExtra === 0
      ) {
        warnings.push(
          `${row.teamName}: first round ${saved.firstRoundCap} → ${row.firstRoundCap}. Over-limit pending lists can keep picks but not add more.`,
        );
      }
      if (
        row.deliberationsCap !== null &&
        saved.deliberationsCap !== null &&
        row.deliberationsCap < saved.deliberationsCap &&
        row.deliberationsOverCapExtra === 0
      ) {
        warnings.push(
          `${row.teamName}: deliberations ${saved.deliberationsCap} → ${row.deliberationsCap}. Over-limit pending lists can keep picks but not add more.`,
        );
      }
    }
    return warnings;
  }, [rows, savedRows]);

  const handleSaveCode = async () => {
    if (savingCode || !goOverCode.trim()) return;
    setSavingCode(true);
    setError('');
    try {
      const res = await fetch('/api/admin/advancement-caps/over-cap-code', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: goOverCode }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to save go-over code.');
      }
      setGoOverCode('');
      setOverCapCodeSet(true);
      invalidateClientFetchCache('/api/admin/advancement-caps');
      toast.success(overCapCodeSet ? 'Go-over code replaced' : 'Go-over code set');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save go-over code.';
      setError(message);
      toast.error(message);
    } finally {
      setSavingCode(false);
    }
  };

  const handleSave = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    setError('');
    try {
      for (const row of rows) {
        const saved = savedRows.find((item) => item.teamId === row.teamId);
        if (
          saved &&
          saved.applicationCap === row.applicationCap &&
          saved.firstRoundCap === row.firstRoundCap &&
          saved.deliberationsCap === row.deliberationsCap &&
          saved.applicationOverCapExtra === row.applicationOverCapExtra &&
          saved.firstRoundOverCapExtra === row.firstRoundOverCapExtra &&
          saved.deliberationsOverCapExtra === row.deliberationsOverCapExtra
        ) {
          continue;
        }

        const res = await fetch('/api/admin/advancement-caps', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId: row.teamId,
            applicationCap: row.applicationCap,
            firstRoundCap: row.firstRoundCap,
            deliberationsCap: row.deliberationsCap,
            clearApplicationOverCapExtra:
              saved != null &&
              saved.applicationOverCapExtra > 0 &&
              row.applicationOverCapExtra === 0,
            clearFirstRoundOverCapExtra:
              saved != null &&
              saved.firstRoundOverCapExtra > 0 &&
              row.firstRoundOverCapExtra === 0,
            clearDeliberationsOverCapExtra:
              saved != null &&
              saved.deliberationsOverCapExtra > 0 &&
              row.deliberationsOverCapExtra === 0,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? `Failed to save limits for ${row.teamName}.`);
        }
      }
      setSavedRows(rows);
      invalidateClientFetchCache('/api/admin/advancement-caps');
      if (loweredCapWarnings.length > 0) {
        toast.success('Advancement limits saved', {
          description: loweredCapWarnings[0],
        });
      } else {
        toast.success('Advancement limits saved');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save advancement limits.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="gap-2 px-6">
        <CardTitle className="text-base">Team Advancement Limits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 overflow-hidden px-6 pt-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
          <Label htmlFor="org-go-over-code" className="text-sm font-medium">
            Go-over code
          </Label>
          <p className="text-xs text-muted-foreground">
            {overCapCodeSet
              ? 'Code is set. Enter a new value below to replace it. Directors use this code to take extra slots past a team limit.'
              : 'Set a shared code. Directors enter it when they need extra slots past a team limit.'}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              id="org-go-over-code"
              type="password"
              autoComplete="new-password"
              placeholder={overCapCodeSet ? 'Enter new code to replace' : 'Enter code'}
              className="h-9 max-w-xs border-foreground/20 bg-background"
              value={goOverCode}
              onChange={(e) => setGoOverCode(e.target.value)}
              disabled={loading || savingCode}
            />
            <LoadingButton
              type="button"
              loading={savingCode}
              disabled={!goOverCode.trim()}
              onClick={handleSaveCode}
            >
              {overCapCodeSet ? 'Replace code' : 'Set code'}
            </LoadingButton>
          </div>
        </div>

        {loweredCapWarnings.length > 0 && isDirty && !loading ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {loweredCapWarnings.length === 1
              ? loweredCapWarnings[0]
              : `${loweredCapWarnings.length} teams have a lowered limit. Over-limit pending lists can keep picks but not add more unless directors enter the go-over code.`}
          </p>
        ) : null}
        <div
          role="table"
          aria-busy={loading}
          className="grid w-full grid-cols-[minmax(8rem,1fr)_1fr_1fr_1fr] items-start gap-x-4 gap-y-2"
        >
          <div role="columnheader" className="py-1 text-sm font-medium text-muted-foreground">
            Team
          </div>
          <div
            role="columnheader"
            className="whitespace-nowrap py-1 text-sm font-medium text-muted-foreground"
          >
            Application → First Round
          </div>
          <div
            role="columnheader"
            className="whitespace-nowrap py-1 text-sm font-medium text-muted-foreground"
          >
            First Round → Final Round
          </div>
          <div
            role="columnheader"
            className="whitespace-nowrap py-1 text-sm font-medium text-muted-foreground"
          >
            Deliberations → Final Selection
          </div>

          {loading
            ? Array.from({ length: 4 }, (_, index) => (
                <div key={index} role="row" className="contents">
                  <div role="cell" className="flex items-center py-1.5">
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div role="cell" className="space-y-2 py-1.5">
                    <Skeleton className="h-9 w-full max-w-[6rem]" />
                  </div>
                  <div role="cell" className="space-y-2 py-1.5">
                    <Skeleton className="h-9 w-full max-w-[6rem]" />
                  </div>
                  <div role="cell" className="space-y-2 py-1.5">
                    <Skeleton className="h-9 w-full max-w-[6rem]" />
                  </div>
                </div>
              ))
            : rows.map((row) => (
                <div key={row.teamId} role="row" className="contents">
                  <div role="cell" className="flex items-center gap-2 py-1.5 font-medium">
                    <span
                      className={cn('size-2 shrink-0 rounded-full', teamDotClass(row.teamName))}
                      aria-hidden
                    />
                    {row.teamName}
                  </div>
                  <CapCell
                    teamName={row.teamName}
                    stageLabel="Application Advancement"
                    inputId={`app-cap-${row.teamId}`}
                    value={row.applicationCap}
                    extra={row.applicationOverCapExtra}
                    onCapChange={(value) => updateCap(row.teamId, 'applicationCap', value)}
                    onClearExtra={() => clearExtra(row.teamId, 'applicationOverCapExtra')}
                  />
                  <CapCell
                    teamName={row.teamName}
                    stageLabel="First Round Advancement"
                    inputId={`fr-cap-${row.teamId}`}
                    value={row.firstRoundCap}
                    extra={row.firstRoundOverCapExtra}
                    onCapChange={(value) => updateCap(row.teamId, 'firstRoundCap', value)}
                    onClearExtra={() => clearExtra(row.teamId, 'firstRoundOverCapExtra')}
                  />
                  <CapCell
                    teamName={row.teamName}
                    stageLabel="Deliberations Final Selection"
                    inputId={`delibs-cap-${row.teamId}`}
                    value={row.deliberationsCap}
                    extra={row.deliberationsOverCapExtra}
                    onCapChange={(value) => updateCap(row.teamId, 'deliberationsCap', value)}
                    onClearExtra={() => clearExtra(row.teamId, 'deliberationsOverCapExtra')}
                  />
                </div>
              ))}
        </div>
        {!loading ? (
          <div className="flex items-center justify-end gap-2">
            <LoadingButton onClick={handleSave} disabled={!isDirty} loading={saving}>
              Save limits
            </LoadingButton>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
