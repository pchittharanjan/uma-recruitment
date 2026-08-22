'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import CsvFileUpload, { type CsvParseResult } from '@/components/csv-file-upload';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PageContainer, PageContent, PageHeader, PagePanel, PageSection, TitleCount } from '@/components/page-shell';
import { phasePageEyebrow } from '@/lib/stages';
import StatusBanner from '@/components/status-banner';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  buildQuestionReview,
  buildPortfolioFieldSets,
  buildScoreFieldSets,
  detectContextHeaders,
  reviewableHeaders,
  scopeBadgeClass,
  shortHeaderLabel,
  type QuestionReviewRow,
} from '@/lib/rubric';
import {
  TEAM_NAMES,
  detectTeamSplitMode,
  splitRowsByTeam,
  suggestTeamColumn,
  summarizeSplit,
  type TeamSplitConfig,
} from '@/lib/team-split';
import type { TeamName } from '@/lib/db';
import type { EligibleGraderUser } from '@/lib/import-graders';

import GraderTeamColumn, { GraderTeamColumnSkeleton } from '@/components/grader-team-column';
import { StepTransition } from '@/components/step-transition';
import { EraseTestDataButton } from '@/components/erase-test-data-button';
import {
  isTestGraderEmail,
  testGradersForTeam,
  validateGraderList,
  mergeGraderLists,
  type GraderInput,
} from '@/lib/grader-parse';
import { DEFAULT_GRADERS_PER_APPLICATION } from '@/lib/assignments';
import { cn } from '@/lib/utils';
import { teamDotClass } from '@/lib/team-colors';
import {
  ImportWizardProgressPlaceholder,
  WIZARD_STEP_IDS,
  type WizardStepId,
} from '@/components/import-wizard-progress';

const ImportWizardProgress = dynamic(() => import('@/components/import-wizard-progress'), {
  ssr: false,
  loading: () => <ImportWizardProgressPlaceholder />,
});

type Step = WizardStepId | 'done';

interface ImportResult {
  roundLabel: string;
  teams: Array<{ team: { id: number; name: string }; applicationCount: number }>;
  unmatchedCount: number;
}

interface ImportProgressState {
  label: string;
  team: TeamName | null;
  teamIndex: number;
  teamCount: number;
  current: number;
  total: number;
  overallCurrent: number;
  overallTotal: number;
}

const STEP_ORDER: Step[] = [...WIZARD_STEP_IDS, 'done'];

function emptyScoreSets(): Record<TeamName, Set<string>> {
  return { Strategy: new Set(), Events: new Set(), Design: new Set() };
}

function emptyGraderDraft(): Record<TeamName, GraderInput[]> {
  return { Strategy: [], Events: [], Design: [] };
}

