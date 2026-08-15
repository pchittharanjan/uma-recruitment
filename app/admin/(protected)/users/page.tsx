'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserRoundIcon,
} from 'lucide-react';
import { DestructiveConfirmDialog } from '@/components/destructive-confirm-dialog';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import StageBadge from '@/components/stage-badge';
import StatusBanner from '@/components/status-banner';
import PageLoading from '@/components/page-loading';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PickerDropdown } from '@/components/picker-dropdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Field,
  FieldDescription,
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
import { parseBulkPasteRows, type BulkPasteParsedRow } from '@/lib/user-bulk-paste';
import { handleSingleLineEnterKeyDown } from '@/lib/form-keyboard';
import { cn } from '@/lib/utils';

interface Team {
  id: number;
  name: string;
  isDirector?: boolean;
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  teams: Team[];
}

type UiRole = 'admin' | 'exec' | 'director';
type AddMode = 'single' | 'bulk';

interface BulkCreateResultRow {
  rowNumber: number;
  success: boolean;
  error?: string;
}

function teamAccessHelper(role: 'exec' | 'director'): string | null {
  return role === 'director' ? null : 'Select team(s). Optionally mark Director.';
}

function displayRole(user: UserRow): string {
  if (user.role === 'admin') return 'Admin';
  if (user.teams.some((t) => t.isDirector)) return 'Director';
  return 'Exec';
}

function uiRoleFromUser(user: UserRow): UiRole {
  if (user.role === 'admin') return 'admin';
  if (user.teams.length > 0 && user.teams.every((t) => t.isDirector)) return 'director';
  return 'exec';
}

function directorTeamIdsFromTeams(teams: Team[]): number[] {
  return teams.filter((t) => t.isDirector).map((t) => t.id);
}

type SortKey = 'name' | 'email' | 'role' | 'teams';
type SortDir = 'asc' | 'desc';

function teamsSortLabel(user: UserRow): string {
  if (user.role === 'admin') return 'All teams';
  if (user.teams.length === 0) return '';
  return user.teams.map((t) => t.name).join(', ');
}

