'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const CAP_INPUT_CLASS =
  'h-9 w-full max-w-[6rem] border-foreground/20 bg-background shadow-xs';

type CapField = 'applicationCap' | 'firstRoundCap' | 'deliberationsCap';
type OverCapField =
  | 'applicationAllowOverCap'
  | 'firstRoundAllowOverCap'
  | 'deliberationsAllowOverCap';

interface TeamCapRow {
  teamId: number;
  teamName: string;
  applicationCap: number | null;
  firstRoundCap: number | null;
  deliberationsCap: number | null;
  applicationAllowOverCap: boolean;
  firstRoundAllowOverCap: boolean;
  deliberationsAllowOverCap: boolean;
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
  allowOver,
  overId,
  onCapChange,
  onOverChange,
}: {
  teamName: string;
  stageLabel: string;
  inputId: string;
  value: number | null;
  allowOver: boolean;
  overId: string;
  onCapChange: (value: string) => void;
  onOverChange: (checked: boolean) => void;
}) {
  return (
    <div role="cell" className="space-y-2 py-1.5">
      <Label htmlFor={inputId} className="sr-only">
        {stageLabel} limit for {teamName}
      </Label>
      <Input
        id={inputId}
        type="number"
        min={1}
        inputMode="numeric"
        placeholder="—"
        className={CAP_INPUT_CLASS}
        value={capInputValue(value)}
        onChange={(e) => onCapChange(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id={overId}
          checked={allowOver}
          onCheckedChange={(checked) => onOverChange(checked === true)}
        />
        <Label htmlFor={overId} className="cursor-pointer text-xs font-normal text-muted-foreground">
          Can go over
        </Label>
      </div>
    </div>
  );
}

export function TeamAdvancementCapSettings() {
  const [rows, setRows] = useState<TeamCapRow[]>([]);
  const [savedRows, setSavedRows] = useState<TeamCapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/advancement-caps');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load advancement limits.');
        return;
      }
      const teams = (json.teams ?? []).map((team: TeamCapRow) => ({
        ...team,
        applicationAllowOverCap: Boolean(team.applicationAllowOverCap),
        firstRoundAllowOverCap: Boolean(team.firstRoundAllowOverCap),
        deliberationsAllowOverCap: Boolean(team.deliberationsAllowOverCap),
      })) as TeamCapRow[];
      setRows(teams);
      setSavedRows(teams);
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
        row.applicationAllowOverCap !== saved.applicationAllowOverCap ||
        row.firstRoundAllowOverCap !== saved.firstRoundAllowOverCap ||
        row.deliberationsAllowOverCap !== saved.deliberationsAllowOverCap
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

  const updateOverCap = (teamId: number, field: OverCapField, checked: boolean) => {
    setRows((prev) =>
      prev.map((row) => (row.teamId === teamId ? { ...row, [field]: checked } : row)),
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
        !row.applicationAllowOverCap
      ) {
        warnings.push(
          `${row.teamName}: application ${saved.applicationCap} → ${row.applicationCap}. Over-limit pending lists can keep picks but not add more.`,
        );
      }
      if (
        row.firstRoundCap !== null &&
        saved.firstRoundCap !== null &&
        row.firstRoundCap < saved.firstRoundCap &&
        !row.firstRoundAllowOverCap
      ) {
        warnings.push(
          `${row.teamName}: first round ${saved.firstRoundCap} → ${row.firstRoundCap}. Over-limit pending lists can keep picks but not add more.`,
        );
      }
      if (
        row.deliberationsCap !== null &&
        saved.deliberationsCap !== null &&
        row.deliberationsCap < saved.deliberationsCap &&
        !row.deliberationsAllowOverCap
      ) {
        warnings.push(
          `${row.teamName}: deliberations ${saved.deliberationsCap} → ${row.deliberationsCap}. Over-limit pending lists can keep picks but not add more.`,
        );
      }
    }
    return warnings;
  }, [rows, savedRows]);

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
          saved.applicationAllowOverCap === row.applicationAllowOverCap &&
          saved.firstRoundAllowOverCap === row.firstRoundAllowOverCap &&
          saved.deliberationsAllowOverCap === row.deliberationsAllowOverCap
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
            applicationAllowOverCap: row.applicationAllowOverCap,
            firstRoundAllowOverCap: row.firstRoundAllowOverCap,
            deliberationsAllowOverCap: row.deliberationsAllowOverCap,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? `Failed to save limits for ${row.teamName}.`);
        }
      }
      setSavedRows(rows);
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
        <CardTitle className="text-base">Team advancement limits</CardTitle>
        <CardDescription>
          Each team advances exactly this many people at each step. Bump a number if you want them
          to take more, or check Can go over when they need to exceed the posted limit without
          changing it. The last column is how many offers they can make after deliberations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 border-t border-border/60 px-6 pt-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {loweredCapWarnings.length > 0 && isDirty ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {loweredCapWarnings.length === 1
              ? loweredCapWarnings[0]
              : `${loweredCapWarnings.length} teams have a lowered limit. Over-limit pending lists can keep picks but not add more unless you check Can go over.`}
          </p>
        ) : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading limits…</p>
        ) : (
          <div
            role="table"
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
              Deliberations → Final selection
            </div>

            {rows.map((row) => (
              <div key={row.teamId} role="row" className="contents">
                <div role="cell" className="flex items-center py-1.5 font-medium">
                  {row.teamName}
                </div>
                <CapCell
                  teamName={row.teamName}
                  stageLabel="Application advancement"
                  inputId={`app-cap-${row.teamId}`}
                  value={row.applicationCap}
                  allowOver={row.applicationAllowOverCap}
                  overId={`app-over-${row.teamId}`}
                  onCapChange={(value) => updateCap(row.teamId, 'applicationCap', value)}
                  onOverChange={(checked) =>
                    updateOverCap(row.teamId, 'applicationAllowOverCap', checked)
                  }
                />
                <CapCell
                  teamName={row.teamName}
                  stageLabel="First round advancement"
                  inputId={`fr-cap-${row.teamId}`}
                  value={row.firstRoundCap}
                  allowOver={row.firstRoundAllowOverCap}
                  overId={`fr-over-${row.teamId}`}
                  onCapChange={(value) => updateCap(row.teamId, 'firstRoundCap', value)}
                  onOverChange={(checked) =>
                    updateOverCap(row.teamId, 'firstRoundAllowOverCap', checked)
                  }
                />
                <CapCell
                  teamName={row.teamName}
                  stageLabel="Deliberations final selection"
                  inputId={`delibs-cap-${row.teamId}`}
                  value={row.deliberationsCap}
                  allowOver={row.deliberationsAllowOverCap}
                  overId={`delibs-over-${row.teamId}`}
                  onCapChange={(value) => updateCap(row.teamId, 'deliberationsCap', value)}
                  onOverChange={(checked) =>
                    updateOverCap(row.teamId, 'deliberationsAllowOverCap', checked)
                  }
                />
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <LoadingButton onClick={handleSave} disabled={!isDirty || loading} loading={saving}>
            Save limits
          </LoadingButton>
        </div>
      </CardContent>
    </Card>
  );
}
