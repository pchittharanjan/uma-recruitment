'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import StatusBanner from '@/components/status-banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { shortHeaderLabel } from '@/lib/rubric';

interface RubricData {
  csvHeaders: string[];
  scoreFields: string[];
  customScoreFields: string[];
  contextFields: string[];
  graderVisibleContextFields: string[];
  graderInstructions: string | null;
  readOnly?: boolean;
}

interface TeamGradingSetupProps {
  teamId: string;
  sampleApplicationId: number | null;
  onSaved?: () => void;
}

export function TeamGradingSetup({
  teamId,
  sampleApplicationId,
  onSaved,
}: TeamGradingSetupProps) {
  const router = useRouter();
  const [rubric, setRubric] = useState<RubricData | null>(null);
  const [scoreFields, setScoreFields] = useState<Set<string>>(new Set());
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadRubric = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/rubric`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load rubric.');
        return;
      }
      setRubric(json);
      setScoreFields(new Set(json.scoreFields as string[]));
      setCustomFields(json.customScoreFields as string[]);
      setInstructions((json.graderInstructions as string | null) ?? '');
    } catch {
      setError('Failed to load rubric.');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadRubric();
  }, [loadRubric]);

  const toggleScoreField = (header: string, checked: boolean) => {
    setScoreFields((prev) => {
      const next = new Set(prev);
      if (checked) next.add(header);
      else next.delete(header);
      return next;
    });
  };

  const handleSave = async () => {
    if (!rubric) return;
    if (scoreFields.size === 0) {
      const message = 'Select at least one scored CSV column.';
      setError(message);
      toast.error(message);
      return;
    }

    const scored = new Set([...scoreFields, ...customFields.filter(Boolean)]);
    const contextFields = rubric.csvHeaders.filter((h) => !scored.has(h));

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/rubric`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scoreFields: Array.from(scoreFields),
          customScoreFields: customFields.filter(Boolean),
          contextFields,
          graderInstructions: instructions.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error ?? 'Failed to save.';
        setError(message);
        toast.error(message);
        return;
      }
      setSuccess('Grading criteria saved.');
      toast.success('Grading criteria saved.');
      setRubric((prev) =>
        prev
          ? {
              ...prev,
              scoreFields: json.scoreFields,
              customScoreFields: json.customScoreFields,
              contextFields: json.contextFields,
              graderVisibleContextFields: json.graderVisibleContextFields,
              graderInstructions: json.graderInstructions,
            }
          : prev,
      );
      onSaved?.();
    } catch {
      setError('Network error.');
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

  const openPreview = () => {
    if (!sampleApplicationId) {
      setError('No applications to preview.');
      return;
    }
    router.push(`/admin/teams/${teamId}/grader-preview/${sampleApplicationId}`);
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading grading setup…</p>;
  }

  const scoredQuestionLabels = [
    ...scoreFields,
    ...customFields.filter(Boolean),
  ];

  return (
    <div className="space-y-4">
      {error && <StatusBanner message={error} type="error" />}
      {success && <StatusBanner message={success} type="success" />}
      {rubric?.readOnly && (
        <StatusBanner type="info" message="Recruitment is closed. Grading setup is view-only." />
      )}

      {!rubric ? null : (
      <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-base">Grader instructions</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Shown at the top of every application. Criteria are org-wide — saving updates all
              teams.
            </p>
          </div>
          <LoadingButton
            variant="secondary"
            className="shrink-0"
            onClick={openPreview}
            disabled={!sampleApplicationId}
          >
            Preview grader view
          </LoadingButton>
        </CardHeader>
        <CardContent>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            disabled={Boolean(rubric.readOnly)}
            placeholder="e.g. Score holistically. Flag any concerns in the comments box."
            className="w-full resize-y rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scored questions (CSV columns)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Graders score each selected column on a 1–5 scale.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {rubric.csvHeaders.map((header) => (
            <label
              key={header}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/30"
            >
              <input
                type="checkbox"
                checked={scoreFields.has(header)}
                onChange={(e) => toggleScoreField(header, e.target.checked)}
                className="mt-0.5 size-4 rounded"
              />
              <span className="text-sm leading-snug">{shortHeaderLabel(header, 200)}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-base">Custom score questions</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Extra criteria beyond the CSV (also scored 1–5).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setCustomFields([...customFields, ''])}
          >
            <Plus className="size-3.5" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {customFields.length === 0 && (
            <p className="text-sm text-muted-foreground">No custom questions yet.</p>
          )}
          {customFields.map((field, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={field}
                onChange={(e) => {
                  const next = [...customFields];
                  next[index] = e.target.value;
                  setCustomFields(next);
                }}
                placeholder="e.g. Overall impression"
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label="Remove question"
                onClick={() => setCustomFields(customFields.filter((_, i) => i !== index))}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What graders see (blind review)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Graders see <strong className="text-foreground">applicant numbers only</strong> plus the
            scored questions you select — nothing else from the CSV.
          </p>
          {scoredQuestionLabels.length > 0 ? (
            <div>
              <Label className="text-xs uppercase tracking-wide">Scored questions shown</Label>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {scoredQuestionLabels.map((h) => (
                  <li key={h}>{shortHeaderLabel(h, 120)}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p>Select at least one scored CSV column above.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <LoadingButton onClick={handleSave} loading={saving} disabled={Boolean(rubric.readOnly)}>
          Save grading criteria
        </LoadingButton>
      </div>
      </>
      )}
    </div>
  );
}
