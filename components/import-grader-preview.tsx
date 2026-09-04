'use client';

import { useEffect, useMemo, useState } from 'react';
import { ApplicationQuestionRubricCard } from '@/components/application-question-rubric';
import { PortfolioLinkPreview } from '@/components/portfolio-link-preview';
import { ResponseText } from '@/components/response-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  applicantDisplayId,
  filterFieldsForBlindReview,
  filterPortfolioFieldsForBlindReview,
} from '@/lib/blind';
import {
  applicationCsvFields,
  getApplicationComponent,
  portfolioCsvField,
  primaryScoredQuestions,
  questionsLinkedTo,
} from '@/lib/grading-model';
import type { TeamGradingModel } from '@/lib/grading-model-types';
import type { TeamName } from '@/lib/db';
import { teamUsesApplicationPortfolio } from '@/lib/fall-2026-grading-model';
import type { SplitRow } from '@/lib/team-split';
import { cn } from '@/lib/utils';

const IDENTIFYING_HEADER =
  /^(email|e-mail|name|full name|first name|last name|preferred name|berkeley email)/i;

function stripIdentifyingFields(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (IDENTIFYING_HEADER.test(key.trim())) continue;
    out[key] = value;
  }
  return out;
}

function renderWithLinks(text: string) {
  return <ResponseText text={text} />;
}

interface ImportGraderPreviewProps {
  teams: TeamName[];
  splitByTeam: Record<TeamName, SplitRow[]>;
  gradingModelByTeam: Partial<Record<TeamName, TeamGradingModel>>;
  /** Extra portfolio columns from Questions auto-detect (Design). */
  portfolioFieldsByTeam?: Partial<Record<TeamName, string[]>>;
}

export default function ImportGraderPreview({
  teams,
  splitByTeam,
  gradingModelByTeam,
  portfolioFieldsByTeam,
}: ImportGraderPreviewProps) {
  const [activeTeam, setActiveTeam] = useState<TeamName>(teams[0] ?? 'Strategy');
  const [sampleIndexByTeam, setSampleIndexByTeam] = useState<Partial<Record<TeamName, number>>>(
    {},
  );

  useEffect(() => {
    if (teams.length === 0) return;
    if (!teams.includes(activeTeam)) setActiveTeam(teams[0]!);
  }, [teams, activeTeam]);

  const sample = useMemo(() => {
    const rows = splitByTeam[activeTeam] ?? [];
    if (rows.length === 0) return null;
    const idx = sampleIndexByTeam[activeTeam] ?? 0;
    return rows[idx % rows.length] ?? null;
  }, [splitByTeam, activeTeam, sampleIndexByTeam]);

  const sampleRow = sample?.fields ?? null;

  const model = gradingModelByTeam[activeTeam];
  const app = model ? getApplicationComponent(model) : undefined;
  const allQuestions = (app?.questions ?? []).filter((q) => q.id !== 'portfolio');
  const questions = primaryScoredQuestions(allQuestions);

  const scoreFields = model ? applicationCsvFields(model) : [];
  const portfolioFromModel = model ? portfolioCsvField(model) : undefined;
  const portfolioFields = [
    ...new Set([
      ...(portfolioFromModel ? [portfolioFromModel] : []),
      ...(portfolioFieldsByTeam?.[activeTeam] ?? []),
    ]),
  ];

  const blindFields = useMemo(() => {
    if (!sampleRow) return {};
    const stripped = stripIdentifyingFields(sampleRow);
    return filterFieldsForBlindReview(stripped, scoreFields, portfolioFields);
  }, [sampleRow, scoreFields, portfolioFields]);

  const portfolioOnly = useMemo(() => {
    if (!sampleRow) return {};
    const stripped = stripIdentifyingFields(sampleRow);
    return filterPortfolioFieldsForBlindReview(stripped, portfolioFields);
  }, [sampleRow, portfolioFields]);

  const showPortfolio = teamUsesApplicationPortfolio(activeTeam);

  const rowCount = splitByTeam[activeTeam]?.length ?? 0;
  const currentIdx = sampleIndexByTeam[activeTeam] ?? 0;
  const displayId = applicantDisplayId(
    sample?.sourceIndex ?? currentIdx % Math.max(rowCount, 1),
  );

  if (teams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No team samples available to preview.</p>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Grader preview</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Sample view from a CSV row using your drafted criteria. Nothing is saved yet — assignment
          happens on the final Assign step.
        </p>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
        Preview only — assignments have not been created yet.
      </div>

      <Tabs
        value={activeTeam}
        onValueChange={(v) => {
          if (teams.includes(v as TeamName)) setActiveTeam(v as TeamName);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList variant="line" className="h-auto w-full max-w-xl justify-start sm:w-auto">
            {teams.map((team) => (
              <TabsTrigger key={team} value={team}>
                {team}
              </TabsTrigger>
            ))}
          </TabsList>
          {rowCount > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setSampleIndexByTeam((prev) => ({
                  ...prev,
                  [activeTeam]: ((prev[activeTeam] ?? 0) + 1) % rowCount,
                }))
              }
            >
              Next sample ({(currentIdx % rowCount) + 1}/{rowCount})
            </Button>
          ) : null}
        </div>

        {teams.map((team) => (
          <TabsContent key={team} value={team} className="pt-4">
            {team !== activeTeam ? null : !sampleRow || !model ? (
              <p className="text-sm text-amber-800">
                {!model
                  ? `No criteria drafted for ${team} yet — go back to Criteria.`
                  : `No sample rows for ${team}.`}
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-medium text-muted-foreground">{displayId}</p>

                <div
                  className={cn(
                    'grid gap-6 lg:items-start',
                    showPortfolio ? 'lg:grid-cols-2' : '',
                  )}
                >
                  <section className="space-y-4">
                    <h3 className="uma-section-label">Written responses</h3>
                    {questions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No application questions.</p>
                    ) : (
                      questions.map((question) => (
                        <Card key={question.id} className="p-4 sm:p-5">
                          <ApplicationQuestionRubricCard
                            question={question}
                            linkedQuestions={questionsLinkedTo(allQuestions, question.id)}
                            scores={{}}
                            notes=""
                            activeField={null}
                            disabled
                            onScore={() => {}}
                            renderResponse={renderWithLinks}
                            fields={blindFields}
                          />
                        </Card>
                      ))
                    )}
                  </section>

                  {showPortfolio ? (
                    <section className="space-y-4">
                      <h3 className="uma-section-label">Portfolio &amp; supplementary</h3>
                      <Card className="p-4 sm:p-5">
                        {Object.keys(portfolioOnly).length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No portfolio links for this applicant.
                          </p>
                        ) : (
                          <div className="space-y-5">
                            {Object.entries(portfolioOnly).map(([field, val]) => (
                              <div key={field} className="flex flex-col gap-1.5">
                                <p className="text-xs font-medium text-muted-foreground">
                                  {field}
                                </p>
                                {val.startsWith('http://') || val.startsWith('https://') ? (
                                  <PortfolioLinkPreview
                                    url={val}
                                    openLabel={`${displayId} - Portfolio`}
                                    compact
                                    blind
                                  />
                                ) : (
                                  <p className="text-sm">{val}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    </section>
                  ) : null}
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
