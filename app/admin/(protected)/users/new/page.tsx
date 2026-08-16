'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import StatusBanner from '@/components/status-banner';
import PageLoading from '@/components/page-loading';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PickerDropdown, MultiPickerDropdown } from '@/components/picker-dropdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import TeamAccessPicker from '@/components/team-access-picker';
import { USER_UI_ROLE_OPTIONS } from '@/lib/user-ui-role-options';
import {
  parseBulkPasteRows,
  validateBulkPasteRows,
  type BulkPasteParsedRow,
  type BulkPasteSourceRow} from '@/lib/user-bulk-paste';
import {
  handleBulkRowEnterKeyDown,
  handleSingleLineEnterKeyDown,
} from '@/lib/form-keyboard';
import { cn } from '@/lib/utils';

interface Team {
  id: number;
  name: string;
  isDirector?: boolean;
}

interface UserRow {
  id: number;
  teams: Team[];
}

type UiRole = 'admin' | 'exec' | 'director';
type AddMode = 'single' | 'bulk';

interface BulkCreateResultRow {
  rowNumber: number;
  success: boolean;
  error?: string;
}

function UserFormBody({
  idPrefix,
  name,
  setName,
  email,
  setEmail,
  role,
  onRoleChange,
  teams,
  selectedTeamIds,
  directorTeamIds,
  onToggleTeam,
  onToggleDirector,
}: {
  idPrefix: string;
  name: string;
  setName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  role: UiRole;
  onRoleChange: (role: UiRole) => void;
  teams: Team[];
  selectedTeamIds: Set<number>;
  directorTeamIds: Set<number>;
  onToggleTeam: (teamId: number) => void;
  onToggleDirector: (teamId: number) => void;
}) {
  return (
    <FieldGroup className="gap-6">
      <FieldSet className="gap-4">
        <FieldLegend variant="label" className="select-text">Account</FieldLegend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-name`} className="select-text" required>
              Full name
            </FieldLabel>
            <Input
              id={`${idPrefix}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) =>
                handleSingleLineEnterKeyDown(e, document.getElementById(`${idPrefix}-email`))
              }
              placeholder="Alex Chen"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-email`} className="select-text" required>
              Berkeley email
            </FieldLabel>
            <Input
              id={`${idPrefix}-email`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) =>
                handleSingleLineEnterKeyDown(e, document.getElementById(`${idPrefix}-role`))
              }
              placeholder="alex@berkeley.edu"
              required
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-role`} className="select-text" required>
            Role
          </FieldLabel>
          <PickerDropdown
            id={`${idPrefix}-role`}
            value={role}
            onChange={(next) => next && onRoleChange(next)}
            options={USER_UI_ROLE_OPTIONS}
            placeholder="Select role"
          />
        </Field>
      </FieldSet>

      {(role === 'exec' || role === 'director') && (
        <FieldSet className="gap-4">
          <FieldLegend variant="label" className="select-text">Team access</FieldLegend>
          <TeamAccessPicker
            teams={teams}
            selectedTeamIds={selectedTeamIds}
            directorTeamIds={directorTeamIds}
            role={role}
            onToggleTeam={onToggleTeam}
            onToggleDirector={onToggleDirector}
          />
        </FieldSet>
      )}
    </FieldGroup>
  );
}

function BulkGridCellWrap({ children }: { children: React.ReactNode }) {
  return <div className="flex h-9 w-full items-center">{children}</div>;
}

