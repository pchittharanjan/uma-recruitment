'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import StatusBanner from '@/components/status-banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, RequiredAsterisk } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  defaultInterviewGuideFormat,
  interviewStageSetupCopy,
  type InterviewGuide,
  type InterviewGuideFormat,
  type InterviewGuideStage,
} from '@/lib/interview-guide';

interface GuideData {
  team: { id: number; name: string };
  round: { id: number; label: string; status?: string };
  guides: Record<InterviewGuideStage, InterviewGuide | null>;
}

interface TeamInterviewGuideSetupProps {
  teamId: string;
  onSaved?: () => void;
}

const STAGES: InterviewGuideStage[] = ['first_round', 'final_round'];

function emptyCaseStudy() {
  return { title: '', prompt: '', discussionPoints: [''] };
}

function emptyGuide(format: InterviewGuideFormat): InterviewGuide {
  if (format === 'questions') {
    return { format: 'questions', intro: '', questions: [''] };
  }
  if (format === 'case_study') {
    return { format: 'case_study', intro: '', caseStudy: emptyCaseStudy() };
  }
  return {
    format: 'case_and_behavioral',
    intro: '',
    caseStudy: emptyCaseStudy(),
    questions: [''],
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
    };
  }
  if (guide.format === 'case_study') {
    return {
      format: 'case_study',
      intro: guide.intro ?? '',
      casePdfUrl: guide.casePdfUrl,
      caseStudy: withFilledCase(guide),
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

  if (guide.format === 'case_study') {
    return { format: 'case_study', intro, casePdfUrl, caseStudy };
  }

  return {
    format: 'case_and_behavioral',
    intro,
    casePdfUrl,
    caseStudy,
    questions: (guide.questions ?? []).map((q) => q.trim()).filter(Boolean),
  };
}

function QuestionsEditor({
  stage,
  title,
  questions,
  onChange,
}: {
  stage: InterviewGuideStage;
  title: string;
  questions: string[];
  onChange: (questions: string[]) => void;
}) {
  const items = questions.length > 0 ? questions : [''];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          {title}
          <RequiredAsterisk className="ml-0.5" />
        </CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, ''])}
        >
          <Plus className="mr-1 size-4" />
          Add question
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((q, i) => (
          <div key={`${stage}-q-${i}`} className="flex gap-2">
            <span className="pt-2 text-sm text-muted-foreground">{i + 1}.</span>
            <Input
              value={q}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
              placeholder={`Question ${i + 1}`}
              className="flex-1"
            />
            {items.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  const next = items.filter((_, j) => j !== i);
                  onChange(next.length ? next : ['']);
                }}
                aria-label="Remove question"
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

function CaseStudyEditor({
  stage,
  partLabel,
  caseStudy,
  onChange,
}: {
  stage: InterviewGuideStage;
  partLabel?: string;
  caseStudy: NonNullable<InterviewGuide['caseStudy']>;
  onChange: (caseStudy: NonNullable<InterviewGuide['caseStudy']>) => void;
}) {
  const points = caseStudy.discussionPoints && caseStudy.discussionPoints.length > 0
    ? caseStudy.discussionPoints
    : [''];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{partLabel ?? 'Case study'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`case-title-${stage}`}>Title (optional)</Label>
          <Input
            id={`case-title-${stage}`}
            value={caseStudy.title ?? ''}
            onChange={(e) => onChange({ ...caseStudy, title: e.target.value })}
            placeholder="e.g. Market sizing exercise"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`case-prompt-${stage}`} required>
            Prompt
          </Label>
          <textarea
            id={`case-prompt-${stage}`}
            value={caseStudy.prompt ?? ''}
            onChange={(e) => onChange({ ...caseStudy, prompt: e.target.value })}
            rows={6}
            placeholder="The case scenario interviewers present to applicants…"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Discussion points (optional)</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ ...caseStudy, discussionPoints: [...points, ''] })}
            >
              <Plus className="mr-1 size-4" />
              Add point
            </Button>
          </div>
          {points.map((point, i) => (
            <div key={`${stage}-pt-${i}`} className="flex gap-2">
              <Input
                value={point}
                onChange={(e) => {
                  const next = [...points];
                  next[i] = e.target.value;
                  onChange({ ...caseStudy, discussionPoints: next });
                }}
                placeholder={`Discussion point ${i + 1}`}
                className="flex-1"
              />
              {points.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const next = points.filter((_, j) => j !== i);
                    onChange({
                      ...caseStudy,
                      discussionPoints: next.length ? next : [''],
                    });
                  }}
                  aria-label="Remove discussion point"
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function TeamInterviewGuideSetup({ teamId, onSaved }: TeamInterviewGuideSetupProps) {
  const [meta, setMeta] = useState<GuideData | null>(null);
  const [stage, setStage] = useState<InterviewGuideStage>('first_round');
  const [guides, setGuides] = useState<Record<InterviewGuideStage, InterviewGuide>>({
    first_round: emptyGuide('questions'),
    final_round: emptyGuide('questions'),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/interview-guide`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load interview setup.');
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
    } catch {
      setError('Failed to load interview setup.');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

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

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = payloadFromGuide(guides[stage]);
      const res = await fetch(`/api/admin/teams/${teamId}/interview-guide`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, guide: payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error ?? 'Failed to save.';
        setError(message);
        toast.error(message);
        return;
      }
      const copy = interviewStageSetupCopy(meta?.team.name ?? '', stage);
      const message = `${copy.label} setup saved.`;
      setSuccess(message);
      toast.success(message);
      if (json.guide) {
        setGuides((prev) => ({
          ...prev,
          [stage]: guideFromApi(json.guide, json.guide.format),
        }));
      }
      onSaved?.();
    } catch {
      setError('Network error.');
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading">
        <Skeleton className="h-9 w-72" />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interview guide</CardTitle>
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
  const activeCopy = interviewStageSetupCopy(teamName, stage);

  return (
    <div className="space-y-6">
      {error && <StatusBanner message={error} type="error" />}
      {success && <StatusBanner message={success} type="success" />}
      {meta?.round.status === 'closed' && (
        <StatusBanner
          type="info"
          message="Recruitment is closed. Teams are view-only — you can still edit interview guides."
        />
      )}

      {!meta ? null : (
      <>
      <Tabs
        value={stage}
        onValueChange={(v) => setStage(v as InterviewGuideStage)}
        className="space-y-6"
      >
        <TabsList>
          {STAGES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {interviewStageSetupCopy(teamName, s).label}
            </TabsTrigger>
          ))}
        </TabsList>

        {STAGES.map((s) => {
          const copy = interviewStageSetupCopy(teamName, s);
          const guide = guides[s];
          return (
          <TabsContent key={s} value={s} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Format</CardTitle>
                {copy.hint && <CardDescription>{copy.hint}</CardDescription>}
              </CardHeader>
              <CardContent>
                <ToggleGroup
                  value={[guide.format]}
                  onValueChange={(values) => {
                    const next = values[0] as InterviewGuideFormat | undefined;
                    if (next) setFormatForStage(s, next);
                  }}
                  variant="outline"
                  spacing={0}
                  className="w-full"
                >
                  <ToggleGroupItem value="questions" className="flex-1">
                    Questions
                  </ToggleGroupItem>
                  <ToggleGroupItem value="case_study" className="flex-1">
                    Case
                  </ToggleGroupItem>
                  <ToggleGroupItem value="case_and_behavioral" className="flex-1">
                    Case + behavioral
                  </ToggleGroupItem>
                </ToggleGroup>
                {guide.casePdfUrl && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Case PDF is attached. During the round it shows on the left; notes and 1–5
                    scores stay on the right.{' '}
                    <a
                      href={guide.casePdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      Preview PDF
                    </a>
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Interviewer brief</CardTitle>
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
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </CardContent>
            </Card>

            {(guide.format === 'case_study' || guide.format === 'case_and_behavioral') && (
              <CaseStudyEditor
                stage={s}
                partLabel={
                  guide.format === 'case_and_behavioral' ? 'Part 1 — Case' : 'Case study'
                }
                caseStudy={withFilledCase(guide)}
                onChange={(caseStudy) => patchGuide(s, { caseStudy })}
              />
            )}

            {(guide.format === 'questions' || guide.format === 'case_and_behavioral') && (
              <QuestionsEditor
                stage={s}
                title={
                  guide.format === 'case_and_behavioral'
                    ? 'Part 2 — Behavioral'
                    : 'Questions'
                }
                questions={guide.questions ?? ['']}
                onChange={(questions) => patchGuide(s, { questions })}
              />
            )}
          </TabsContent>
          );
        })}
      </Tabs>

      <div className="flex justify-end">
        <LoadingButton onClick={handleSave} loading={saving}>
          Save {activeCopy.label.toLowerCase()} guide
        </LoadingButton>
      </div>
      </>
      )}
    </div>
  );
}
