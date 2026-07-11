'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import StatusBanner from '@/components/status-banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { InterviewGuide, InterviewGuideFormat, InterviewGuideStage } from '@/lib/interview-guide';

interface GuideData {
  team: { id: number; name: string };
  round: { id: number; label: string; status?: string };
  guides: Record<InterviewGuideStage, InterviewGuide | null>;
}

interface TeamInterviewGuideSetupProps {
  teamId: string;
  onSaved?: () => void;
}

const STAGE_LABELS: Record<InterviewGuideStage, string> = {
  first_round: 'First Round Interview',
  final_round: 'Final Round Interview',
};

function emptyQuestionsGuide(): InterviewGuide {
  return { format: 'questions', intro: '', questions: [''] };
}

function emptyCaseStudyGuide(): InterviewGuide {
  return {
    format: 'case_study',
    intro: '',
    caseStudy: { title: '', prompt: '', discussionPoints: [''] },
  };
}

function guideFromApi(guide: InterviewGuide | null, format: InterviewGuideFormat): InterviewGuide {
  if (!guide) {
    return format === 'case_study' ? emptyCaseStudyGuide() : emptyQuestionsGuide();
  }
  if (guide.format === 'case_study') {
    return {
      format: 'case_study',
      intro: guide.intro ?? '',
      caseStudy: {
        title: guide.caseStudy?.title ?? '',
        prompt: guide.caseStudy?.prompt ?? '',
        discussionPoints:
          guide.caseStudy?.discussionPoints && guide.caseStudy.discussionPoints.length > 0
            ? guide.caseStudy.discussionPoints
            : [''],
      },
    };
  }
  return {
    format: 'questions',
    intro: guide.intro ?? '',
    questions: guide.questions && guide.questions.length > 0 ? guide.questions : [''],
  };
}

