'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import CsvFileUpload, { type CsvParseResult } from '@/components/csv-file-upload';
import StatusBanner from '@/components/status-banner';
import { PageContainer, PageHeader, PagePanel, PageSection, TitleCount } from '@/components/page-shell';
import { SpreadsheetUploadPanel } from '@/components/spreadsheet-upload-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatTeamsInterested } from '@/lib/coffee-chats';
import {
  COFFEE_CHAT_IMPORT_FIELD_LABELS,
  COFFEE_CHAT_IMPORT_FIELDS,
  suggestCoffeeChatColumnMap,
  type CoffeeChatColumnMap,
  type CoffeeChatImportField,
  type CoffeeChatImportMatchPreview,
  type CoffeeChatImportPersonOption,
  type CoffeeChatImportResolution,
} from '@/lib/coffee-chat-import';
import type { TeamName } from '@/lib/db';
import { phasePageEyebrow } from '@/lib/stages';
import { cn } from '@/lib/utils';

interface ApplicantMatch {
  status: 'matched' | 'unmatched';
  candidateId: number | null;
  candidateName: string | null;
  detail: string;
}

interface CoffeeChatRow {
  id: number;
  chat_date: string;
  submitter_name: string;
  applicant_name: string;
  applicant_email: string | null;
  applicant_grade_level: string | null;
  teams_interested: TeamName[];
  vibes: string | null;
  green_flags: string | null;
  red_flags: string | null;
  other_comments: string | null;
  conflict_of_interest: string | null;
  applicant_match?: ApplicantMatch;
}

type ImportStep = 'idle' | 'map' | 'preview';

type RowDecision = 'pending' | 'confirmed' | 'picked' | 'skipped';

interface RowResolutionState {
  decision: RowDecision;
  userId: number | null;
  candidateId: number | null;
  /** True when the admin overrode the suggested UMA / applicant pick. */
  umaPicked: boolean;
  applicantPicked: boolean;
}

function emptyResolution(): RowResolutionState {
  return {
    decision: 'pending',
    userId: null,
    candidateId: null,
    umaPicked: false,
    applicantPicked: false,
  };
}

function initResolutionsFromPreviews(
  previews: CoffeeChatImportMatchPreview[],
): Record<number, RowResolutionState> {
  const next: Record<number, RowResolutionState> = {};
  for (const preview of previews) {
    if (preview.isDuplicate) {
      next[preview.rowIndex] = {
        decision: 'skipped',
        userId: preview.uma.userId,
        candidateId: preview.applicant.candidateId,
        umaPicked: false,
        applicantPicked: false,
      };
      continue;
    }
    next[preview.rowIndex] = {
      decision: 'pending',
      // Pre-fill suggestions for the picker — not committed until confirmed/picked.
      userId: preview.uma.userId,
      candidateId: preview.applicant.candidateId,
      umaPicked: false,
      applicantPicked: false,
    };
  }
  return next;
}

