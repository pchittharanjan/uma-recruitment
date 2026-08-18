'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import StatusBanner from '@/components/status-banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, RequiredAsterisk } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  defaultInterviewGuideFormat,
  emptyInterviewRubric,
  interviewNoteFieldsFromGuide,
  interviewScaleMax,
  interviewScoreFieldGroups,
  interviewStageSetupCopy,
  interviewWeightPercents,
  INTERVIEW_SCALE_MAX_OPTIONS,
  normalizeInterviewRubric,
  validateInterviewGuide,
  type InterviewGuide,
  type InterviewGuideFormat,
  type InterviewGuideStage,
  type InterviewRubric,
} from '@/lib/interview-guide';
import { serializeInterviewGuidePayload } from '@/lib/interview-guide-serialize';
import { markNavigationPending } from '@/components/navigation-progress';
import { stashInterviewPreviewGuide } from '@/lib/interview-preview-storage';
import { cachedJsonFetch, invalidateClientFetchCache, peekCachedJson } from '@/lib/client-fetch-cache';
import {
  DocumentSaveStatusLine,
  type DocumentSaveStatus,
} from '@/components/document-save-status';
import { cn } from '@/lib/utils';

interface GuideData {
  team: { id: number; name: string };
  round: { id: number; label: string; status?: string };
  guides: Record<InterviewGuideStage, InterviewGuide | null>;
}

interface CasePdfOption {
  name: string;
  url: string;
}

interface TeamInterviewGuideSetupProps {
  teamId: string;
  onSaved?: () => void;
}

const STAGES: InterviewGuideStage[] = ['first_round', 'final_round'];
const AUTOSAVE_DELAY_MS = 900;

const FORMAT_OPTIONS: { value: InterviewGuideFormat; label: string; description: string }[] = [
  {
    value: 'questions',
    label: 'Only Questions/Behaviorals',
    description: 'Behavioral or structured questions only, and each question is scored 1-5.',
  },
  {
    value: 'case_study',
    label: 'Only Case',
    description: 'PDF packet on the left. Case questions get notes on the right, then a scored evaluation.',
  },
  {
    value: 'case_and_behavioral',
    label: 'Case + Questions/Behaviorals',
    description: 'Case questions first (notes), then evaluation, then behavioral questions.',
  },
];

function emptyCaseStudy() {
  return { title: '', prompt: '', discussionPoints: [''] };
}

function withFilledRubric(guide: InterviewGuide): InterviewRubric {
  const rubric = guide.rubric;
  if (rubric?.criteria && rubric.criteria.length > 0) {
    return {
      scaleMax: rubric.scaleMax,
      criteria: rubric.criteria.map((c) => ({
        name: c.name,
        weight: c.weight > 0 ? c.weight : 1,
      })),
    };
  }
  return emptyInterviewRubric();
}

function emptyGuide(format: InterviewGuideFormat): InterviewGuide {
  if (format === 'questions') {
    return { format: 'questions', intro: '', questions: [''] };
  }
  if (format === 'case_study') {
    return { format: 'case_study', intro: '', caseStudy: emptyCaseStudy(), rubric: emptyInterviewRubric() };
  }
  return {
    format: 'case_and_behavioral',
    intro: '',
    caseStudy: emptyCaseStudy(),
    questions: [''],
    rubric: emptyInterviewRubric(),
  };
}

function withFilledCase(guide: InterviewGuide): NonNullable<InterviewGuide['caseStudy']> {
  return {
    title: guide.caseStudy?.title ?? '',
    prompt: guide.caseStudy?.prompt ?? '',
    discussionPoints:
      guide.caseStudy?.discussionPoints && guide.caseStudy.discussionPoints.length > 0
        ? guide.caseStudy.discussionPoints
        : [''],
  };
}

function guideFromApi(guide: InterviewGuide | null, format: InterviewGuideFormat): InterviewGuide {
  if (!guide) return emptyGuide(format);
  if (guide.format === 'case_and_behavioral') {
    return {
      format: 'case_and_behavioral',
      intro: guide.intro ?? '',
      casePdfUrl: guide.casePdfUrl,
      caseStudy: withFilledCase(guide),
      questions: guide.questions && guide.questions.length > 0 ? guide.questions : [''],
      rubric: withFilledRubric(guide),
    };
  }
  if (guide.format === 'case_study') {
    return {
      format: 'case_study',
      intro: guide.intro ?? '',
      casePdfUrl: guide.casePdfUrl,
      caseStudy: withFilledCase(guide),
      rubric: withFilledRubric(guide),
    };
  }
  return {
    format: 'questions',
    intro: guide.intro ?? '',
    casePdfUrl: guide.casePdfUrl,
    questions: guide.questions && guide.questions.length > 0 ? guide.questions : [''],
  };
}

