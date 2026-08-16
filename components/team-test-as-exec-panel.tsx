'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserRoundIcon } from 'lucide-react';
import LoadingButton from '@/components/loading-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TeamUser {
  id: number;
  name: string;
  email: string;
  role: string;
  teams: { id: number; name: string }[];
}

export function TeamTestAsExecPanel({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((json) => {
        const teamIdNum = Number(teamId);
        const eligible = (json.users as TeamUser[]).filter(
          (u) =>
            (u.role === 'exec' || u.role === 'ad_hoc_exec') &&
            u.teams.some((t) => t.id === teamIdNum),
        );
        setUsers(eligible);
      })
      .catch(() => setError('Could not load team Exec.'));
  }, [teamId]);

  const handleTestAs = async (userId: number) => {
    setError('');
    setLoadingId(userId);
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })});
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to start test mode.');
        return;
      }
      router.push(`/team/${teamId}`);
      router.refresh();
    } catch {
      setError('Failed to start test mode.');
    } finally {
      setLoadingId(null);
    }
  };

  if (users.length === 0 && !error) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Test as Exec</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {users.map((user) => (
            <LoadingButton
              key={user.id}
              variant="secondary"
              size="sm"
              loading={loadingId === user.id}
              onClick={() => handleTestAs(user.id)}
            >
              <UserRoundIcon className="size-3.5" />
              {user.name}
            </LoadingButton>
          ))}
        </div>
        {users.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No exec assigned to this team yet. Add one on the People page.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