export default function UnifiedImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [roundLabel, setRoundLabel] = useState('Fall 2026');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [teamSplitConfig, setTeamSplitConfig] = useState<TeamSplitConfig | null>(null);
  const [singleColumn, setSingleColumn] = useState('');
  const [contextHeaders, setContextHeaders] = useState<Set<string>>(new Set());
  const [showContextEditor, setShowContextEditor] = useState(false);
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [scoreFieldsByTeam, setScoreFieldsByTeam] = useState<Record<TeamName, Set<string>>>(
    emptyScoreSets(),
  );
  const [graderDraftByTeam, setGraderDraftByTeam] =
    useState<Record<TeamName, GraderInput[]>>(emptyGraderDraft);
  const [gradersPerApplication, setGradersPerApplication] = useState(DEFAULT_GRADERS_PER_APPLICATION);
  const [gradersByTeam, setGradersByTeam] = useState<Partial<Record<TeamName, GraderInput[]>>>({});
  const [graderErrorsByTeam, setGraderErrorsByTeam] = useState<Partial<Record<TeamName, string>>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [uploadReady, setUploadReady] = useState(false);
  const [csvUploadKey, setCsvUploadKey] = useState(0);
  const [stepDirection, setStepDirection] = useState<'forward' | 'back'>('forward');
  const [gradersPreloadLoading, setGradersPreloadLoading] = useState(false);
  const [gradersPreloadStatus, setGradersPreloadStatus] = useState<
    'idle' | 'loading' | 'loaded' | 'empty' | 'error'
  >('idle');
  const [gradersPreloadError, setGradersPreloadError] = useState('');
  const [eligibleGraderUsers, setEligibleGraderUsers] = useState<EligibleGraderUser[]>([]);
  const prevStepRef = useRef<Step>('upload');
  const gradersPreloadedRef = useRef('');
  const contentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch('/api/admin/recruitment-cycle')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.shortLabel) setRoundLabel(json.shortLabel);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const prevIdx = STEP_ORDER.indexOf(prevStepRef.current);
    const currIdx = STEP_ORDER.indexOf(step);
    if (prevIdx !== -1 && currIdx !== -1 && prevIdx !== currIdx) {
      setStepDirection(currIdx > prevIdx ? 'forward' : 'back');
    }
    prevStepRef.current = step;
    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);

  const splitSummary = useMemo(() => {
    if (!teamSplitConfig || allRows.length === 0) return null;
    return summarizeSplit(allRows, headers, teamSplitConfig);
  }, [allRows, headers, teamSplitConfig]);

  const splitByTeam = useMemo(() => {
    if (!teamSplitConfig) return null;
    return splitRowsByTeam(allRows, headers, teamSplitConfig).byTeam;
  }, [allRows, headers, teamSplitConfig]);

  const teamsWithApps = useMemo(
    () => TEAM_NAMES.filter((t) => (splitSummary?.[t] ?? 0) > 0),
    [splitSummary],
  );

  const hasSimulatedGraders = useMemo(
    () =>
      teamsWithApps.some((team) =>
        graderDraftByTeam[team].some((g) => isTestGraderEmail(g.email)),
      ),
    [graderDraftByTeam, teamsWithApps],
  );

  const totalTeamGraders = useMemo(
    () =>
      teamsWithApps.reduce((sum, team) => sum + (graderDraftByTeam[team]?.length ?? 0), 0),
    [teamsWithApps, graderDraftByTeam],
  );

  const gradersPreloadComplete =
    !gradersPreloadLoading &&
    gradersPreloadStatus !== 'idle' &&
    gradersPreloadStatus !== 'loading';

  useEffect(() => {
    if (step !== 'graders' || teamsWithApps.length === 0) return;

    const teamsKey = [...teamsWithApps].sort().join(',');
    if (gradersPreloadedRef.current === teamsKey) return;

    let cancelled = false;
    setGradersPreloadLoading(true);
    setGradersPreloadStatus('loading');
    setGradersPreloadError('');

    fetch(`/api/admin/import/graders?teams=${encodeURIComponent(teamsKey)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? `Failed to load team users (${res.status})`);
        }
        return res.json() as Promise<{
          gradersByTeam?: Partial<Record<TeamName, GraderInput[]>>;
          eligibleUsers?: EligibleGraderUser[];
        }>;
      })
      .then((json) => {
        if (cancelled) return;
        const gradersByTeam = json?.gradersByTeam;
        if (!gradersByTeam) {
          setGradersPreloadError('Invalid response when loading team users.');
          setGradersPreloadStatus('error');
          return;
        }

        setEligibleGraderUsers(json.eligibleUsers ?? []);

        const incomingCount = teamsWithApps.reduce(
          (sum, team) => sum + ((gradersByTeam[team] ?? []) as GraderInput[]).length,
          0,
        );

        setGraderDraftByTeam((prev) => {
          const next = { ...prev };
          for (const team of teamsWithApps) {
            const existing = prev[team] ?? [];
            const preloaded = (gradersByTeam[team] ?? []) as GraderInput[];
            next[team] = mergeGraderLists(existing, preloaded);
          }
          return next;
        });

        gradersPreloadedRef.current = teamsKey;
        setGradersPreloadStatus(incomingCount > 0 ? 'loaded' : 'empty');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Failed to load team users from People.';
        setGradersPreloadError(message);
        setGradersPreloadStatus('error');
      })
      .finally(() => {
        if (!cancelled) setGradersPreloadLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [step, teamsWithApps]);

  const questionReview = useMemo((): QuestionReviewRow[] => {
    if (!splitByTeam) return [];
    return buildQuestionReview(
      headers,
      splitByTeam,
      contextHeaders,
      scoreFieldsByTeam,
      teamsWithApps,
    );
  }, [headers, splitByTeam, contextHeaders, scoreFieldsByTeam, teamsWithApps]);

  const contextRows = useMemo(
    () => questionReview.filter((r) => r.isContext),
    [questionReview],
  );

  const essayRows = useMemo(() => {
    const rows = questionReview.filter((r) => !r.isContext);
    if (showAllColumns) return rows;
    const visible = new Set(
      reviewableHeaders(headers, splitByTeam!, contextHeaders, teamsWithApps),
    );
    return rows.filter((r) => visible.has(r.header) || r.scoringTeams.length > 0);
  }, [
    questionReview,
    showAllColumns,
    headers,
    splitByTeam,
    contextHeaders,
    teamsWithApps,
  ]);

  const applySuggestions = useCallback(
    (
      fields: string[],
      rows: Record<string, string>[],
      config: TeamSplitConfig,
      context: Set<string>,
    ) => {
      setScoreFieldsByTeam(buildScoreFieldSets(fields, rows, config, context));
    },
    [],
  );

  const toggleContextColumn = (header: string, isContext: boolean) => {
    setContextHeaders((prev) => {
      const next = new Set(prev);
      if (isContext) next.add(header);
      else next.delete(header);
      return next;
    });
    if (isContext) {
      setScoreFieldsByTeam((prev) => {
        const next = { ...prev };
        for (const team of TEAM_NAMES) {
          const teamSet = new Set(prev[team]);
          teamSet.delete(header);
          next[team] = teamSet;
        }
        return next;
      });
    }
  };

  const moveToApplicationInfo = (header: string) => {
    toggleContextColumn(header, true);
    setShowContextEditor(true);
  };

  const handleParsed = useCallback(
    ({ file, headers: fields, rows }: CsvParseResult) => {
      setCsvFile(file);
      setError('');
      setHeaders(fields);
      setAllRows(rows);
      setUploadReady(true);

      const detected = detectTeamSplitMode(fields);
      let config: TeamSplitConfig;
      if (detected === 'named_columns') {
        config = { mode: 'named_columns' };
      } else {
        const suggested = suggestTeamColumn(fields) ?? fields[0] ?? '';
        setSingleColumn(suggested);
        config = { mode: 'single_column', singleColumn: suggested };
      }
      setTeamSplitConfig(config);
      const context = detectContextHeaders(fields);
      setContextHeaders(context);
      applySuggestions(fields, rows, config, context);
    },
    [applySuggestions],
  );

  const handleUploadClear = () => {
    setCsvFile(null);
    setHeaders([]);
    setAllRows([]);
    setTeamSplitConfig(null);
    setUploadReady(false);
  };

  const handleRemoveCsv = useCallback(() => {
    handleUploadClear();
    setCsvUploadKey((key) => key + 1);
    setError('');
  }, []);

  const clearCsvWizardState = useCallback(() => {
    setStep('upload');
    setSingleColumn('');
    setContextHeaders(new Set());
    setShowContextEditor(false);
    setShowAllColumns(false);
    setScoreFieldsByTeam(emptyScoreSets());
    setGraderDraftByTeam(emptyGraderDraft());
    setGradersPerApplication(DEFAULT_GRADERS_PER_APPLICATION);
    setGradersByTeam({});
    setGraderErrorsByTeam({});
    gradersPreloadedRef.current = '';
    setGradersPreloadStatus('idle');
    setGradersPreloadError('');
    setResult(null);
    setError('');
    handleUploadClear();
    setCsvUploadKey((key) => key + 1);
  }, []);

  const resetImportWizard = useCallback(() => {
    setRoundLabel('Fall 2026');
    clearCsvWizardState();
  }, [clearCsvWizardState]);

  /** Leave upload without finishing — drop file + derived wizard state. */
  const abandonUpload = useCallback(() => {
    clearCsvWizardState();
  }, [clearCsvWizardState]);

  // Clear draft upload when leaving the page (browser back / close / hard navigation).
  // Skip setState in effect cleanup — the component is unmounting anyway.
  useEffect(() => {
    const onPageHide = () => {
      clearCsvWizardState();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [clearCsvWizardState]);

  const handleUploadNext = () => {
    if (!roundLabel.trim()) {
      setError('Enter a round label.');
      return;
    }
    if (!uploadReady || allRows.length === 0) {
      setError('Upload a CSV first.');
      return;
    }
    setError('');
    setStep('teams');
  };

  const updateSingleColumn = (column: string) => {
    setSingleColumn(column);
    const config: TeamSplitConfig = { mode: 'single_column', singleColumn: column };
    setTeamSplitConfig(config);
    applySuggestions(headers, allRows, config, contextHeaders);
  };

  const toggleScoreField = (team: TeamName, header: string, checked: boolean) => {
    setScoreFieldsByTeam((prev) => {
      const next = { ...prev, [team]: new Set(prev[team]) };
      if (checked) next[team].add(header);
      else next[team].delete(header);
      return next;
    });
  };

  const handleTeamsNext = () => {
    if (!teamSplitConfig) return;
    if (teamSplitConfig.mode === 'single_column' && !singleColumn) {
      setError('Pick which column lists team choices.');
      return;
    }
    const summary = summarizeSplit(allRows, headers, teamSplitConfig);
    const activeTeams = TEAM_NAMES.filter((t) => summary[t] > 0);
    if (activeTeams.length === 0) {
      setError('No rows matched Strategy, Events, or Design. Check your team column.');
      return;
    }
    setError('');
    applySuggestions(headers, allRows, teamSplitConfig, contextHeaders);
    setStep('scoring');
  };

  const handleScoringNext = () => {
    for (const team of teamsWithApps) {
      if (scoreFieldsByTeam[team].size === 0) {
        setError(`${team} needs at least one scored question.`);
        return;
      }
    }
    setError('');
    setStep('graders');
  };

  const parseAllGraders = () => {
    const parsed: Partial<Record<TeamName, GraderInput[]>> = {};
    const errors: Partial<Record<TeamName, string>> = {};

    for (const team of teamsWithApps) {
      const draft = graderDraftByTeam[team].filter(
        (g) => g.name.trim() || g.email.trim(),
      );
      const { error: err } = validateGraderList(draft, gradersPerApplication);
      if (err) {
        errors[team] = err;
      } else {
        parsed[team] = draft;
      }
    }

    if (Object.keys(errors).length > 0) {
      setGraderErrorsByTeam(errors);
      return;
    }

    setGraderErrorsByTeam({});
    setGradersByTeam(parsed);
    setStep('confirm');
  };

  const fillTestGraders = () => {
    const next = { ...graderDraftByTeam };
    for (const team of teamsWithApps) {
      next[team] = testGradersForTeam(team);
    }
    setGraderDraftByTeam(next);
    setGraderErrorsByTeam({});
  };

  const handleSubmit = async () => {
    if (!csvFile || !teamSplitConfig || !splitSummary) return;
    const estimatedTotal = teamsWithApps.reduce((sum, team) => sum + (splitSummary[team] ?? 0), 0);

    setLoading(true);
    setError('');
    setImportProgress({
      label: 'Starting import…',
      team: null,
      teamIndex: 0,
      teamCount: teamsWithApps.length,
      current: 0,
      total: 0,
      overallCurrent: 0,
      overallTotal: estimatedTotal,
    });

    try {
      const scoreFieldsPayload: Partial<Record<TeamName, string[]>> = {};
      const portfolioFieldsPayload: Partial<Record<TeamName, string[]>> = {};
      for (const team of teamsWithApps) {
        scoreFieldsPayload[team] = Array.from(scoreFieldsByTeam[team]);
      }
      if (teamSplitConfig) {
        const portfolioSets = buildPortfolioFieldSets(
          headers,
          allRows,
          teamSplitConfig,
          contextHeaders,
        );
        for (const team of teamsWithApps) {
          portfolioFieldsPayload[team] = Array.from(portfolioSets[team]).filter(
            (h) => !scoreFieldsByTeam[team].has(h) && !contextHeaders.has(h),
          );
        }
      }

      const fd = new FormData();
      fd.append('csv', csvFile);
      fd.append('roundLabel', roundLabel.trim());
      fd.append('teamSplitConfig', JSON.stringify(teamSplitConfig));
      fd.append('gradersByTeam', JSON.stringify(gradersByTeam));
      fd.append('scoreFieldsByTeam', JSON.stringify(scoreFieldsPayload));
      fd.append('portfolioFieldsByTeam', JSON.stringify(portfolioFieldsPayload));
      fd.append('contextFields', JSON.stringify(Array.from(contextHeaders)));
      fd.append('gradersPerApplication', String(gradersPerApplication));

      const res = await fetch('/api/admin/import', { method: 'POST', body: fd });
      const contentType = res.headers.get('content-type') ?? '';

      if (!res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        const message = data.error ?? 'Import failed.';
        setError(message);
        toast.error(message);
        setStep('confirm');
        return;
      }

      if (!res.body) {
        setError('No response from server.');
        setStep('confirm');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: ImportResult | null = null;
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { type: string; [key: string]: unknown };
          try {
            event = JSON.parse(line) as { type: string; [key: string]: unknown };
          } catch {
            continue;
          }

          if (event.type === 'error') {
            streamError = String(event.message ?? 'Import failed.');
          } else if (event.type === 'complete') {
            finalResult = event.result as ImportResult;
          } else if (event.type === 'start') {
            setImportProgress((prev) =>
              prev
                ? {
                    ...prev,
                    overallTotal: Number(event.overallTotal ?? prev.overallTotal),
                    teamCount: Number(event.teamCount ?? prev.teamCount),
                    label: 'Importing applications…',
                  }
                : prev,
            );
          } else if (event.type === 'team_start') {
            setImportProgress((prev) => ({
              label: `Importing ${String(event.team)}…`,
              team: event.team as TeamName,
              teamIndex: Number(event.teamIndex ?? 0),
              teamCount: Number(event.teamCount ?? prev?.teamCount ?? teamsWithApps.length),
              current: 0,
              total: Number(event.applicationTotal ?? 0),
              overallCurrent: prev?.overallCurrent ?? 0,
              overallTotal: prev?.overallTotal ?? estimatedTotal,
            }));
          } else if (event.type === 'phase') {
            const team = String(event.team);
            const phase = String(event.phase);
            setImportProgress((prev) =>
              prev
                ? {
                    ...prev,
                    label:
                      phase === 'graders'
                        ? `Setting up ${team} users…`
                        : `Assigning ${team} users…`,
                  }
                : prev,
            );
          } else if (event.type === 'application') {
            setImportProgress((prev) => ({
              label: `Importing ${String(event.team)}…`,
              team: event.team as TeamName,
              teamIndex: prev?.teamIndex ?? 0,
              teamCount: prev?.teamCount ?? teamsWithApps.length,
              current: Number(event.current ?? 0),
              total: Number(event.total ?? 0),
              overallCurrent: Number(event.overallCurrent ?? 0),
              overallTotal: Number(event.overallTotal ?? prev?.overallTotal ?? estimatedTotal),
            }));
          } else if (event.type === 'team_complete') {
            setImportProgress((prev) =>
              prev
                ? {
                    ...prev,
                    label: `${String(event.team)} complete`,
                  }
                : prev,
            );
          }
        }
      }

      if (streamError) {
        setError(streamError);
        toast.error(streamError);
        setStep('confirm');
        return;
      }

      if (finalResult) {
        setResult(finalResult);
        setStep('done');
        toast.success('Import complete');
      } else {
        const message = 'Import finished without a result.';
        setError(message);
        toast.error(message);
        setStep('confirm');
      }
    } catch {
      const message = 'Network error. Please try again.';
      setError(message);
      toast.error(message);
      setStep('confirm');
    } finally {
      setLoading(false);
      setImportProgress(null);
    }
  };

  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        eyebrow={phasePageEyebrow('application')}
        title="Import Applications"
        description="Load this cycle’s spreadsheet, map teams, then assign graders. Unlock grading later from the dashboard."
        actions={<EraseTestDataButton onSuccess={resetImportWizard} redirectTo="/admin/import" />}
      />

      {step !== 'done' && (
        <ImportWizardProgress currentStepId={step as WizardStepId} />
      )}

      {error && <StatusBanner message={error} type="error" />}

      <PageSection ref={contentRef} className="space-y-0">
        <StepTransition stepKey={step} direction={stepDirection}>
        {step === 'upload' && (
          <PageContent width="narrow">
            <div className="space-y-6 pt-4 sm:pt-6">
              <div className="space-y-1.5">
                <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                  Upload spreadsheet
                </h2>
                <p className="max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground">
                  Export from Google Forms, Excel, or Numbers (as Excel/CSV), then drop the file
                  here. Next steps split applicants by team and set up graders.
                </p>
              </div>

              <CsvFileUpload
                key={csvUploadKey}
                onParsed={handleParsed}
                onError={setError}
                onClear={handleRemoveCsv}
              />

              {uploadReady && csvFile ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {allRows.length.toLocaleString()} rows
                  </span>
                  {' · '}
                  {headers.length} columns · {roundLabel} cycle
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-3 border-t border-border/60 pt-5">
                <LoadingButton
                  onClick={handleUploadNext}
                  disabled={!uploadReady}
                  className={uploadReady ? 'uma-cta-primary' : undefined}
                  title={!uploadReady ? 'Upload a CSV first' : undefined}
                >
                  Continue →
                </LoadingButton>
              </div>
            </div>
          </PageContent>
        )}

        {step === 'teams' && teamSplitConfig && (
          <PageContent width="narrow">
            <PagePanel className="space-y-4">
              <h2 className="text-base font-semibold">Team Split</h2>

              {teamSplitConfig.mode === 'named_columns' ? (
                <div className="rounded-lg bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-900">
                  Found Strategy, Events, and Design columns (yes/no style).
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="teamColumn" required>
                    Team choices column
                  </Label>
                  <NativeSelect
                    id="teamColumn"
                    value={singleColumn}
                    onChange={(e) => updateSingleColumn(e.target.value)}
                  >
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {shortHeaderLabel(h, 100)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}

              {splitSummary && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {TEAM_NAMES.map((team) => (
                    <div
                      key={team}
                      className="rounded-md bg-muted/60 px-4 py-4 text-center"
                    >
                      <p className="text-xs font-medium text-muted-foreground">{team}</p>
                      <p className="mt-1 text-3xl font-semibold tabular-nums text-primary">
                        {splitSummary[team]}
                      </p>
                    </div>
                  ))}
                  <div className="rounded-md bg-muted/60 px-4 py-4 text-center">
                    <p className="text-xs font-medium text-muted-foreground">Total</p>
                    <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
                      {allRows.length}
                    </p>
                  </div>
                </div>
              )}

              {splitSummary && splitSummary.unmatched > 0 && (
                <p className="text-sm text-amber-800">
                  {splitSummary.unmatched} row{splitSummary.unmatched === 1 ? '' : 's'} skipped
                </p>
              )}

              <div className="flex items-center justify-between gap-3 pt-4">
                <LoadingButton variant="secondary" onClick={abandonUpload}>
                  Back
                </LoadingButton>
                <LoadingButton onClick={handleTeamsNext}>Continue →</LoadingButton>
              </div>
            </PagePanel>
          </PageContent>
        )}

        {step === 'scoring' && teamSplitConfig && splitByTeam && (
          <PagePanel className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Review Question Tagging</h2>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                Link columns (Google Drive, Figma, portfolio URLs) are auto-classified as portfolio
                fields for Design. Graders see them in a separate panel without names or email.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-lg bg-muted/60 px-3 py-1.5">
                {essayRows.length} questions shown
              </span>
              <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                <Checkbox
                  checked={showAllColumns}
                  onCheckedChange={(checked) => setShowAllColumns(checked === true)}
                />
                Show empty columns
              </label>
            </div>

            <div className="overflow-x-auto -mx-5 sm:-mx-8">
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="w-[50%] px-5 py-3 font-medium sm:px-8">Question</th>
                    <th className="w-[11%] px-3 py-3 font-medium">To whom</th>
                    {teamsWithApps.map((team) => (
                      <th key={team} className="w-[8%] px-2 py-3 text-center font-medium">
                        {team}
                      </th>
                    ))}
                    <th className="w-[7%] px-2 py-3 text-center font-medium">
                      <span className="sr-only">Move to application info</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {essayRows.map((row) => (
                      <tr key={row.header}>
                        <td className="px-5 py-3.5 align-top sm:px-8">
                          <p className="leading-snug">{shortHeaderLabel(row.header, 200)}</p>
                        </td>
                        <td className="px-2 py-3.5 align-top">
                          <span
                            className={`inline-block max-w-[9rem] rounded px-2 py-0.5 text-xs font-medium leading-tight ${scopeBadgeClass(row.scopeKind, row.scoringTeams)}`}
                          >
                            {row.scopeLabel}
                          </span>
                        </td>
                        {teamsWithApps.map((team) => {
                          const hasApps = (splitSummary?.[team] ?? 0) > 0;
                          return (
                            <td key={team} className="px-3 py-3.5 text-center">
                              {hasApps ? (
                                <Checkbox
                                  checked={scoreFieldsByTeam[team].has(row.header)}
                                  onCheckedChange={(checked) =>
                                    toggleScoreField(team, row.header, checked === true)
                                  }
                                  aria-label={`Score for ${team}`}
                                />
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-3.5 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-sm text-muted-foreground"
                            onClick={() => moveToApplicationInfo(row.header)}
                            aria-label={`Move "${shortHeaderLabel(row.header, 40)}" to application info`}
                          >
                            <ArrowDown className="size-3.5" aria-hidden />
                            Info
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="pt-4">
              <button
                type="button"
                onClick={() => setShowContextEditor((v) => !v)}
                className="flex w-full items-center justify-between py-2 text-left text-sm font-medium"
              >
                <span className="flex items-baseline gap-2.5">
                  Application info
                  <TitleCount>{contextRows.length} columns, not scored</TitleCount>
                </span>
                <span className="text-muted-foreground">{showContextEditor ? 'Hide' : 'Show'}</span>
              </button>
              {showContextEditor && (
                <div className="space-y-1 pt-3">
                  <p className="mb-2 text-sm text-muted-foreground">
                    Name, email, year, GPA, and similar fields stay out of the grader view. Move a
                    question here if it should not be scored. Graders only see columns you check as
                    scored per team.
                  </p>
                  {contextRows.map((row) => (
                    <div
                      key={row.header}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 uma-hover-on-panel"
                    >
                      <span className="min-w-0 text-sm">{shortHeaderLabel(row.header)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 gap-1 text-sm"
                        onClick={() => toggleContextColumn(row.header, false)}
                      >
                        <RotateCcw className="size-3.5" aria-hidden />
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <LoadingButton variant="secondary" onClick={() => setStep('teams')}>
                Back
              </LoadingButton>
              <LoadingButton onClick={handleScoringNext}>Continue →</LoadingButton>
            </div>
          </PagePanel>
        )}

        {step === 'graders' && (
          <PagePanel className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Users per Team</h2>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                  Applications are randomized across these users. After import you can see who got
                  whom, even out counts, give someone fewer apps, or reassign a conflict.
                </p>
                {hasSimulatedGraders && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Simulated users use @berkeley.edu test emails, and they are created automatically
                    on import.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {gradersPreloadLoading && (
                  <span
                    className="text-sm text-muted-foreground"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                  >
                    Loading team users…
                  </span>
                )}
                {gradersPreloadComplete && totalTeamGraders > 0 && (
                  <span className="text-sm text-emerald-700">
                    Loaded users with team access for{' '}
                    {teamsWithApps.length === 1 ? 'this team' : 'these teams'}.
                  </span>
                )}
                {gradersPreloadComplete &&
                  totalTeamGraders === 0 &&
                  gradersPreloadStatus === 'empty' && (
                    <span className="text-sm text-amber-800">
                      No users with team access found under People for{' '}
                      {teamsWithApps.length === 1 ? 'this team' : 'these teams'} - add users
                      manually or use Simulate users.
                    </span>
                  )}
                {gradersPreloadComplete &&
                  totalTeamGraders === 0 &&
                  gradersPreloadStatus === 'error' && (
                    <span className="text-sm text-destructive">
                      {gradersPreloadError || 'Could not load team users from People.'}
                    </span>
                  )}
                <Button type="button" variant="outline" size="sm" onClick={fillTestGraders}>
                  Simulate users
                </Button>
              </div>
            </div>

            <div className="display-panel flex flex-wrap items-end gap-4 px-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="gradersPerApplication" required>
                  Users per application
                </Label>
                <NativeSelect
                  id="gradersPerApplication"
                  value={String(gradersPerApplication)}
                  onChange={(e) => setGradersPerApplication(Number.parseInt(e.target.value, 10))}
                  className="w-32"
                >
                  {[2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <p className="pb-2 text-sm text-muted-foreground md:whitespace-nowrap">
                Graders per application
              </p>
            </div>

            <div
              className="grid grid-cols-1 gap-5 pb-16 md:grid-cols-3 md:items-start"
              aria-busy={gradersPreloadLoading}
            >
              {gradersPreloadLoading
                ? teamsWithApps.map((team) => <GraderTeamColumnSkeleton key={team} />)
                : teamsWithApps.map((team) => (
                    <GraderTeamColumn
                      key={team}
                      team={team}
                      applicationCount={splitSummary?.[team] ?? 0}
                      graders={graderDraftByTeam[team]}
                      eligibleUsers={eligibleGraderUsers}
                      minGraders={gradersPerApplication}
                      error={graderErrorsByTeam[team]}
                      onChange={(graders) => {
                        setGraderDraftByTeam((prev) => ({ ...prev, [team]: graders }));
                        setGraderErrorsByTeam((prev) => {
                          if (!prev[team]) return prev;
                          const next = { ...prev };
                          delete next[team];
                          return next;
                        });
                      }}
                      onError={(msg) =>
                        setGraderErrorsByTeam((prev) => ({
                          ...prev,
                          [team]: msg.replace(`${team}: `, ''),
                        }))
                      }
                    />
                  ))}
            </div>

            <div className="flex items-center justify-between gap-3 pt-4">
              <LoadingButton variant="secondary" onClick={() => setStep('scoring')}>
                Back
              </LoadingButton>
              <LoadingButton onClick={parseAllGraders}>Continue →</LoadingButton>
            </div>
          </PagePanel>
        )}

        {step === 'confirm' && splitSummary && (
          <PageContent width="narrow">
            <div className="space-y-6">
              <div className="space-y-1.5">
                <h2 className="font-heading text-lg font-semibold tracking-tight">
                  Confirm import
                </h2>
                <p className="text-sm text-muted-foreground">
                  Double-check the split, then import. This creates applications and grader
                  assignments for each team.
                </p>
              </div>

              <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
                <dl className="divide-y divide-border/50 text-sm">
                  <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                    <dt className="text-muted-foreground">Round</dt>
                    <dd className="font-medium text-foreground">{roundLabel}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                    <dt className="text-muted-foreground">Graders per application</dt>
                    <dd className="font-medium tabular-nums text-foreground">
                      {gradersPerApplication}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  By team
                </p>
                <ul className="grid gap-2 sm:grid-cols-3">
                  {teamsWithApps.map((team) => (
                    <li
                      key={team}
                      className="rounded-xl border border-border/70 bg-background px-4 py-3"
                    >
                      <p className="text-sm font-semibold text-foreground">{team}</p>
                      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                        {splitSummary[team]}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {scoreFieldsByTeam[team].size} questions ·{' '}
                        {gradersByTeam[team]?.length ?? 0} users
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              {loading && importProgress ? (
                <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{importProgress.label}</p>
                    {importProgress.teamCount > 1 && importProgress.teamIndex > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Team {importProgress.teamIndex} of {importProgress.teamCount}
                      </p>
                    ) : null}
                  </div>
                  {importProgress.team && importProgress.total > 0 ? (
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {importProgress.team}: {importProgress.current} / {importProgress.total}{' '}
                      applications
                    </p>
                  ) : null}
                  {importProgress.overallTotal > 0 ? (
                    <div className="space-y-2">
                      <div className="flex justify-between gap-3 text-sm tabular-nums text-muted-foreground">
                        <span>Overall</span>
                        <span>
                          {importProgress.overallCurrent} / {importProgress.overallTotal}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                          style={{
                            width: `${Math.min(
                              100,
                              (importProgress.overallCurrent / importProgress.overallTotal) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-5">
                <LoadingButton
                  variant="secondary"
                  onClick={() => setStep('graders')}
                  disabled={loading}
                >
                  Back
                </LoadingButton>
                <LoadingButton
                  onClick={handleSubmit}
                  loading={loading}
                  disabled={loading}
                  className="uma-cta-primary"
                >
                  {loading ? 'Importing…' : 'Import all teams →'}
                </LoadingButton>
              </div>
            </div>
          </PageContent>
        )}

        {step === 'done' && result && (
          <PageContent width="narrow">
            <div className="space-y-6">
              <div className="space-y-1.5">
                <h2 className="font-heading text-lg font-semibold tracking-tight">
                  Import complete
                </h2>
                <p className="text-sm text-muted-foreground">
                  Review each team&apos;s random assignments next: counts, who each grader got, then
                  even out or reassign conflicts. Unlock grading from the dashboard when you&apos;re
                  ready.
                </p>
              </div>

              <StatusBanner
                message="Applications imported successfully."
                type="success"
              />

              <ul className="overflow-hidden rounded-xl border border-border/70 bg-background">
                {result.teams.map((t, index) => (
                  <li
                    key={t.team.name}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm',
                      index > 0 && 'border-t border-border/50',
                    )}
                  >
                    <span className="inline-flex items-center gap-2 font-medium text-foreground">
                      <span
                        className={cn('size-2 shrink-0 rounded-full', teamDotClass(t.team.name))}
                        aria-hidden
                      />
                      {t.team.name}
                      <span className="font-normal tabular-nums text-muted-foreground">
                        {t.applicationCount.toLocaleString()} applications
                      </span>
                    </span>
                    {t.team.id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/admin/teams/${t.team.id}/assignments`} />}
                      >
                        Review assignments
                      </Button>
                    ) : null}
                  </li>
                ))}
                {result.unmatchedCount > 0 ? (
                  <li className="border-t border-border/50 px-4 py-3 text-sm text-amber-800">
                    {result.unmatchedCount} rows skipped (no team match)
                  </li>
                ) : null}
              </ul>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-5">
                <LoadingButton
                  variant="secondary"
                  onClick={() => router.push('/admin/dashboard#pipeline-controls')}
                >
                  Click to unlock each phase
                </LoadingButton>
                <LoadingButton
                  onClick={() => router.push('/admin/dashboard')}
                  className="uma-cta-primary"
                >
                  Go to dashboard →
                </LoadingButton>
              </div>
            </div>
          </PageContent>
        )}
        </StepTransition>
      </PageSection>
    </PageContainer>
  );
}