function convertGuide(current: InterviewGuide, format: InterviewGuideFormat): InterviewGuide {
  if (current.format === format) return current;
  const next = emptyGuide(format);
  next.intro = current.intro ?? '';
  next.casePdfUrl = current.casePdfUrl;
  if (format !== 'questions') {
    next.caseStudy = withFilledCase(current);
    next.rubric = withFilledRubric(current);
  }
  if (format !== 'case_study') {
    next.questions =
      current.questions && current.questions.length > 0 ? current.questions : [''];
  }
  return next;
}

function payloadFromGuide(guide: InterviewGuide): InterviewGuide {
  const intro = guide.intro?.trim() || undefined;
  const casePdfUrl = guide.casePdfUrl;
  if (guide.format === 'questions') {
    return {
      format: 'questions',
      intro,
      casePdfUrl,
      questions: (guide.questions ?? []).map((q) => q.trim()).filter(Boolean),
    };
  }

  const caseStudy = {
    title: guide.caseStudy?.title?.trim() || undefined,
    prompt: guide.caseStudy?.prompt?.trim() ?? '',
    discussionPoints: (guide.caseStudy?.discussionPoints ?? [])
      .map((p) => p.trim())
      .filter(Boolean),
  };
  const rubric = normalizeInterviewRubric(guide.rubric) ?? {
    scaleMax: guide.rubric?.scaleMax ?? 5,
    criteria: (guide.rubric?.criteria ?? [])
      .map((c) => ({ name: c.name.trim(), weight: c.weight > 0 ? c.weight : 1 }))
      .filter((c) => c.name),
  };

  if (guide.format === 'case_study') {
    return { format: 'case_study', intro, casePdfUrl, caseStudy, rubric };
  }

  return {
    format: 'case_and_behavioral',
    intro,
    casePdfUrl,
    caseStudy,
    questions: (guide.questions ?? []).map((q) => q.trim()).filter(Boolean),
    rubric,
  };
}