function firstNameToken(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

function compareUsers(a: UserRow, b: UserRow, key: SortKey, dir: SortDir): number {
  let cmp = 0;
  switch (key) {
    case 'name':
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      break;
    case 'email':
      cmp = a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
      break;
    case 'role': {
      cmp = displayRole(a).localeCompare(displayRole(b), undefined, { sensitivity: 'base' });
      if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
      // Secondary: always A→Z by first name within each role group
      const byFirst = firstNameToken(a.name).localeCompare(firstNameToken(b.name), undefined, {
        sensitivity: 'base',
      });
      if (byFirst !== 0) return byFirst;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    }
    case 'teams':
      cmp = teamsSortLabel(a).localeCompare(teamsSortLabel(b), undefined, { sensitivity: 'base' });
      break;
  }
  return dir === 'asc' ? cmp : -cmp;
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <TableHead
      className={cn('h-11 px-4 py-2 align-middle text-left font-medium text-muted-foreground', className)}
    >
      <div className="flex h-full items-center">
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className="inline-flex h-full items-center gap-1 leading-tight hover:text-foreground"
        >
          {label}
          {active ? (
            dir === 'asc' ? (
              <ArrowUpIcon className="size-3.5" />
            ) : (
              <ArrowDownIcon className="size-3.5" />
            )
          ) : (
            <ChevronsUpDownIcon className="size-3.5 opacity-40" />
          )}
        </button>
      </div>
    </TableHead>
  );
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
        <FieldLegend variant="label">Account</FieldLegend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-name`} required>
              Full name
            </FieldLabel>
            <Input
              id={`${idPrefix}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) =>
                handleSingleLineEnterKeyDown(e, document.getElementById(`${idPrefix}-email`))
              }
              placeholder={idPrefix === 'add' ? 'Alex Chen' : undefined}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-email`} required>
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
              placeholder={idPrefix === 'add' ? 'alex@berkeley.edu' : undefined}
              required
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-role`} required>
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
          <div>
            <FieldLegend variant="label">Team access</FieldLegend>
            {teamAccessHelper(role) ? <FieldDescription>{teamAccessHelper(role)}</FieldDescription> : null}
          </div>
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

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [addOpen, setAddOpen] = useState(false);
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
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResults, setBulkResults] = useState<Map<number, BulkCreateResultRow>>(new Map());
  const [bulkSummary, setBulkSummary] = useState('');

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UiRole>('exec');
  const [editTeams, setEditTeams] = useState<Set<number>>(new Set());
  const [editDirectorTeams, setEditDirectorTeams] = useState<Set<number>>(new Set());
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<number | null>(null);
  const [editError, setEditError] = useState('');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [removingUser, setRemovingUser] = useState<UserRow | null>(null);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => compareUsers(a, b, sortKey, sortDir)),
    [users, sortKey, sortDir],
  );

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
    () => parseBulkPasteRows(bulkPaste, teams, existingDirectorCountByTeamId, bulkDefaultRole),
    [bulkPaste, teams, existingDirectorCountByTeamId, bulkDefaultRole],
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const validBulkRows = useMemo(
    () => bulkRows.filter((row) => row.errors.length === 0 && row.prepared),
    [bulkRows],
  );

  const resetAddForm = () => {
    setAddMode('single');
    setName('');
    setEmail('');
    setRole('exec');
    setBulkDefaultRole('exec');
    setSelectedTeams(new Set());
    setDirectorTeams(new Set());
    setFormError('');
    setBulkPaste('');
    setBulkSubmitting(false);
    setBulkResults(new Map());
    setBulkSummary('');
  };

  const fetchUsers = useCallback(async () => {
    const res = await fetch('/api/admin/users');
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Failed to load users');
      return;
    }
    setUsers(json.users);
    setTeams(json.teams);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.user?.id) setCurrentUserId(json.user.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setBulkResults(new Map());
    setBulkSummary('');
  }, [bulkPaste]);

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

  const openEdit = (user: UserRow) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(uiRoleFromUser(user));
    setEditTeams(new Set(user.teams.map((t) => t.id)));
    setEditDirectorTeams(new Set(directorTeamIdsFromTeams(user.teams)));
    setEditError('');
  };

  const toggleEditTeam = (teamId: number) => {
    setEditTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
        setEditDirectorTeams((d) => {
          const nd = new Set(d);
          nd.delete(teamId);
          return nd;
        });
      } else {
        next.add(teamId);
        if (editRole === 'director') {
          setEditDirectorTeams((d) => new Set(d).add(teamId));
        }
      }
      return next;
    });
  };

  const toggleEditDirectorTeam = (teamId: number) => {
    setEditDirectorTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const handleEditRoleChange = (nextRole: UiRole) => {
    setEditRole(nextRole);
    if (nextRole === 'director') {
      setEditDirectorTeams(new Set(editTeams));
    } else if (nextRole === 'admin') {
      setEditTeams(new Set());
      setEditDirectorTeams(new Set());
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError('');
    setEditSubmitting(true);

    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          email: editEmail,
          role: editRole === 'admin' ? 'admin' : 'exec',
          teamIds: editRole === 'admin' ? [] : Array.from(editTeams),
          directorTeamIds:
            editRole === 'admin'
              ? []
              : editRole === 'director'
                ? Array.from(editTeams)
                : Array.from(editDirectorTeams),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error ?? 'Failed to update user';
        setEditError(message);
        toast.error(message);
        return;
      }
      setEditingUser(null);
      toast.success('User updated');
      await fetchUsers();
    } catch {
      setEditError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (!removingUser) return;

    try {
      const res = await fetch(`/api/admin/users/${removingUser.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error ?? 'Failed to remove user';
        toast.error(message);
        throw new Error(message);
      }
      toast.success(`${removingUser.name} removed`);
      setRemovingUser(null);
      await fetchUsers();
    } catch (e) {
      if (e instanceof Error && e.message) return;
      toast.error('Network error. Please try again.');
      throw e;
    }
  };

  const handleTestAs = async (user: UserRow) => {
    setImpersonatingId(user.id);
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to start test mode.');
        return;
      }
      router.push('/team');
      router.refresh();
    } catch {
      setError('Failed to start test mode.');
    } finally {
      setImpersonatingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
                : Array.from(directorTeams),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error ?? 'Failed to add user';
        setFormError(message);
        toast.error(message);
        return;
      }

      toast.success(`${json.user.name} added`);
      setAddOpen(false);
      resetAddForm();
      await fetchUsers();
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
        body: JSON.stringify({ rows: rowsToSubmit }),
      });
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
      setBulkResults(resultMap);

      const createdCount = Number(json.createdCount ?? 0);
      const failedCount = Number(json.failedCount ?? 0);
      setBulkSummary(`Created ${createdCount}. ${failedCount} failed.`);
      if (createdCount > 0) {
        toast.success(`Created ${createdCount} people.`);
        await fetchUsers();
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} rows failed.`);
      }
      if (failedCount === 0 && createdCount > 0) {
        setAddOpen(false);
        resetAddForm();
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
    <PageContainer size="wide" className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="Add Admin and Exec users so they can sign in."
        actions={
          <Button onClick={() => router.push('/admin/users/new')}>
            <PlusIcon className="size-4" />
            Add users
          </Button>
        }
      />

      {error && <StatusBanner message={error} type="error" />}

      <PageSection>
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>Everyone ({users.length})</CardTitle>
            <CardDescription>People who can sign in to the platform.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {users.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No users yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="h-11 border-b border-border/60 bg-muted/40 hover:bg-muted/40">
                    <SortableHeader
                      label="Name"
                      sortKey="name"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Email"
                      sortKey="email"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Role"
                      sortKey="role"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Teams"
                      sortKey="teams"
                      activeKey={sortKey}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <TableHead className="h-11 px-4 py-2 align-middle text-right font-medium text-muted-foreground">
                      <div className="flex h-full w-full items-center justify-end leading-tight">Actions</div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUsers.map((user) => (
                    <TableRow key={user.id} className="h-12 border-b border-border/60 hover:bg-muted/20">
                      <TableCell className="px-4 py-2 align-middle font-medium">
                        <div className="flex h-full items-center leading-tight">{user.name}</div>
                      </TableCell>
                      <TableCell className="px-4 py-2 align-middle text-muted-foreground">
                        <div className="flex h-full items-center leading-tight">{user.email}</div>
                      </TableCell>
                      <TableCell className="px-4 py-2 align-middle">
                        <div className="flex h-full items-center">
                          <StageBadge
                            label={displayRole(user)}
                            color={
                              user.role === 'admin'
                                ? 'blue'
                                : user.teams.some((t) => t.isDirector)
                                  ? 'orange'
                                  : 'green'
                            }
                          />
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2 align-middle">
                        <div className="flex h-full items-center">
                          {user.role === 'admin' ? (
                            <span className="inline-flex items-center leading-tight text-muted-foreground">
                              All teams
                            </span>
                          ) : user.teams.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1 leading-tight">
                              {user.teams.map((t) => (
                                <StageBadge
                                  key={t.id}
                                  label={t.isDirector ? `${t.name} · Director` : t.name}
                                  color={t.isDirector ? 'orange' : 'gray'}
                                />
                              ))}
                            </div>
                          ) : (
                            <span className="inline-flex items-center leading-tight text-amber-600">
                              No Teams assigned
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2 align-middle text-right">
                        <div className="flex h-full w-full items-center justify-end gap-1">
                          {(user.role === 'exec' || user.role === 'ad_hoc_exec') && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="leading-none"
                              disabled={impersonatingId === user.id}
                              onClick={() => handleTestAs(user)}
                            >
                              <UserRoundIcon className="size-3.5" />
                              Test as
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="leading-none"
                            onClick={() => openEdit(user)}
                          >
                            <PencilIcon className="size-3.5" />
                            Edit
                          </Button>
                          {currentUserId !== user.id && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="leading-none text-destructive hover:text-destructive"
                              onClick={() => setRemovingUser(user)}
                            >
                              <Trash2Icon className="size-3.5" />
                              Remove
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </PageSection>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) resetAddForm();
        }}
      >
        <DialogContent className="flex max-h-[95vh] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Add someone</DialogTitle>
            <DialogDescription>
              Create an account they can sign in with using their role password.
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={addMode}
            onValueChange={(value) => setAddMode(value as AddMode)}
            className="flex min-h-0 flex-1 flex-col gap-4"
          >
            <TabsList>
              <TabsTrigger value="single">Single</TabsTrigger>
              <TabsTrigger value="bulk">Bulk paste</TabsTrigger>
            </TabsList>

            <TabsContent value="single">
              <form onSubmit={handleSubmit} className="space-y-6">
                <UserFormBody
                  idPrefix="add"
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

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAddOpen(false);
                      resetAddForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <LoadingButton type="submit" loading={submitting}>
                    Add user
                  </LoadingButton>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="bulk" className="mt-0 flex min-h-0 flex-1 flex-col gap-4">
              <div className="shrink-0 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Paste rows from Google Sheets or Excel. CSV and TSV are both accepted.
                </p>
                <pre className="display-field overflow-x-auto p-3 text-xs text-muted-foreground">
{`Full name\tBerkeley email\tRole\tTeams
Alex Chen\talex@berkeley.edu\tExec\tStrategy,Events`}
                </pre>
              </div>

              <textarea
                value={bulkPaste}
                onChange={(e) => setBulkPaste(e.target.value)}
                rows={6}
                placeholder="Paste spreadsheet rows here..."
                className="h-28 w-full shrink-0 rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-sm text-muted-foreground">
                You can paste: First Name, Last Name, Berkeley email
              </p>

              <Field className="max-w-xs shrink-0">
                <FieldLabel htmlFor="bulk-default-role">Default role for missing role</FieldLabel>
                <PickerDropdown
                  id="bulk-default-role"
                  value={bulkDefaultRole}
                  onChange={(next) => next && setBulkDefaultRole(next)}
                  options={USER_UI_ROLE_OPTIONS}
                  placeholder="Select role"
                />
              </Field>

              <div className="min-h-0 max-h-[clamp(16rem,60vh,38rem)] overflow-y-auto overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Full name</TableHead>
                      <TableHead>Berkeley email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Teams</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulkRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-sm text-muted-foreground">
                          Paste rows to preview validation.
                        </TableCell>
                      </TableRow>
                    ) : (
                      bulkRows.map((row) => {
                        const selectedTeamsLabel = teams
                          .filter((team) => row.source.teamIds.includes(team.id))
                          .map((team) => team.name)
                          .join(', ');
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
                            <TableCell>{row.rowNumber}</TableCell>
                            <TableCell>{row.source.fullName || '—'}</TableCell>
                            <TableCell>{row.source.berkeleyEmail || '—'}</TableCell>
                            <TableCell>{row.source.role || '—'}</TableCell>
                            <TableCell>{selectedTeamsLabel || '—'}</TableCell>
                            <TableCell
                              className={cn(
                                'text-sm',
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

              {bulkSummary && (
                <StatusBanner
                  message={bulkSummary}
                  type={bulkSummary.toLowerCase().includes('failed') ? 'error' : 'success'}
                />
              )}

              <div className="sticky bottom-0 mt-auto border-t bg-background pt-4">
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAddOpen(false);
                      resetAddForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <LoadingButton
                    type="button"
                    loading={bulkSubmitting}
                    disabled={validBulkRows.length === 0}
                    onClick={handleBulkSubmit}
                  >
                    Create {validBulkRows.length} Valid {validBulkRows.length === 1 ? 'User' : 'Users'}
                  </LoadingButton>
                </DialogFooter>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <DestructiveConfirmDialog
        open={removingUser !== null}
        onOpenChange={(open) => !open && setRemovingUser(null)}
        title={removingUser ? `Remove ${removingUser.name}?` : 'Remove person?'}
        description={
          removingUser ? (
            <>
              Remove <strong>{removingUser.name}</strong> from the platform? They will lose access
              and their account will be deleted. People with grading history or other recruitment
              records cannot be removed.
            </>
          ) : (
            'Remove this person from the platform?'
          )
        }
        confirmLabel="Remove"
        onConfirm={handleRemove}
      />

      <Dialog open={editingUser !== null} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit person</DialogTitle>
            <DialogDescription>
              Fix a typo or update role and team access. Changes apply on their next sign-in.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-6">
            <UserFormBody
              idPrefix="edit"
              name={editName}
              setName={setEditName}
              email={editEmail}
              setEmail={setEditEmail}
              role={editRole}
              onRoleChange={handleEditRoleChange}
              teams={teams}
              selectedTeamIds={editTeams}
              directorTeamIds={editDirectorTeams}
              onToggleTeam={toggleEditTeam}
              onToggleDirector={toggleEditDirectorTeam}
            />

            {editError && <StatusBanner message={editError} type="error" />}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <LoadingButton type="submit" loading={editSubmitting}>
                Save changes
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
