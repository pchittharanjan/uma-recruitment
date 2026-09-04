'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import StatusBanner from '@/components/status-banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { shortHeaderLabel } from '@/lib/rubric';

interface RubricData {
  csvHeaders: string[];
  scoreFields: string[];
  customScoreFields: string[];
  portfolioFields?: string[];
  contextFields: string[];
  graderVisibleContextFields: string[];
  graderInstructions: string | null;
  roundStatus?: string;
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
    return (
      <div className="space-y-4" role="status" aria-label="Loading">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Grader Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scored Questions (CSV Columns)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const scoredQuestionLabels = [
    ...scoreFields,
    ...customFields.filter(Boolean),
  ];

  return (
    <div className="space-y-4">
      {error && <StatusBanner message={error} type="error" />}
      {success && <StatusBanner message={success} type="success" />}
      {rubric?.roundStatus === 'closed' && (
        <StatusBanner
          type="info"
          message="Recruitment is closed. Teams are view-only, and you can still edit grading setup."
        />
      )}

      {!rubric ? null : (
      <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-base">Grader Instructions</CardTitle>
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
            placeholder="e.g. Score holistically. Flag any concerns in the comments box."
            className="field-textarea resize-y"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scored Questions (CSV Columns)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rubric.csvHeaders.map((header) => (
            <label
              key={header}
              htmlFor={`score-field-${header}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg uma-nested-surface p-3 uma-hover-on-nested"
            >
              <Checkbox
                id={`score-field-${header}`}
                checked={scoreFields.has(header)}
                className="mt-0.5"
                onCheckedChange={(checked) => toggleScoreField(header, checked === true)}
              />
              <span className="text-sm leading-snug">{shortHeaderLabel(header, 200)}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-base">Custom Score Questions</CardTitle>
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
          <CardTitle className="text-base">What Graders See (Blind Review)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Graders see <strong className="text-foreground">applicant numbers only</strong> plus the
            scored questions you select, and nothing else from the CSV. Admins who grade use the same
            name-blind queue; names stay on the spreadsheet and assignment review.
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
          {(rubric.portfolioFields?.length ?? 0) > 0 && (
            <div>
              <Label className="text-xs uppercase tracking-wide">Portfolio panel (Applicant # only)</Label>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {rubric.portfolioFields!.map((h) => (
                  <li key={h}>{shortHeaderLabel(h, 120)}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <LoadingButton onClick={handleSave} loading={saving}>
          Save grading criteria
        </LoadingButton>
      </div>
      </>
      )}
    </div>
  );
}