function RubricPreview({ guide }: { guide: InterviewGuide }) {
  const noteFields = interviewNoteFieldsFromGuide(guide);
  const groups = interviewScoreFieldGroups(guide);
  const scaleMax = interviewScaleMax(guide);
  const scoredFields = groups.flatMap((g) => g.fields);
  const isCase = guide.format === 'case_study' || guide.format === 'case_and_behavioral';

  if (noteFields.length === 0 && scoredFields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add case questions and evaluation criteria below.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {noteFields.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Notes only (from the packet)</p>
          <ul className="space-y-1">
            {noteFields.map((field, index) => (
              <li
                key={`note-${index}`}
                className="rounded-md border bg-background/80 px-3 py-2 text-sm"
              >
                {field}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {groups.map((group) => {
        const percents =
          group.weights && group.fields.length > 0
            ? interviewWeightPercents(
                group.fields.map((field) => ({
                  name: field,
                  weight: group.weights?.[field] ?? 1,
                })),
              )
            : null;
        return (
          <div key={group.key} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {group.label || 'Scored'}
              {isCase || group.key === 'questions' ? ` · 1–${scaleMax}` : null}
            </p>
            <ul className="space-y-1">
              {group.fields.map((field, index) => (
                <li
                  key={`${group.key}-${field}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background/80 px-3 py-2 text-sm"
                >
                  <span>{field}</span>
                  {percents ? (
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {percents[index]}%
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function StringListEditor({
  stage,
  idPrefix,
  title,
  description,
  items,
  onChange,
  placeholder,
  addLabel,
}: {
  stage: InterviewGuideStage;
  idPrefix: string;
  title: string;
  description?: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: (index: number) => string;
  addLabel: string;
}) {
  const rows = items.length > 0 ? items : [''];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
        <div className="space-y-1">
          <CardTitle className="text-base">
            {title}
            <RequiredAsterisk className="ml-0.5" />
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => onChange([...rows, ''])}
        >
          <Plus className="mr-1 size-4" />
          {addLabel}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((value, i) => (
          <div key={`${stage}-${idPrefix}-${i}`} className="flex gap-3">
            <span className="pt-2.5 text-sm tabular-nums text-muted-foreground">{i + 1}.</span>
            <textarea
              value={value}
              onChange={(e) => {
                const next = [...rows];
                next[i] = e.target.value;
                onChange(next);
              }}
              placeholder={placeholder(i)}
              rows={2}
              className="field-textarea min-h-[4.5rem] flex-1 resize-y"
            />
            {rows.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  const next = rows.filter((_, j) => j !== i);
                  onChange(next.length ? next : ['']);
                }}
                aria-label={`Remove ${title.toLowerCase()} ${i + 1}`}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RubricEditor({
  stage,
  rubric,
  onChange,
}: {
  stage: InterviewGuideStage;
  rubric: InterviewRubric;
  onChange: (rubric: InterviewRubric) => void;
}) {
  const rows = rubric.criteria.length > 0 ? rubric.criteria : [{ name: '', weight: 1 }];
  const percents = interviewWeightPercents(rows);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
        <div className="space-y-1">
          <CardTitle className="text-base">
            Evaluation Criteria
            <RequiredAsterisk className="ml-0.5" />
          </CardTitle>
          <CardDescription>
            After notes, interviewers score the candidate on these criteria. Set the scale and how
            much each one counts.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => onChange({ ...rubric, criteria: [...rows, { name: '', weight: 1 }] })}
        >
          <Plus className="mr-1 size-4" />
          Add Criterion
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor={`scale-max-${stage}`}>Scale max</Label>
          <Select
            value={String(rubric.scaleMax)}
            onValueChange={(value) => {
              if (value == null) return;
              onChange({ ...rubric, scaleMax: Number(value) });
            }}
          >
            <SelectTrigger id={`scale-max-${stage}`} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVIEW_SCALE_MAX_OPTIONS.map((max) => (
                <SelectItem key={max} value={String(max)}>
                  1–{max}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_3.5rem_2rem] items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>Criterion</span>
            <span>Weight</span>
            <span className="text-right">Share</span>
            <span />
          </div>
          {rows.map((row, i) => (
            <div
              key={`${stage}-criterion-${i}`}
              className="grid grid-cols-[minmax(0,1fr)_5.5rem_3.5rem_2rem] items-center gap-2"
            >
              <Input
                value={row.name}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], name: e.target.value };
                  onChange({ ...rubric, criteria: next });
                }}
                placeholder={`e.g. Structure`}
              />
              <Input
                type="number"
                min={1}
                step={1}
                value={row.weight}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  const next = [...rows];
                  next[i] = { ...next[i], weight: Number.isFinite(parsed) && parsed > 0 ? parsed : 1 };
                  onChange({ ...rubric, criteria: next });
                }}
              />
              <span className="text-right text-sm tabular-nums text-muted-foreground">
                {percents[i] ?? 0}%
              </span>
              {rows.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const next = rows.filter((_, j) => j !== i);
                    onChange({ ...rubric, criteria: next.length ? next : [{ name: '', weight: 1 }] });
                  }}
                  aria-label={`Remove criterion ${i + 1}`}
                >
                  <X className="size-4" />
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CasePdfSection({
  teamId,
  stage,
  casePdfUrl,
  onChange,
}: {
  teamId: string;
  stage: InterviewGuideStage;
  casePdfUrl?: string;
  onChange: (url: string | undefined) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [options, setOptions] = useState<CasePdfOption[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedExisting, setSelectedExisting] = useState('');

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/interview-guide/case-pdf`);
      const json = await res.json();
      if (res.ok) setOptions(json.files ?? []);
    } catch {
      // non-blocking
    }
  }, [teamId]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const uploadPdf = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('stage', stage);
      const res = await fetch(`/api/admin/teams/${teamId}/interview-guide/case-pdf`, {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to upload PDF.');
        return;
      }
      onChange(json.casePdfUrl);
      toast.success('Case PDF uploaded.');
      await loadOptions();
    } catch {
      toast.error('Failed to upload PDF.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Case Copy (PDF)</CardTitle>
        <CardDescription>
          Upload the case deck or packet interviewers show on the left side of the scoring screen.
          You can also paste the scenario below. The PDF is optional but recommended for case
          interviews.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadPdf(file);
          }}
        />

        {casePdfUrl ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{casePdfUrl.split('/').pop()}</p>
                <p className="text-xs text-muted-foreground">Attached for this round</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" nativeButton={false} render={<a href={casePdfUrl} target="_blank" rel="noreferrer" />}>
                Preview PDF
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange(undefined);
                  setSelectedExisting('');
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-8 text-center',
              'bg-muted/20',
            )}
          >
            <Upload className="size-8 text-muted-foreground/70" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Upload a case PDF</p>
              <p className="text-xs text-muted-foreground">PDF up to 12 MB</p>
            </div>
            <LoadingButton
              variant="secondary"
              loading={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              Choose File
            </LoadingButton>
          </div>
        )}

        {options.length > 0 ? (
          <div className="space-y-2">
            <Label htmlFor={`case-pdf-select-${stage}`}>Or use an existing PDF</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={selectedExisting || undefined}
                onValueChange={(value) => {
                  if (!value) return;
                  setSelectedExisting(value);
                  onChange(value);
                }}
              >
                <SelectTrigger id={`case-pdf-select-${stage}`} className="min-w-[16rem]">
                  <SelectValue placeholder="Select a saved PDF…" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.url} value={option.url}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {casePdfUrl && selectedExisting && casePdfUrl !== selectedExisting ? (
                <span className="text-xs text-muted-foreground">Currently using uploaded file</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TeamInterviewGuideSetup({ teamId, onSaved }: TeamInterviewGuideSetupProps) {
  const router = useRouter();
  const [meta, setMeta] = useState<GuideData | null>(null);
  const [stage, setStage] = useState<InterviewGuideStage>('first_round');
  const [guides, setGuides] = useState<Record<InterviewGuideStage, InterviewGuide>>({
    first_round: emptyGuide('questions'),
    final_round: emptyGuide('questions'),
  });
  const [loading, setLoading] = useState(
    () => !peekCachedJson(`/api/admin/teams/${teamId}/interview-guide`),
  );
  const [saveStatus, setSaveStatus] = useState<DocumentSaveStatus>('saved');
  const [saveError, setSaveError] = useState('');
  const [error, setError] = useState('');
  const savedSnapshots = useRef<Record<InterviewGuideStage, string>>({
    first_round: '',
    final_round: '',
  });
  const guidesRef = useRef(guides);
  const stageRef = useRef(stage);
  const hydratedRef = useRef(false);

  guidesRef.current = guides;
  stageRef.current = stage;

  const persistStage = useCallback(
    async (targetStage: InterviewGuideStage): Promise<boolean> => {
      const guide = guidesRef.current[targetStage];
      const payload = payloadFromGuide(guide);
      const serialized = serializeInterviewGuidePayload(guide);

      if (serialized === savedSnapshots.current[targetStage]) {
        setSaveStatus('saved');
        return true;
      }

      const validationError = validateInterviewGuide(payload);
      if (validationError) {
        setSaveStatus('invalid');
        return false;
      }

      setSaveStatus('saving');
      setSaveError('');
      try {
        const res = await fetch(`/api/admin/teams/${teamId}/interview-guide`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: targetStage, guide: payload }),
        });
        const json = await res.json();
        if (!res.ok) {
          const message = json.error ?? 'Failed to save.';
          setSaveStatus('error');
          setSaveError(message);
          setError(message);
          return false;
        }
        savedSnapshots.current[targetStage] = serialized;
        if (json.guide && targetStage === stageRef.current) {
          setGuides((prev) => ({
            ...prev,
            [targetStage]: guideFromApi(json.guide, json.guide.format),
          }));
          savedSnapshots.current[targetStage] = serializeInterviewGuidePayload(
            guideFromApi(json.guide, json.guide.format),
          );
        } else {
          savedSnapshots.current[targetStage] = serialized;
        }
        if (targetStage === stageRef.current) {
          setSaveStatus('saved');
          setError('');
        }
        invalidateClientFetchCache(`/api/admin/teams/${teamId}/interview-guide`);
        invalidateClientFetchCache(`/api/admin/teams/${teamId}/interview-preview`);
        onSaved?.();
        return true;
      } catch {
        setSaveStatus('error');
        setSaveError('Network error.');
        setError('Network error.');
        return false;
      }
    },
    [onSaved, teamId],
  );

  const load = useCallback(async () => {
    setError('');
    try {
      const { ok, json } = await cachedJsonFetch<GuideData & { error?: string }>(
        `/api/admin/teams/${teamId}/interview-guide`,
      );
      if (!ok || !json?.guides) {
        setError(json?.error ?? 'Failed to load interview setup.');
        return;
      }
      setMeta(json);
      const teamName = json.team?.name ?? '';
      setGuides({
        first_round: guideFromApi(
          json.guides.first_round,
          defaultInterviewGuideFormat(teamName, 'first_round'),
        ),
        final_round: guideFromApi(
          json.guides.final_round,
          defaultInterviewGuideFormat(teamName, 'final_round'),
        ),
      });
      savedSnapshots.current = {
        first_round: serializeInterviewGuidePayload(
          guideFromApi(
            json.guides.first_round,
            defaultInterviewGuideFormat(teamName, 'first_round'),
          ),
        ),
        final_round: serializeInterviewGuidePayload(
          guideFromApi(
            json.guides.final_round,
            defaultInterviewGuideFormat(teamName, 'final_round'),
          ),
        ),
      };
      hydratedRef.current = true;
      setSaveStatus('saved');
    } catch {
      setError('Failed to load interview setup.');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!hydratedRef.current || loading) return;

    const guide = guides[stage];
    stashInterviewPreviewGuide(teamId, stage, guide);

    const serialized = serializeInterviewGuidePayload(guide);
    if (serialized === savedSnapshots.current[stage]) {
      setSaveStatus('saved');
      return;
    }

    const payload = payloadFromGuide(guide);
    const validationError = validateInterviewGuide(payload);
    if (validationError) {
      setSaveStatus('invalid');
      return;
    }

    setSaveStatus('dirty');

    const timer = window.setTimeout(() => {
      void persistStage(stage);
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [guides, stage, loading, teamId, persistStage]);

  const handleStageChange = (next: string) => {
    const previous = stage;
    if (previous !== next) {
      void persistStage(previous);
    }
    setStage(next as InterviewGuideStage);
  };

  const setFormatForStage = (target: InterviewGuideStage, format: InterviewGuideFormat) => {
    setGuides((prev) => ({
      ...prev,
      [target]: convertGuide(prev[target], format),
    }));
  };

  const patchGuide = (target: InterviewGuideStage, patch: Partial<InterviewGuide>) => {
    setGuides((prev) => ({
      ...prev,
      [target]: { ...prev[target], ...patch },
    }));
  };

  const openPreview = () => {
    stashInterviewPreviewGuide(teamId, stage, guidesRef.current[stage]);
    markNavigationPending();
    router.push(`/admin/teams/${teamId}/interview-preview/${stage}`);
    void persistStage(stage);
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading">
        <Skeleton className="h-9 w-72" />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interview Guide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const teamName = meta?.team.name ?? '';

  return (
    <div className="space-y-8 pb-20">
      {error && saveStatus === 'error' && <StatusBanner message={error} type="error" />}
      {meta?.round.status === 'closed' && (
        <StatusBanner
          type="info"
          message="Recruitment is closed. Teams are view-only, and you can still edit interview guides."
        />
      )}

      {!meta ? null : (
        <>
          <Tabs
            value={stage}
            onValueChange={handleStageChange}
            className="space-y-8"
          >
            <TabsList className="h-auto w-full max-w-xl">
              {STAGES.map((s) => (
                <TabsTrigger key={s} value={s} className="flex-1 px-4 py-2">
                  {interviewStageSetupCopy(teamName, s).label}
                </TabsTrigger>
              ))}
            </TabsList>

            {STAGES.map((s) => {
              const copy = interviewStageSetupCopy(teamName, s);
              const guide = guides[s];
              const formatMeta = FORMAT_OPTIONS.find((option) => option.value === guide.format);

              return (
                <TabsContent key={s} value={s} className="space-y-8">
                  <Card>
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-base">Interview Format</CardTitle>
                      {copy.hint ? <CardDescription>{copy.hint}</CardDescription> : null}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Tabs
                        value={guide.format}
                        onValueChange={(value) =>
                          setFormatForStage(s, value as InterviewGuideFormat)
                        }
                      >
                        <TabsList className="grid h-auto w-full grid-cols-3">
                          {FORMAT_OPTIONS.map((option) => (
                            <TabsTrigger
                              key={option.value}
                              value={option.value}
                              className="whitespace-normal px-2 py-2 text-center text-xs leading-tight sm:px-3 sm:text-sm"
                            >
                              {option.label}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </Tabs>
                      {formatMeta ? (
                        <p className="text-sm text-muted-foreground">{formatMeta.description}</p>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Interviewer Brief</CardTitle>
                      <CardDescription>
                        Optional instructions shown at the top of the scoring screen.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Label htmlFor={`intro-${s}`} className="sr-only">
                        Optional intro for interviewers
                      </Label>
                      <textarea
                        id={`intro-${s}`}
                        value={guide.intro ?? ''}
                        onChange={(e) => patchGuide(s, { intro: e.target.value })}
                        rows={3}
                        placeholder="Optional context or instructions for interviewers…"
                        className="field-textarea w-full"
                      />
                    </CardContent>
                  </Card>

                  {(guide.format === 'case_study' || guide.format === 'case_and_behavioral') && (
                    <>
                      <CasePdfSection
                        teamId={teamId}
                        stage={s}
                        casePdfUrl={guide.casePdfUrl}
                        onChange={(casePdfUrl) => patchGuide(s, { casePdfUrl })}
                      />

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">
                            {guide.format === 'case_and_behavioral'
                              ? 'Part 1: Case Scenario'
                              : 'Case Scenario'}
                          </CardTitle>
                          <CardDescription>
                            The written prompt interviewers walk through with the candidate.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor={`case-title-${s}`}>Title (Optional)</Label>
                            <Input
                              id={`case-title-${s}`}
                              value={guide.caseStudy?.title ?? ''}
                              onChange={(e) =>
                                patchGuide(s, {
                                  caseStudy: {
                                    ...withFilledCase(guide),
                                    title: e.target.value,
                                  },
                                })
                              }
                              placeholder="e.g. Market Sizing Exercise"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`case-prompt-${s}`} required>
                              Prompt
                            </Label>
                            <textarea
                              id={`case-prompt-${s}`}
                              value={guide.caseStudy?.prompt ?? ''}
                              onChange={(e) =>
                                patchGuide(s, {
                                  caseStudy: {
                                    ...withFilledCase(guide),
                                    prompt: e.target.value,
                                  },
                                })
                              }
                              rows={6}
                              placeholder="The case scenario interviewers present to applicants…"
                              className="field-textarea w-full"
                            />
                          </div>
                        </CardContent>
                      </Card>

                      <StringListEditor
                        stage={s}
                        idPrefix="case-questions"
                        title={
                          guide.format === 'case_and_behavioral'
                            ? 'Part 1: Case Questions'
                            : 'Case Questions'
                        }
                        description="Questions from the packet. Interviewers see each one on the right with a notes box, and they do not score the questions themselves."
                        items={guide.caseStudy?.discussionPoints ?? ['']}
                        onChange={(discussionPoints) =>
                          patchGuide(s, {
                            caseStudy: {
                              ...withFilledCase(guide),
                              discussionPoints,
                            },
                          })
                        }
                        placeholder={(i) => `Case question ${i + 1}`}
                        addLabel="Add Question"
                      />

                      <RubricEditor
                        stage={s}
                        rubric={withFilledRubric(guide)}
                        onChange={(rubric) => patchGuide(s, { rubric })}
                      />
                    </>
                  )}

                  {(guide.format === 'questions' || guide.format === 'case_and_behavioral') && (
                    <StringListEditor
                      stage={s}
                      idPrefix="questions"
                      title={
                        guide.format === 'case_and_behavioral'
                          ? 'Part 2: Behavioral Questions'
                          : 'Interview Questions'
                      }
                      description={
                        guide.format === 'case_and_behavioral'
                          ? `Each question is scored 1–${withFilledRubric(guide).scaleMax} after the case evaluation.`
                          : 'Each question becomes a rubric item interviewers score 1–5.'
                      }
                      items={guide.questions ?? ['']}
                      onChange={(questions) => patchGuide(s, { questions })}
                      placeholder={(i) => `Question ${i + 1}`}
                      addLabel="Add Question"
                    />
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Rubric Preview</CardTitle>
                      <CardDescription>
                        What interviewers see on the right: notes for packet questions, then scored
                        criteria.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RubricPreview guide={guide} />
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            })}
          </Tabs>

          <div className="sticky bottom-0 z-10 -mx-5 flex flex-wrap items-center justify-between gap-4 border-t bg-background/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8">
            <DocumentSaveStatusLine status={saveStatus} errorMessage={saveError} />
            <LoadingButton
              variant="secondary"
              onClick={openPreview}
            >
              Preview Interviewer View
            </LoadingButton>
          </div>
        </>
      )}
    </div>
  );
}
