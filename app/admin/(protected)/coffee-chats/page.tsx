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
} from '@/lib/coffee-chat-import';
import type { TeamName } from '@/lib/db';
import { phasePageEyebrow } from '@/lib/stages';

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
    setParseErrors([]);
    setImportSummary(null);
    setImportError('');
    setCsvUploadKey((key) => key + 1);
  };

  const handleParsed = (result: CsvParseResult) => {
    setImportError('');
    setParseErrors([]);
    setPreviews([]);
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

  const importableCount = useMemo(
    () => previews.filter((preview) => preview.willImport).length,
    [previews],
  );

  const runImport = async (dryRun: boolean) => {
    setImportBusy(true);
    setImportError('');
    try {
      const res = await fetch('/api/admin/coffee-chats/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, headers, columnMap, dryRun }),
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

      if (dryRun) {
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
                    field === 'teamsInterested' ||
                    field === 'vibes' ||
                    field === 'submitterEmail';
                  return (
                    <div key={field} className="space-y-1.5">
                      <Label htmlFor={`map-${field}`} required={required && field !== 'submitterEmail'}>
                        {COFFEE_CHAT_IMPORT_FIELD_LABELS[field]}
                        {field === 'submitterEmail' || field === 'submitterName' ? (
                          <span className="font-normal text-muted-foreground"> (email or name)</span>
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
              {importSummary && (
                <p className="text-sm text-muted-foreground">
                  Ready to import {importableCount} of {previews.length} parsed row
                  {previews.length === 1 ? '' : 's'}
                  {importSummary.skipped > 0 ? ` · ${importSummary.skipped} will be skipped` : ''}
                  {importSummary.failed > 0 ? ` · ${importSummary.failed} failed checks` : ''}.
                </p>
              )}

              {parseErrors.length > 0 && (
                <StatusBanner
                  type="error"
                  message={`${parseErrors.length} row${parseErrors.length === 1 ? '' : 's'} could not be parsed. Fix the sheet or mapping and re-upload.`}
                />
              )}

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead>UMA member</TableHead>
                      <TableHead>Applicant match</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previews.map((preview) => (
                      <TableRow key={preview.rowIndex}>
                        <TableCell>{preview.rowIndex}</TableCell>
                        <TableCell>
                          <div className="font-medium">{preview.applicantName}</div>
                          <div className="text-xs text-muted-foreground">{preview.applicantEmail}</div>
                        </TableCell>
                        <TableCell>
                          <MatchBadge
                            status={preview.uma.status === 'matched' ? 'matched' : 'unmatched'}
                            label={
                              preview.uma.userName ??
                              preview.submitterEmail ??
                              preview.submitterName ??
                              '—'
                            }
                          />
                          <div className="mt-1 text-xs text-muted-foreground">{preview.uma.detail}</div>
                        </TableCell>
                        <TableCell>
                          <MatchBadge
                            status={preview.applicant.status}
                            label={preview.applicant.candidateName ?? 'Pending applications'}
                          />
                          <div className="mt-1 text-xs text-muted-foreground">
                            {preview.applicant.detail}
                          </div>
                        </TableCell>
                        <TableCell>
                          {preview.willImport ? (
                            <Badge variant="secondary">Will import</Badge>
                          ) : (
                            <Badge variant="outline">{preview.skipReason ?? 'Skip'}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border/60 pt-5">
                <LoadingButton
                  type="button"
                  loading={importBusy}
                  disabled={importableCount === 0}
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