export function TeamInterviewGuideSetup({ teamId, onSaved }: TeamInterviewGuideSetupProps) {
  const [meta, setMeta] = useState<GuideData | null>(null);
  const [stage, setStage] = useState<InterviewGuideStage>('first_round');
  const [guides, setGuides] = useState<Record<InterviewGuideStage, InterviewGuide>>({
    first_round: emptyQuestionsGuide(),
    final_round: emptyQuestionsGuide(),
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
      setGuides({
        first_round: guideFromApi(json.guides.first_round, 'questions'),
        final_round: guideFromApi(json.guides.final_round, 'questions'),
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

  const setFormat = (format: InterviewGuideFormat) => {
    if (format === guides[stage].format) return;
    setGuides((prev) => ({
      ...prev,
      [stage]: format === 'case_study' ? emptyCaseStudyGuide() : emptyQuestionsGuide(),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const guide = guides[stage];
      const payload: InterviewGuide =
        guide.format === 'questions'
          ? {
              format: 'questions',
              intro: guide.intro?.trim() || undefined,
              questions: (guide.questions ?? []).map((q) => q.trim()).filter(Boolean),
            }
          : {
              format: 'case_study',
              intro: guide.intro?.trim() || undefined,
              caseStudy: {
                title: guide.caseStudy?.title?.trim() || undefined,
                prompt: guide.caseStudy?.prompt?.trim() ?? '',
                discussionPoints: (guide.caseStudy?.discussionPoints ?? [])
                  .map((p) => p.trim())
                  .filter(Boolean),
              },
            };

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
      const message = `${STAGE_LABELS[stage]} setup saved.`;
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
    return <p className="text-sm text-muted-foreground">Loading interview setup…</p>;
  }

  return (
    <div className="space-y-6">
      {error && <StatusBanner message={error} type="error" />}
      {success && <StatusBanner message={success} type="success" />}
      {meta?.round.status === 'closed' && (
        <StatusBanner type="info" message="Recruitment is closed. Interview guides are view-only." />
      )}

      {!meta ? null : (
      <>
      <Tabs
        value={stage}
        onValueChange={(v) => setStage(v as InterviewGuideStage)}
        className="space-y-6"
      >
        <TabsList>
          <TabsTrigger value="first_round">{STAGE_LABELS.first_round}</TabsTrigger>
          <TabsTrigger value="final_round">{STAGE_LABELS.final_round}</TabsTrigger>
        </TabsList>

        {(['first_round', 'final_round'] as InterviewGuideStage[]).map((s) => (
          <TabsContent key={s} value={s} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Format</CardTitle>
              </CardHeader>
              <CardContent>
                <ToggleGroup
                  value={[guides[s].format]}
                  onValueChange={(values) => {
                    const next = values[0] as InterviewGuideFormat | undefined;
                    if (next) setFormat(next);
                  }}
                  variant="outline"
                  spacing={0}
                  className="w-full"
                >
                  <ToggleGroupItem value="questions" className="flex-1">
                    Question list
                  </ToggleGroupItem>
                  <ToggleGroupItem value="case_study" className="flex-1">
                    Case study
                  </ToggleGroupItem>
                </ToggleGroup>
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
                  value={guides[s].intro ?? ''}
                  onChange={(e) =>
                    setGuides((prev) => ({
                      ...prev,
                      [s]: { ...prev[s], intro: e.target.value },
                    }))
                  }
                  rows={3}
                  placeholder="Optional context or instructions for interviewers…"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </CardContent>
            </Card>

            {guides[s].format === 'questions' ? (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Questions</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setGuides((prev) => ({
                        ...prev,
                        [s]: {
                          ...prev[s],
                          questions: [...(prev[s].questions ?? []), ''],
                        },
                      }))
                    }
                  >
                    <Plus className="mr-1 size-4" />
                    Add question
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(guides[s].questions ?? ['']).map((q, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="pt-2 text-sm text-muted-foreground">{i + 1}.</span>
                      <Input
                        value={q}
                        onChange={(e) => {
                          const next = [...(guides[s].questions ?? [])];
                          next[i] = e.target.value;
                          setGuides((prev) => ({
                            ...prev,
                            [s]: { ...prev[s], questions: next },
                          }));
                        }}
                        placeholder={`Question ${i + 1}`}
                        className="flex-1"
                      />
                      {(guides[s].questions ?? []).length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const next = (guides[s].questions ?? []).filter((_, j) => j !== i);
                            setGuides((prev) => ({
                              ...prev,
                              [s]: { ...prev[s], questions: next.length ? next : [''] },
                            }));
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
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Case study</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`case-title-${s}`}>Title (optional)</Label>
                    <Input
                      id={`case-title-${s}`}
                      value={guides[s].caseStudy?.title ?? ''}
                      onChange={(e) =>
                        setGuides((prev) => ({
                          ...prev,
                          [s]: {
                            ...prev[s],
                            caseStudy: {
                              ...prev[s].caseStudy!,
                              title: e.target.value,
                            },
                          },
                        }))
                      }
                      placeholder="e.g. Market sizing exercise"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`case-prompt-${s}`}>Prompt</Label>
                    <textarea
                      id={`case-prompt-${s}`}
                      value={guides[s].caseStudy?.prompt ?? ''}
                      onChange={(e) =>
                        setGuides((prev) => ({
                          ...prev,
                          [s]: {
                            ...prev[s],
                            caseStudy: {
                              ...prev[s].caseStudy!,
                              prompt: e.target.value,
                            },
                          },
                        }))
                      }
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
                        onClick={() =>
                          setGuides((prev) => ({
                            ...prev,
                            [s]: {
                              ...prev[s],
                              caseStudy: {
                                ...prev[s].caseStudy!,
                                discussionPoints: [
                                  ...(prev[s].caseStudy?.discussionPoints ?? []),
                                  '',
                                ],
                              },
                            },
                          }))
                        }
                      >
                        <Plus className="mr-1 size-4" />
                        Add point
                      </Button>
                    </div>
                    {(guides[s].caseStudy?.discussionPoints ?? ['']).map((point, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={point}
                          onChange={(e) => {
                            const next = [...(guides[s].caseStudy?.discussionPoints ?? [])];
                            next[i] = e.target.value;
                            setGuides((prev) => ({
                              ...prev,
                              [s]: {
                                ...prev[s],
                                caseStudy: { ...prev[s].caseStudy!, discussionPoints: next },
                              },
                            }));
                          }}
                          placeholder={`Discussion point ${i + 1}`}
                          className="flex-1"
                        />
                        {(guides[s].caseStudy?.discussionPoints ?? []).length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const next = (guides[s].caseStudy?.discussionPoints ?? []).filter(
                                (_, j) => j !== i,
                              );
                              setGuides((prev) => ({
                                ...prev,
                                [s]: {
                                  ...prev[s],
                                  caseStudy: {
                                    ...prev[s].caseStudy!,
                                    discussionPoints: next.length ? next : [''],
                                  },
                                },
                              }));
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
            )}
          </TabsContent>
        ))}
      </Tabs>

      <div className="flex justify-end">
        <LoadingButton
          onClick={handleSave}
          loading={saving}
          disabled={meta?.round.status === 'closed'}
        >
          Save {STAGE_LABELS[stage].toLowerCase()} guide
        </LoadingButton>
      </div>
      </>
      )}
    </div>
  );
}