export default function AdminCoffeeChatsPage() {
  const [chats, setChats] = useState<CoffeeChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [importStep, setImportStep] = useState<ImportStep>('idle');
  const [csvUploadKey, setCsvUploadKey] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<CoffeeChatColumnMap>({});
  const [previews, setPreviews] = useState<CoffeeChatImportMatchPreview[]>([]);
  const [matchOptions, setMatchOptions] = useState<{
    users: CoffeeChatImportPersonOption[];
    candidates: CoffeeChatImportPersonOption[];
  }>({ users: [], candidates: [] });
  const [resolutions, setResolutions] = useState<Record<number, RowResolutionState>>({});
  const [parseErrors, setParseErrors] = useState<Array<{ rowIndex: number; message: string }>>([]);
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/coffee-chats?view=all');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load coffee chats.');
        return;
      }
      setChats(json.chats ?? []);
    } catch {
      setError('Failed to load coffee chats.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const resetImport = () => {
    setImportStep('idle');
    setHeaders([]);
    setRows([]);
    setColumnMap({});
    setPreviews([]);
    setMatchOptions({ users: [], candidates: [] });
    setResolutions({});
    setParseErrors([]);
    setImportSummary(null);
    setImportError('');
    setCsvUploadKey((key) => key + 1);
  };

  const handleParsed = (result: CsvParseResult) => {
    setImportError('');
    setParseErrors([]);
    setPreviews([]);
    setResolutions({});
    setImportSummary(null);
    setHeaders(result.headers);
    setRows(result.rows);
    setColumnMap(suggestCoffeeChatColumnMap(result.headers));
    setImportStep('map');
  };

  const setFieldHeader = (field: CoffeeChatImportField, value: string) => {
    setColumnMap((prev) => {
      const next = { ...prev };
      if (!value) delete next[field];
      else next[field] = value;
      return next;
    });
  };

  const reviewCounts = useMemo(() => {
    let needReview = 0;
    let confirmed = 0;
    let skipped = 0;
    for (const preview of previews) {
      const res = resolutions[preview.rowIndex] ?? emptyResolution();
      if (res.decision === 'pending') needReview += 1;
      else if (res.decision === 'skipped') skipped += 1;
      else confirmed += 1;
    }
    return { needReview, confirmed, skipped };
  }, [previews, resolutions]);

  const importableCount = useMemo(
    () =>
      previews.filter((preview) => {
        const res = resolutions[preview.rowIndex];
        return res && (res.decision === 'confirmed' || res.decision === 'picked') && res.userId != null;
      }).length,
    [previews, resolutions],
  );

  const canImport = reviewCounts.needReview === 0 && importableCount > 0;

  const updateResolution = (rowIndex: number, patch: Partial<RowResolutionState>) => {
    setResolutions((prev) => ({
      ...prev,
      [rowIndex]: { ...(prev[rowIndex] ?? emptyResolution()), ...patch },
    }));
  };

  const confirmRow = (preview: CoffeeChatImportMatchPreview) => {
    const current = resolutions[preview.rowIndex] ?? emptyResolution();
    const userId = current.userId ?? preview.uma.userId;
    if (userId == null) {
      toast.error('Pick a UMA member before confirming this row.');
      return;
    }
    const suggestedUser = preview.uma.userId;
    const suggestedCandidate = preview.applicant.candidateId;
    const umaPicked = current.umaPicked || (suggestedUser != null && userId !== suggestedUser);
    const candidateId = current.candidateId;
    const applicantPicked =
      current.applicantPicked ||
      (suggestedCandidate != null && candidateId !== suggestedCandidate) ||
      (suggestedCandidate == null && candidateId != null);

    updateResolution(preview.rowIndex, {
      decision: umaPicked || applicantPicked ? 'picked' : 'confirmed',
      userId,
      candidateId,
      umaPicked,
      applicantPicked,
    });
  };

  const skipRow = (rowIndex: number) => {
    updateResolution(rowIndex, { decision: 'skipped' });
  };

  const confirmAllExactEmail = () => {
    setResolutions((prev) => {
      const next = { ...prev };
      for (const preview of previews) {
        if (!preview.exactEmailReady) continue;
        const current = next[preview.rowIndex] ?? emptyResolution();
        if (current.decision !== 'pending') continue;
        if (preview.uma.userId == null) continue;
        // Only commit applicant links that are exact-email; name suggestions stay unlinked.
        const candidateId =
          preview.applicant.confidence === 'exact_email' ? preview.applicant.candidateId : null;
        next[preview.rowIndex] = {
          decision: 'confirmed',
          userId: preview.uma.userId,
          candidateId,
          umaPicked: false,
          applicantPicked: false,
        };
      }
      return next;
    });
  };

  const buildResolutionsPayload = (): CoffeeChatImportResolution[] =>
    previews.map((preview) => {
      const res = resolutions[preview.rowIndex] ?? emptyResolution();
      if (res.decision === 'skipped' || preview.isDuplicate) {
        return {
          rowIndex: preview.rowIndex,
          skip: true,
          userId: null,
          candidateId: null,
        };
      }
      return {
        rowIndex: preview.rowIndex,
        skip: false,
        userId: res.userId,
        // Only send candidateId when confirmed/picked with an explicit link.
        candidateId:
          res.decision === 'confirmed' || res.decision === 'picked' ? res.candidateId : null,
      };
    });

  const runImport = async (dryRun: boolean) => {
    setImportBusy(true);
    setImportError('');
    try {
      const body: Record<string, unknown> = { rows, headers, columnMap, dryRun };
      if (!dryRun) {
        if (reviewCounts.needReview > 0) {
          setImportError('Confirm, pick, or skip every row before importing.');
          setImportBusy(false);
          return;
        }
        body.resolutions = buildResolutionsPayload();
      }

      const res = await fetch('/api/admin/coffee-chats/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setImportError(json.error ?? 'Import failed.');
        if (json.columnMap) setColumnMap(json.columnMap);
        return;
      }

      setPreviews(json.previews ?? []);
      setParseErrors(json.parseErrors ?? json.errors ?? []);
      setImportSummary({
        imported: json.imported ?? 0,
        skipped: json.skipped ?? 0,
        failed: json.failed ?? 0,
      });
      if (json.matchOptions) {
        setMatchOptions({
          users: json.matchOptions.users ?? [],
          candidates: json.matchOptions.candidates ?? [],
        });
      }

      if (dryRun) {
        setResolutions(initResolutionsFromPreviews(json.previews ?? []));
        setImportStep('preview');
        return;
      }

      toast.success(
        `Imported ${json.imported ?? 0} coffee chat${json.imported === 1 ? '' : 's'}` +
          ((json.skipped ?? 0) > 0 ? ` (${json.skipped} skipped)` : ''),
      );
      resetImport();
      await load();
    } catch {
      setImportError('Import failed.');
    } finally {
      setImportBusy(false);
    }
  };

  const exactEmailPendingCount = useMemo(
    () =>
      previews.filter((preview) => {
        if (!preview.exactEmailReady) return false;
        const res = resolutions[preview.rowIndex];
        return !res || res.decision === 'pending';
      }).length,
    [previews, resolutions],
  );

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow={phasePageEyebrow('pre_application')}
        title="Intake Submissions"
        description="Members submit coffee chat notes via Google Form. Export the responses sheet and upload it here to match each note to a UMA member and applicant."
      />

      <PageSection>
        <SpreadsheetUploadPanel
          data-tour="coffee-import"
          title="Upload Google Form responses"
          description="Download the Form responses as CSV or Excel from Google Sheets, then map columns and confirm UMA / applicant matches before importing."
        >
          {importError && <StatusBanner type="error" message={importError} />}

          {importStep === 'idle' && (
            <CsvFileUpload
              key={csvUploadKey}
              onParsed={handleParsed}
              onError={(message) => setImportError(message)}
              dropLabel="Drop your coffee chat responses here"
              ariaLabel="Upload coffee chat Google Form responses"
            />
          )}

          {importStep === 'map' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {rows.length} row{rows.length === 1 ? '' : 's'} loaded. Confirm column mapping —
                Google Form question titles become sheet headers.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {COFFEE_CHAT_IMPORT_FIELDS.map((field) => {
                  const required =
                    field === 'chatDate' ||
                    field === 'applicantName' ||
                    field === 'applicantEmail' ||
                    field === 'applicantGradeLevel' ||
                    field === 'vibes';
                  const submitterPair = field === 'submitterEmail' || field === 'submitterName';
                  return (
                    <div key={field} className="space-y-1.5">
                      <Label htmlFor={`map-${field}`} required={required}>
                        {COFFEE_CHAT_IMPORT_FIELD_LABELS[field]}
                        {submitterPair ? (
                          <span className="font-normal text-muted-foreground"> (email or name)</span>
                        ) : null}
                        {field === 'teamsInterested' ? (
                          <span className="font-normal text-muted-foreground"> (optional)</span>
                        ) : null}
                      </Label>
                      <NativeSelect
                        id={`map-${field}`}
                        value={columnMap[field] ?? ''}
                        onChange={(event) => setFieldHeader(field, event.target.value)}
                      >
                        <option value="">— Not mapped —</option>
                        {headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border/60 pt-5">
                <LoadingButton
                  type="button"
                  loading={importBusy}
                  onClick={() => void runImport(true)}
                  className="uma-cta-primary"
                >
                  Preview matches
                </LoadingButton>
                <Button type="button" variant="outline" onClick={resetImport} disabled={importBusy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {importStep === 'preview' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {reviewCounts.needReview} need review · {reviewCounts.confirmed} confirmed ·{' '}
                {reviewCounts.skipped} skipped
                {importSummary
                  ? ` · ${previews.length} parsed row${previews.length === 1 ? '' : 's'}`
                  : ''}
                .
              </p>

              {parseErrors.length > 0 && (
                <StatusBanner
                  type="error"
                  message={`${parseErrors.length} row${parseErrors.length === 1 ? '' : 's'} could not be parsed. Fix the sheet or mapping and re-upload.`}
                />
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={importBusy || exactEmailPendingCount === 0}
                  onClick={confirmAllExactEmail}
                >
                  Confirm all exact-email matches
                  {exactEmailPendingCount > 0 ? ` (${exactEmailPendingCount})` : ''}
                </Button>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Suggested UMA</TableHead>
                      <TableHead>Suggested applicant</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previews.map((preview) => {
                      const res = resolutions[preview.rowIndex] ?? emptyResolution();
                      const rowTone =
                        res.decision === 'skipped' || preview.isDuplicate
                          ? 'opacity-60'
                          : res.decision === 'pending'
                            ? preview.uma.confidence === 'exact_email' && !preview.isDuplicate
                              ? 'bg-emerald-500/5'
                              : 'bg-amber-500/10'
                            : 'bg-emerald-500/10';

                      const umaSelectOptions = matchOptions.users;
                      const applicantSelectOptions = matchOptions.candidates;

                      return (
                        <TableRow key={preview.rowIndex} className={cn(rowTone)}>
                          <TableCell className="align-top">{preview.rowIndex}</TableCell>
                          <TableCell className="align-top">
                            <div className="font-medium">{preview.applicantName}</div>
                            <div className="text-xs text-muted-foreground">
                              {preview.applicantEmail}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">{preview.chatDate}</div>
                          </TableCell>
                          <TableCell className="align-top min-w-[220px]">
                            <ConfidenceBadge confidence={preview.uma.confidence} />
                            <div className="mt-1 text-xs text-muted-foreground">{preview.uma.detail}</div>
                            {res.decision !== 'skipped' && !preview.isDuplicate && (
                              <NativeSelect
                                className="mt-2"
                                aria-label={`UMA member for row ${preview.rowIndex}`}
                                value={res.userId != null ? String(res.userId) : ''}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  updateResolution(preview.rowIndex, {
                                    userId: value ? Number(value) : null,
                                    umaPicked: true,
                                    decision: 'pending',
                                  });
                                }}
                              >
                                <option value="">— Pick UMA member —</option>
                                {umaSelectOptions.map((user) => (
                                  <option key={user.id} value={user.id}>
                                    {user.name} ({user.email})
                                  </option>
                                ))}
                              </NativeSelect>
                            )}
                          </TableCell>
                          <TableCell className="align-top min-w-[220px]">
                            <ConfidenceBadge confidence={preview.applicant.confidence} />
                            <div className="mt-1 text-xs text-muted-foreground">
                              {preview.applicant.detail}
                            </div>
                            {res.decision !== 'skipped' && !preview.isDuplicate && (
                              <NativeSelect
                                className="mt-2"
                                aria-label={`Applicant for row ${preview.rowIndex}`}
                                value={res.candidateId != null ? String(res.candidateId) : ''}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  updateResolution(preview.rowIndex, {
                                    candidateId: value ? Number(value) : null,
                                    applicantPicked: Boolean(value),
                                    decision: 'pending',
                                  });
                                }}
                              >
                                <option value="">— Leave unlinked —</option>
                                {applicantSelectOptions.map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.name} ({candidate.email})
                                  </option>
                                ))}
                              </NativeSelect>
                            )}
                          </TableCell>
                          <TableCell className="align-top">
                            {preview.isDuplicate ? (
                              <Badge variant="outline">{preview.skipReason ?? 'Duplicate'}</Badge>
                            ) : res.decision === 'skipped' ? (
                              <div className="flex flex-col gap-2">
                                <Badge variant="outline">Skipped</Badge>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    updateResolution(preview.rowIndex, {
                                      decision: 'pending',
                                      userId: preview.uma.userId,
                                      candidateId: preview.applicant.candidateId,
                                      umaPicked: false,
                                      applicantPicked: false,
                                    })
                                  }
                                >
                                  Undo skip
                                </Button>
                              </div>
                            ) : res.decision === 'confirmed' || res.decision === 'picked' ? (
                              <div className="flex flex-col gap-2">
                                <Badge variant="secondary">
                                  {res.decision === 'picked' ? 'Picked' : 'Confirmed'}
                                </Badge>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    updateResolution(preview.rowIndex, { decision: 'pending' })
                                  }
                                >
                                  Change
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => confirmRow(preview)}
                                >
                                  Confirm
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => skipRow(preview.rowIndex)}
                                >
                                  Skip
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border/60 pt-5">
                <LoadingButton
                  type="button"
                  loading={importBusy}
                  disabled={!canImport}
                  onClick={() => void runImport(false)}
                  className="uma-cta-primary"
                  data-tour="coffee-import-confirm"
                >
                  Import {importableCount} note{importableCount === 1 ? '' : 's'}
                </LoadingButton>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setImportStep('map')}
                  disabled={importBusy}
                >
                  Back to mapping
                </Button>
                <Button type="button" variant="ghost" onClick={resetImport} disabled={importBusy}>
                  Cancel
                </Button>
              </div>
              {reviewCounts.needReview > 0 && (
                <p className="text-xs text-muted-foreground">
                  Import stays disabled until every row is confirmed, picked, or skipped.
                </p>
              )}
            </div>
          )}
        </SpreadsheetUploadPanel>
      </PageSection>

      <PageSection>
        <PagePanel className="space-y-4">
          <h2 className="flex items-baseline gap-2.5 font-heading text-lg font-semibold tracking-tight text-foreground">
            Submissions
            <TitleCount>{chats.length}</TitleCount>
          </h2>
          <div className="overflow-hidden">
            {error && <StatusBanner type="error" message={error} />}
            {!hasMounted || loading ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Applicant match</TableHead>
                    <TableHead>Teams</TableHead>
                    <TableHead>UMA member</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 5 }, (_, index) => (
                    <TableRow key={index}>
                      {Array.from({ length: 7 }, (_, cell) => (
                        <TableCell key={cell}>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border/60">
                  <Upload className="size-5" aria-hidden />
                </span>
                <p className="text-sm font-medium text-foreground">No coffee chats imported yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Upload the Google Form responses sheet above to match notes to UMA members and
                  applicants.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Applicant match</TableHead>
                    <TableHead>Teams</TableHead>
                    <TableHead>UMA member</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chats.map((chat) => (
                    <Fragment key={chat.id}>
                      <TableRow>
                        <TableCell>{chat.chat_date}</TableCell>
                        <TableCell className="font-medium">{chat.applicant_name}</TableCell>
                        <TableCell>{chat.applicant_email ?? '-'}</TableCell>
                        <TableCell>
                          <MatchBadge
                            status={chat.applicant_match?.status ?? 'unmatched'}
                            label={
                              chat.applicant_match?.status === 'matched'
                                ? chat.applicant_match.candidateName ?? 'Matched'
                                : 'Pending'
                            }
                          />
                        </TableCell>
                        <TableCell>{formatTeamsInterested(chat.teams_interested)}</TableCell>
                        <TableCell>{chat.submitter_name}</TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setExpandedId((id) => (id === chat.id ? null : chat.id))
                            }
                          >
                            {expandedId === chat.id ? 'Hide' : 'View'}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expandedId === chat.id && (
                        <TableRow key={`${chat.id}-detail`} className="hover:bg-transparent">
                          <TableCell colSpan={7} className="bg-muted/35 p-4">
                            <dl className="grid gap-4 text-sm sm:grid-cols-2">
                              <div>
                                <dt className="text-muted-foreground">Applicant email</dt>
                                <dd className="mt-1 font-medium">{chat.applicant_email ?? '-'}</dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Grade level</dt>
                                <dd className="mt-1 font-medium">
                                  {chat.applicant_grade_level ?? '-'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Teams interested</dt>
                                <dd className="mt-1 font-medium">
                                  {formatTeamsInterested(chat.teams_interested)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Applicant match</dt>
                                <dd className="mt-1 font-medium">
                                  {chat.applicant_match?.detail ?? 'Not matched'}
                                </dd>
                              </div>
                              {(
                                [
                                  ['General Thoughts and Vibes', chat.vibes],
                                  ['Green flags', chat.green_flags],
                                  ['Red flags', chat.red_flags],
                                  ['Other comments', chat.other_comments],
                                  ['Conflict of Interest', chat.conflict_of_interest],
                                ] as const
                              ).map(([label, value]) => (
                                <div key={label} className="sm:col-span-2">
                                  <dt className="text-muted-foreground">{label}</dt>
                                  <dd className="display-field mt-1 whitespace-pre-wrap">
                                    {value?.trim() ? value : '-'}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </PagePanel>
      </PageSection>
    </PageContainer>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: CoffeeChatImportMatchPreview['uma']['confidence'];
}) {
  const label =
    confidence === 'exact_email'
      ? 'Exact email'
      : confidence === 'unique_name'
        ? 'Name suggestion'
        : confidence === 'ambiguous'
          ? 'Ambiguous'
          : 'Unmatched';
  const variant =
    confidence === 'exact_email'
      ? 'secondary'
      : confidence === 'unique_name'
        ? 'outline'
        : 'outline';
  return (
    <Badge variant={variant} className="font-normal">
      {label}
    </Badge>
  );
}

function MatchBadge({
  status,
  label,
}: {
  status: 'matched' | 'unmatched';
  label: string;
}) {
  return (
    <Badge variant={status === 'matched' ? 'secondary' : 'outline'} className="font-normal">
      {label}
    </Badge>
  );
}