export default function AdminNewUserPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);

  const [addMode, setAddMode] = useState<AddMode>('single');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UiRole>('exec');
  const [bulkDefaultRole, setBulkDefaultRole] = useState<UiRole>('exec');
  const [selectedTeams, setSelectedTeams] = useState<Set<number>>(new Set());
  const [directorTeams, setDirectorTeams] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [bulkPaste, setBulkPaste] = useState('');
  const [bulkParsedSources, setBulkParsedSources] = useState<BulkPasteSourceRow[]>([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResults, setBulkResults] = useState<Map<number, BulkCreateResultRow>>(new Map());
  const [bulkSummary, setBulkSummary] = useState('');
  const [selectedBulkRows, setSelectedBulkRows] = useState<Set<number>>(new Set());
  const [bulkApplyTeamIds, setBulkApplyTeamIds] = useState<Set<number>>(new Set());

  const existingDirectorCountByTeamId = useMemo(() => {
    const countByTeamId: Record<number, number> = {};
    for (const user of users) {
      for (const team of user.teams) {
        if (!team.isDirector) continue;
        countByTeamId[team.id] = (countByTeamId[team.id] ?? 0) + 1;
      }
    }
    return countByTeamId;
  }, [users]);

  const bulkRows = useMemo<BulkPasteParsedRow[]>(
    () => validateBulkPasteRows(bulkParsedSources, teams, existingDirectorCountByTeamId),
    [bulkParsedSources, teams, existingDirectorCountByTeamId],
  );

  const validBulkRows = useMemo(
    () => bulkRows.filter((row) => row.errors.length === 0 && row.prepared),
    [bulkRows],
  );

  const fetchContext = useCallback(async () => {
    const res = await fetch('/api/admin/users');
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Failed to load teams');
      setLoading(false);
      return;
    }
    setTeams(json.teams ?? []);
    setUsers(json.users ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  useEffect(() => {
    const parsedRows = parseBulkPasteRows(bulkPaste, teams, existingDirectorCountByTeamId, bulkDefaultRole);
    setBulkParsedSources(parsedRows.map((row) => row.source));
    setBulkResults(new Map());
    setBulkSummary('');
  }, [bulkPaste, teams, existingDirectorCountByTeamId, bulkDefaultRole]);

  useEffect(() => {
    setSelectedBulkRows((prev) => {
      if (prev.size === 0) return prev;
      const validRowNumbers = new Set(bulkRows.map((row) => row.rowNumber));
      const next = new Set<number>();
      prev.forEach((rowNumber) => {
        if (validRowNumbers.has(rowNumber)) {
          next.add(rowNumber);
        }
      });
      return next;
    });
  }, [bulkRows]);

  const updateBulkRow = useCallback(
    (rowNumber: number, updater: (source: BulkPasteSourceRow) => BulkPasteSourceRow) => {
      setBulkParsedSources((prev) =>
        prev.map((source, index) => (index + 1 === rowNumber ? updater(source) : source)),
      );
      setBulkResults(new Map());
      setBulkSummary('');
    },
    [],
  );

  const toggleBulkRowSelection = useCallback((rowNumber: number) => {
    setSelectedBulkRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) {
        next.delete(rowNumber);
      } else {
        next.add(rowNumber);
      }
      return next;
    });
  }, []);

  const toggleSelectAllBulkRows = useCallback(() => {
    setSelectedBulkRows((prev) => {
      const allRowNumbers = bulkRows.map((row) => row.rowNumber);
      if (allRowNumbers.length > 0 && prev.size === allRowNumbers.length) {
        return new Set();
      }
      return new Set(allRowNumbers);
    });
  }, [bulkRows]);

  const toggleBulkApplyTeam = useCallback((teamId: number) => {
    setBulkApplyTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  }, []);

  const applyTeamsToSelectedRows = useCallback(() => {
    if (selectedBulkRows.size === 0) {
      setBulkSummary('Select at least one row to apply teams.');
      return;
    }

    const nextTeamIds = Array.from(bulkApplyTeamIds);
    setBulkParsedSources((prev) =>
      prev.map((source, index) => {
        const rowNumber = index + 1;
        if (!selectedBulkRows.has(rowNumber)) return source;
        if (source.role === 'admin') {
          return { ...source, teamIds: [], invalidTeamNames: [] };
        }
        return { ...source, teamIds: nextTeamIds, invalidTeamNames: [] };
      }),
    );
    setBulkResults(new Map());
    setBulkSummary(`Applied ${nextTeamIds.length} team${nextTeamIds.length === 1 ? '' : 's'} to ${selectedBulkRows.size} row${selectedBulkRows.size === 1 ? '' : 's'}.`);
    setSelectedBulkRows(new Set());
    setBulkApplyTeamIds(new Set());
  }, [bulkApplyTeamIds, selectedBulkRows]);

  const toggleTeam = (teamId: number) => {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
        setDirectorTeams((d) => {
          const nd = new Set(d);
          nd.delete(teamId);
          return nd;
        });
      } else {
        next.add(teamId);
        if (role === 'director') {
          setDirectorTeams((d) => new Set(d).add(teamId));
        }
      }
      return next;
    });
  };

  const toggleDirectorTeam = (teamId: number) => {
    setDirectorTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const handleRoleChange = (nextRole: UiRole) => {
    setRole(nextRole);
    if (nextRole === 'director') {
      setDirectorTeams(new Set(selectedTeams));
    } else if (nextRole === 'admin') {
      setSelectedTeams(new Set());
      setDirectorTeams(new Set());
    }
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          role: role === 'admin' ? 'admin' : 'exec',
          teamIds: role === 'admin' ? [] : Array.from(selectedTeams),
          directorTeamIds:
            role === 'admin'
              ? []
              : role === 'director'
                ? Array.from(selectedTeams)
                : Array.from(directorTeams)})});
      const json = await res.json();
      if (!res.ok) {
        const message = json.error ?? 'Failed to add user';
        setFormError(message);
        toast.error(message);
        return;
      }

      toast.success(`${json.user.name} added`);
      router.push('/admin/users');
      router.refresh();
    } catch {
      setFormError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkSubmit = async () => {
    const rowsToSubmit = validBulkRows.reduce<
      Array<{
        rowNumber: number;
        name: string;
        email: string;
        role: 'admin' | 'exec';
        teamIds: number[];
        directorTeamIds: number[];
      }>
    >((acc, row) => {
      if (!row.prepared) return acc;
      acc.push({ rowNumber: row.rowNumber, ...row.prepared });
      return acc;
    }, []);

    if (rowsToSubmit.length === 0) {
      setBulkSummary('No valid rows to create yet.');
      return;
    }

    setBulkSubmitting(true);
    try {
      const res = await fetch('/api/admin/users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsToSubmit })});
      const json = await res.json();
      if (!res.ok) {
        const message = json.error ?? 'Bulk create failed.';
        setBulkSummary(message);
        toast.error(message);
        return;
      }

      const resultMap = new Map<number, BulkCreateResultRow>();
      for (const result of (json.results ?? []) as BulkCreateResultRow[]) {
        resultMap.set(result.rowNumber, result);
      }

      const createdCount = Number(json.createdCount ?? 0);
      const failedCount = Number(json.failedCount ?? 0);
      setBulkSummary(
        failedCount > 0
          ? `Created ${createdCount}. ${failedCount} failed.`
          : `Created ${createdCount} ${createdCount === 1 ? 'User' : 'Users'}`,
      );
      if (createdCount > 0) {
        toast.success(`Created ${createdCount} ${createdCount === 1 ? 'User' : 'Users'}`);
        const createdRowNumbers = new Set(
          (json.results ?? [])
            .filter((result: BulkCreateResultRow) => result.success)
            .map((result: BulkCreateResultRow) => result.rowNumber),
        );
        setSelectedBulkRows(new Set());
        setBulkApplyTeamIds(new Set());
        setBulkParsedSources((prev) => {
          if (createdRowNumbers.size === 0) return prev;
          return prev.filter((_, index) => !createdRowNumbers.has(index + 1));
        });
        setBulkResults(() => {
          if (createdRowNumbers.size === 0) return resultMap;
          const next = new Map<number, BulkCreateResultRow>();
          let nextRowNumber = 1;
          for (let oldRowNumber = 1; oldRowNumber <= bulkParsedSources.length; oldRowNumber += 1) {
            if (createdRowNumbers.has(oldRowNumber)) continue;
            const oldResult = resultMap.get(oldRowNumber);
            if (oldResult) {
              next.set(nextRowNumber, { ...oldResult, rowNumber: nextRowNumber });
            }
            nextRowNumber += 1;
          }
          return next;
        });
        await fetchContext();
      } else {
        setBulkResults(resultMap);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} rows failed.`);
      }
      if (failedCount === 0 && createdCount > 0) {
        router.push('/admin/users');
        router.refresh();
      }
    } catch {
      setBulkSummary('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setBulkSubmitting(false);
    }
  };

  if (loading) {
    return <PageLoading />;
  }

  return (
    <PageContainer size="full" className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Add users"
        actions={
          <Button variant="outline" onClick={() => router.push('/admin/users')}>
            <ArrowLeftIcon className="size-4" />
            Back to Users
          </Button>
        }
      />

      {error && <StatusBanner message={error} type="error" />}

      <PageSection>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="select-text">Choose input mode</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 p-0">
            <Tabs value={addMode} onValueChange={(value) => setAddMode(value as AddMode)} className="min-h-0">
              <div className="px-6 py-4">
                <TabsList>
                  <TabsTrigger value="single">Single</TabsTrigger>
                  <TabsTrigger value="bulk">Bulk paste</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="single" className="m-0">
                <form onSubmit={handleSingleSubmit} className="space-y-6 p-6">
                  <UserFormBody
                    idPrefix="add-page"
                    name={name}
                    setName={setName}
                    email={email}
                    setEmail={setEmail}
                    role={role}
                    onRoleChange={handleRoleChange}
                    teams={teams}
                    selectedTeamIds={selectedTeams}
                    directorTeamIds={directorTeams}
                    onToggleTeam={toggleTeam}
                    onToggleDirector={toggleDirectorTeam}
                  />
                  {formError && <StatusBanner message={formError} type="error" />}
                  <div className="sticky bottom-0 flex items-center justify-end gap-2 bg-background/95 pt-4 backdrop-blur">
                    <Button type="button" variant="outline" onClick={() => router.push('/admin/users')}>
                      Cancel
                    </Button>
                    <LoadingButton type="submit" loading={submitting}>
                      Add user
                    </LoadingButton>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="bulk" className="m-0">
                <div className="min-w-0">
                  <div className="space-y-4 p-6">
                    <p className="select-text text-sm text-muted-foreground">
                      Paste rows from Google Sheets or Excel. CSV and TSV are both accepted.
                    </p>
                    <pre className="display-field select-text overflow-x-auto p-3 text-xs text-muted-foreground">
{`Full name\tBerkeley email\tRole\tTeams
Alex Chen\talex@berkeley.edu\tExec\tStrategy,Events`}
                    </pre>
                    <textarea
                      value={bulkPaste}
                      onChange={(e) => setBulkPaste(e.target.value)}
                      rows={8}
                      placeholder="Paste spreadsheet rows here..."
                      className="w-full rounded-lg bg-muted/30 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <p className="select-text text-sm text-muted-foreground">You can paste: First Name, Last Name, Berkeley email</p>
                    <Field className="w-44">
                      <FieldLabel htmlFor="bulk-default-role" className="select-text">Default role</FieldLabel>
                      <PickerDropdown
                        id="bulk-default-role"
                        value={bulkDefaultRole}
                        onChange={(next) => next && setBulkDefaultRole(next)}
                        options={USER_UI_ROLE_OPTIONS}
                        placeholder="Select role"
                        className="w-44"
                      />
                    </Field>
                  </div>

                  <div className="min-w-0">
                    <div className="bg-muted/20 px-6 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-2">
                          <p className="select-text text-sm font-medium">Apply teams to selected rows</p>
                          <p className="select-text text-sm text-muted-foreground">
                            Pick teams once, then apply to selected rows.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {teams.map((team) => {
                              const isSelected = bulkApplyTeamIds.has(team.id);
                              return (
                                <button
                                  key={team.id}
                                  type="button"
                                  onClick={() => toggleBulkApplyTeam(team.id)}
                                  className={cn(
                                    'rounded-full border px-3 py-1.5 text-sm transition-colors',
                                    isSelected
                                      ? 'border-primary bg-primary/10 text-primary'
                                      : 'border-border bg-background hover:bg-muted',
                                  )}
                                >
                                  {team.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="select-text text-sm text-muted-foreground">
                            {selectedBulkRows.size} selected
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setBulkApplyTeamIds(new Set())}
                          >
                            Clear teams
                          </Button>
                          <Button type="button" onClick={applyTeamsToSelectedRows}>
                            Apply
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="h-[calc(100vh-31rem)] min-h-[20rem] w-full overflow-x-auto overflow-y-auto">
                    <Table className="min-w-[74rem]">
                      <TableHeader className="sticky top-0 z-10 bg-background">
                        <TableRow>
                          <TableHead className="w-12 pl-4">
                            <Checkbox
                              checked={bulkRows.length > 0 && selectedBulkRows.size === bulkRows.length}
                              onCheckedChange={toggleSelectAllBulkRows}
                              aria-label="Select all rows"
                            />
                          </TableHead>
                          <TableHead>Row</TableHead>
                          <TableHead>Full name</TableHead>
                          <TableHead>Berkeley email</TableHead>
                          <TableHead className="min-w-[8rem] w-32 max-w-[8rem]">Role</TableHead>
                          <TableHead className="min-w-[15rem] w-[15rem] max-w-[15rem]">Teams</TableHead>
                          <TableHead className="min-w-[18rem] w-full">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bulkRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="select-text text-sm text-muted-foreground">
                              Paste rows to preview validation.
                            </TableCell>
                          </TableRow>
                        ) : (
                          bulkRows.map((row) => {
                            const createResult = bulkResults.get(row.rowNumber);
                            const statusText =
                              createResult?.success
                                ? 'Created'
                                : createResult?.error
                                  ? createResult.error
                                  : row.errors.length > 0
                                    ? row.errors.join(' ')
                                    : 'Ready';
                            return (
                              <TableRow key={row.rowNumber}>
                                <TableCell className="pl-4">
                                  <Checkbox
                                    checked={selectedBulkRows.has(row.rowNumber)}
                                    onCheckedChange={() => toggleBulkRowSelection(row.rowNumber)}
                                    aria-label={`Select row ${row.rowNumber}`}
                                  />
                                </TableCell>
                                <TableCell>{row.rowNumber}</TableCell>
                                <TableCell className="min-w-[14rem]">
                                  <Input
                                    value={row.source.fullName}
                                    data-bulk-row={row.rowNumber}
                                    data-bulk-field="name"
                                    onChange={(e) =>
                                      updateBulkRow(row.rowNumber, (source) => ({ ...source, fullName: e.target.value }))
                                    }
                                    onKeyDown={(e) => handleBulkRowEnterKeyDown(e, row.rowNumber, 'name')}
                                    placeholder="Full name"
                                  />
                                </TableCell>
                                <TableCell className="min-w-[16rem]">
                                  <Input
                                    value={row.source.berkeleyEmail}
                                    data-bulk-row={row.rowNumber}
                                    data-bulk-field="email"
                                    onChange={(e) =>
                                      updateBulkRow(row.rowNumber, (source) => ({
                                        ...source,
                                        berkeleyEmail: e.target.value}))
                                    }
                                    onKeyDown={(e) => handleBulkRowEnterKeyDown(e, row.rowNumber, 'email')}
                                    placeholder="name@berkeley.edu"
                                  />
                                </TableCell>
                                <TableCell className="min-w-[8rem] w-32 max-w-[8rem] overflow-hidden">
                                  <BulkGridCellWrap>
                                    <PickerDropdown
                                      id={`bulk-row-${row.rowNumber}-role`}
                                      value={row.normalizedRole}
                                      onChange={(nextRole) => {
                                        updateBulkRow(row.rowNumber, (source) => {
                                          if (!nextRole) {
                                            return { ...source, role: '', teamIds: [], invalidTeamNames: [] };
                                          }
                                          if (nextRole === 'admin') {
                                            return { ...source, role: nextRole, teamIds: [], invalidTeamNames: [] };
                                          }
                                          return { ...source, role: nextRole };
                                        });
                                      }}
                                      options={USER_UI_ROLE_OPTIONS}
                                      placeholder="Select role"
                                      allowClear
                                      clearLabel="Select role"
                                    />
                                  </BulkGridCellWrap>
                                </TableCell>
                                <TableCell className="min-w-[15rem] w-[15rem] max-w-[15rem] overflow-hidden">
                                  <BulkGridCellWrap>
                                    <MultiPickerDropdown
                                      options={teams.map((team) => ({
                                        value: team.id,
                                        label: team.name}))}
                                      selectedValues={row.source.teamIds}
                                      onToggleValue={(teamId) =>
                                        updateBulkRow(row.rowNumber, (source) => {
                                          const nextTeamIds = new Set(source.teamIds);
                                          if (nextTeamIds.has(teamId)) {
                                            nextTeamIds.delete(teamId);
                                          } else {
                                            nextTeamIds.add(teamId);
                                          }
                                          return {
                                            ...source,
                                            teamIds: Array.from(nextTeamIds),
                                            invalidTeamNames: []};
                                        })
                                      }
                                      disabled={row.normalizedRole === 'admin'}
                                      disabledLabel="Not needed for Admin"
                                      placeholder="No teams"
                                    />
                                  </BulkGridCellWrap>
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    'min-w-[18rem] w-full whitespace-normal break-words text-sm',
                                    createResult?.success
                                      ? 'text-emerald-700'
                                      : createResult?.error || row.errors.length > 0
                                        ? 'text-destructive'
                                        : 'text-muted-foreground',
                                  )}
                                >
                                  {statusText}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                    </div>
                  </div>

                  <div className="sticky bottom-0 left-0 right-0 z-20 flex w-full min-w-0 flex-wrap items-center justify-between gap-3 bg-background/95 px-6 py-4 backdrop-blur">
                    <div className="select-text text-sm text-muted-foreground">
                      {bulkRows.length} parsed rows · {validBulkRows.length} ready to create
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" onClick={() => router.push('/admin/users')}>
                        Cancel
                      </Button>
                      <LoadingButton
                        type="button"
                        loading={bulkSubmitting}
                        disabled={validBulkRows.length === 0}
                        onClick={handleBulkSubmit}
                      >
                        Create {validBulkRows.length} {validBulkRows.length === 1 ? 'User' : 'Users'}
                      </LoadingButton>
                    </div>
                  </div>
                  {bulkSummary ? (
                    <div className="px-6 pb-6 pt-4">
                      <StatusBanner
                        message={bulkSummary}
                        type={bulkSummary.toLowerCase().includes('failed') ? 'error' : 'success'}
                      />
                    </div>
                  ) : null}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </PageSection>
    </PageContainer>
  );
}
