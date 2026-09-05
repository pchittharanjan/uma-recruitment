'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Plus, TriangleAlertIcon, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import StatusBanner from '@/components/status-banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NumberDraftInput } from '@/components/number-draft-input';
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
  criteriaShareTotal,
  rubricCategoriesForEdit,
  rubricFromCategories,
  type InterviewGuide,
  type InterviewGuideFormat,
  type InterviewGuideStage,
  type InterviewRubric,
  type InterviewRubricCategory,
} from '@/lib/interview-guide';
import { teamUsesInterviewStage } from '@/lib/team-pipeline-profile';
import { serializeInterviewGuidePayload } from '@/lib/interview-guide-serialize';
import { markNavigationPending } from '@/components/navigation-progress';
import { stashInterviewPreviewGuide } from '@/lib/interview-preview-storage';
import { rewriteLegacyInterviewIntro } from '@/lib/strategy-interview';
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

function GuideSection({
  title,
  description,
  action,
  required = false,
  children,
}: {
  title: string;
  description?: string | null;
  action?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="uma-section-label">
            {title}
            {required ? <RequiredAsterisk className="ml-0.5" /> : null}
          </p>
          {description ? (
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

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
    description:
      'Case packet and behavioral questions in one interview. Interviewers can switch between Case and Behavioral at any time.',
  },
];

function emptyCaseStudy() {
  return { title: '', prompt: '', discussionPoints: [''] };
}

function withFilledRubric(guide: InterviewGuide): InterviewRubric {
  const normalized = normalizeInterviewRubric(guide.rubric);
  if (normalized) {
    const categories = rubricCategoriesForEdit(normalized);
    return rubricFromCategories(normalized.scaleMax, categories);
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
  const intro = rewriteLegacyInterviewIntro(guide.intro) ?? '';
  if (guide.format === 'case_and_behavioral') {
    return {
      format: 'case_and_behavioral',
      intro,
      casePdfUrl: guide.casePdfUrl,
      caseStudy: withFilledCase(guide),
      questions: guide.questions && guide.questions.length > 0 ? guide.questions : [''],
      rubric: withFilledRubric(guide),
    };
  }
  if (guide.format === 'case_study') {
    return {
      format: 'case_study',
      intro,
      casePdfUrl: guide.casePdfUrl,
      caseStudy: withFilledCase(guide),
      rubric: withFilledRubric(guide),
    };
  }
  return {
    format: 'questions',
    intro,
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
      .map((c) => ({ name: c.name.trim(), weight: c.weight > 0 ? c.weight : 0 }))
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
        const blocks =
          group.categories && group.categories.length > 0
            ? group.categories
            : [
                {
                  name: group.label || 'Scored',
                  weightPercent: 100,
                  fields: group.fields,
                  fieldWeightPercents:
                    group.weights && group.fields.length > 0
                      ? interviewWeightPercents(
                          group.fields.map((field) => ({
                            name: field,
                            weight: group.weights?.[field] ?? 1,
                          })),
                        )
                      : group.fields.map(() => 0),
                },
              ];
        return (
          <div key={group.key} className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">
              {group.label || 'Scored'}
              {isCase || group.key === 'questions' ? ` · 1–${scaleMax}` : null}
            </p>
            {blocks.map((block) => (
              <div key={`${group.key}-${block.name}`} className="space-y-1.5">
                {group.categories && group.categories.length > 0 ? (
                  <p className="flex items-center justify-between gap-3 text-sm font-medium">
                    <span>{block.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {block.weightPercent}%
                    </span>
                  </p>
                ) : null}
                <ul className="space-y-1">
                  {block.fields.map((field, index) => (
                    <li
                      key={`${group.key}-${block.name}-${field}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-md border bg-background/80 px-3 py-2 text-sm"
                    >
                      <span>{field}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {block.fieldWeightPercents[index]}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
    <GuideSection
      title={title}
      description={description}
      required
      action={
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
      }
    >
      <Card>
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
    </GuideSection>
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
  const categories = rubricCategoriesForEdit(rubric);
  const categoryShareTotal = criteriaShareTotal(
    categories.map((c) => ({ name: c.name, weight: c.weight })),
  );
  const categoriesInvalid = categoryShareTotal !== 100;

  const commit = (nextCategories: InterviewRubricCategory[]) => {
    onChange(rubricFromCategories(rubric.scaleMax, nextCategories));
  };

  return (
    <GuideSection
      title="Evaluation Criteria"
      description="Group criteria into categories (e.g. Supreme Case 60%, Group Process 40%). Category shares must total 100%, and criteria shares within each category must also total 100%."
      required
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() =>
            commit([
              ...categories,
              { name: '', weight: 0, criteria: [{ name: '', weight: 100 }] },
            ])
          }
        >
          <Plus className="mr-1 size-4" />
          Add Category
        </Button>
      }
    >
      <Card>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor={`scale-max-${stage}`}>Scale max</Label>
            <Select
              value={String(rubric.scaleMax)}
              onValueChange={(value) => {
                if (value == null) return;
                onChange(rubricFromCategories(Number(value), categories));
              }}
            >
              <SelectTrigger id={`scale-max-${stage}`} className="w-40 bg-background">
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

          <div className="space-y-4">
            {categories.map((category, categoryIndex) => {
              const criteriaRows =
                category.criteria.length > 0
                  ? category.criteria
                  : [{ name: '', weight: 100 }];
              const criterionShareTotal = criteriaShareTotal(criteriaRows);
              const criteriaInvalid = criterionShareTotal !== 100;

              return (
                <div
                  key={`${stage}-category-${categoryIndex}`}
                  className="space-y-3 rounded-xl border bg-background/60 p-4"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_2rem] items-center gap-2">
                    <Input
                      value={category.name}
                      onChange={(e) => {
                        const next = categories.map((row, i) =>
                          i === categoryIndex ? { ...row, name: e.target.value } : row,
                        );
                        commit(next);
                      }}
                      placeholder="Category name (e.g. Supreme Case)"
                      className="bg-background font-medium"
                    />
                    <div className="flex items-center gap-1">
                      <NumberDraftInput
                        integer
                        min={0}
                        max={100}
                        commitOnChange
                        invalid={categoriesInvalid}
                        value={category.weight}
                        onCommit={(weight) => {
                          const next = categories.map((row, i) =>
                            i === categoryIndex ? { ...row, weight } : row,
                          );
                          commit(next);
                        }}
                        aria-label={`Share for category ${categoryIndex + 1}`}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    {categories.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          commit(categories.filter((_, i) => i !== categoryIndex))
                        }
                        aria-label={`Remove category ${categoryIndex + 1}`}
                      >
                        <X className="size-4" />
                      </Button>
                    ) : (
                      <span />
                    )}
                  </div>

                  <div className="space-y-2 pl-1">
                    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_2rem] items-center gap-2 text-xs font-medium text-muted-foreground">
                      <span>Criterion</span>
                      <span>Share</span>
                      <span />
                    </div>
                    {criteriaRows.map((row, criterionIndex) => (
                      <div key={`${stage}-cat-${categoryIndex}-crit-${criterionIndex}`} className="space-y-2">
                        <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_2rem] items-center gap-2">
                          <Input
                            value={row.name}
                            onChange={(e) => {
                              const nextCriteria = [...criteriaRows];
                              nextCriteria[criterionIndex] = {
                                ...nextCriteria[criterionIndex],
                                name: e.target.value,
                              };
                              const next = categories.map((cat, i) =>
                                i === categoryIndex
                                  ? { ...cat, criteria: nextCriteria }
                                  : cat,
                              );
                              commit(next);
                            }}
                            placeholder={`e.g. Q1. Market Sizing`}
                            className="bg-background"
                          />
                          <div className="flex items-center gap-1">
                            <NumberDraftInput
                              integer
                              min={0}
                              max={100}
                              commitOnChange
                              invalid={criteriaInvalid}
                              value={row.weight}
                              onCommit={(weight) => {
                                const nextCriteria = [...criteriaRows];
                                nextCriteria[criterionIndex] = {
                                  ...nextCriteria[criterionIndex],
                                  weight,
                                };
                                const next = categories.map((cat, i) =>
                                  i === categoryIndex
                                    ? { ...cat, criteria: nextCriteria }
                                    : cat,
                                );
                                commit(next);
                              }}
                              aria-label={`Share for criterion ${criterionIndex + 1} in category ${categoryIndex + 1}`}
                            />
                            <span className="text-sm text-muted-foreground">%</span>
                          </div>
                          {criteriaRows.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const nextCriteria = criteriaRows.filter(
                                  (_, j) => j !== criterionIndex,
                                );
                                const next = categories.map((cat, i) =>
                                  i === categoryIndex
                                    ? {
                                        ...cat,
                                        criteria: nextCriteria.length
                                          ? nextCriteria
                                          : [{ name: '', weight: 100 }],
                                      }
                                    : cat,
                                );
                                commit(next);
                              }}
                              aria-label={`Remove criterion ${criterionIndex + 1}`}
                            >
                              <X className="size-4" />
                            </Button>
                          ) : (
                            <span />
                          )}
                        </div>
                        <Input
                          value={row.description ?? ''}
                          onChange={(e) => {
                            const nextCriteria = [...criteriaRows];
                            nextCriteria[criterionIndex] = {
                              ...nextCriteria[criterionIndex],
                              description: e.target.value,
                            };
                            const next = categories.map((cat, i) =>
                              i === categoryIndex
                                ? { ...cat, criteria: nextCriteria }
                                : cat,
                            );
                            commit(next);
                          }}
                          placeholder="Optional grading prompt (shown to interviewers)"
                          className="bg-background text-sm"
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const next = categories.map((cat, i) =>
                            i === categoryIndex
                              ? {
                                  ...cat,
                                  criteria: [...criteriaRows, { name: '', weight: 0 }],
                                }
                              : cat,
                          );
                          commit(next);
                        }}
                      >
                        <Plus className="mr-1 size-4" />
                        Add Criterion
                      </Button>
                      <p
                        className={
                          criteriaInvalid
                            ? 'flex items-center gap-1.5 text-sm text-destructive'
                            : 'text-sm text-muted-foreground'
                        }
                        role={criteriaInvalid ? 'alert' : undefined}
                      >
                        {criteriaInvalid ? (
                          <>
                            <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
                            Within category: {criterionShareTotal}% (need 100%)
                          </>
                        ) : (
                          'Within category: 100%'
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            <p
              className={
                categoriesInvalid
                  ? 'flex items-center justify-end gap-1.5 text-sm text-destructive'
                  : 'text-right text-sm text-muted-foreground'
              }
              role={categoriesInvalid ? 'alert' : undefined}
            >
              {categoriesInvalid ? (
                <>
                  <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
                  Category shares add up to {categoryShareTotal}%. They must total 100%.
                </>
              ) : (
                'Categories total 100%'
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </GuideSection>
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
    <GuideSection
      title="Case Copy (PDF)"
      description="Upload the case deck or packet interviewers show on the left side of the scoring screen. You can also paste the scenario below. The PDF is optional but recommended for case interviews."
    >
      <Card>
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
    </GuideSection>
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
    const name = meta?.team.name;
    if (!name) return;
    if (!teamUsesInterviewStage(name, stage)) {
      setStage('first_round');
    }
  }, [meta?.team.name, stage]);

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
      <div className="space-y-3" role="status" aria-label="Loading" data-page-loading="">
        <p className="uma-section-label">Interview Guide</p>
        <Card>
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
  const stagesForTeam = STAGES.filter((s) => !teamName || teamUsesInterviewStage(teamName, s));

  return (
    <div className="space-y-8">
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
            data-tour="interview-setup-guide"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList className="h-auto w-full max-w-xl">
                {stagesForTeam.map((s) => (
                  <TabsTrigger key={s} value={s} className="flex-1 px-4 py-2">
                    {interviewStageSetupCopy(teamName, s).label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="flex flex-wrap items-center gap-3" data-tour="interview-setup-save">
                <DocumentSaveStatusLine status={saveStatus} errorMessage={saveError} />
                <LoadingButton
                  variant="secondary"
                  className="shrink-0"
                  onClick={openPreview}
                  data-tour="interview-setup-preview"
                >
                  Preview Interviewer View
                </LoadingButton>
              </div>
            </div>

            {stagesForTeam.map((s) => {
              const copy = interviewStageSetupCopy(teamName, s);
              const guide = guides[s];
              const formatMeta = FORMAT_OPTIONS.find((option) => option.value === guide.format);

              return (
                <TabsContent key={s} value={s} className="space-y-8">
                  <GuideSection title="Interview Format" description={copy.hint}>
                    <Card>
                    <CardContent className="space-y-3">
                      <Select
                        value={guide.format}
                        items={FORMAT_OPTIONS}
                        onValueChange={(value) => {
                          if (value == null) return;
                          setFormatForStage(s, value as InterviewGuideFormat);
                        }}
                      >
                        <SelectTrigger
                          id={`interview-format-${s}`}
                          className="w-full max-w-xl bg-background normal-case"
                          aria-label="Interview format"
                        >
                          <SelectValue>
                            {(value: InterviewGuideFormat | null) =>
                              FORMAT_OPTIONS.find((option) => option.value === value)?.label ??
                              'Select format'
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {FORMAT_OPTIONS.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              className="normal-case"
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {formatMeta ? (
                        <p className="text-sm text-muted-foreground">{formatMeta.description}</p>
                      ) : null}
                    </CardContent>
                  </Card>
                  </GuideSection>

                  <GuideSection
                    title="Interviewer Brief"
                    description="Optional instructions shown at the top of the scoring screen."
                  >
                    <Card>
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
                  </GuideSection>

                  {(guide.format === 'case_study' || guide.format === 'case_and_behavioral') && (
                    <>
                      <CasePdfSection
                        teamId={teamId}
                        stage={s}
                        casePdfUrl={guide.casePdfUrl}
                        onChange={(casePdfUrl) => patchGuide(s, { casePdfUrl })}
                      />

                      <GuideSection
                        title={
                          guide.format === 'case_and_behavioral'
                            ? 'Part 1: Case Scenario'
                            : 'Case Scenario'
                        }
                        description="The written prompt interviewers walk through with the candidate."
                      >
                      <Card>
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
                      </GuideSection>

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

                  <GuideSection
                    title="Rubric Preview"
                    description="What interviewers see on the right: notes for packet questions, then scored criteria."
                  >
                    <Card>
                      <CardContent>
                        <RubricPreview guide={guide} />
                      </CardContent>
                    </Card>
                  </GuideSection>
                </TabsContent>
              );
            })}
          </Tabs>
        </>
      )}
    </div>
  );
}
