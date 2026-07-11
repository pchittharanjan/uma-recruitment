'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import StatusBanner from '@/components/status-banner';
import { CoffeeChatDateSettings } from '@/components/coffee-chat-date-settings';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface CoffeeChatRow {
  id: number;
  chat_date: string;
  submitter_name: string;
  applicant_name: string;
  vibes: string | null;
  green_flags: string | null;
  red_flags: string | null;
  other_comments: string | null;
  conflict_of_interest: string | null;
}

export default function AdminCoffeeChatsPage() {
  const [chats, setChats] = useState<CoffeeChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

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

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        eyebrow="Coffee Chats"
        title="Coffee Chats"
        description="Centralized coffee chat intake submissions across all users."
        actions={
          <Link
            href="/coffee-chats"
            className="inline-flex h-8 items-center justify-center rounded-lg bg-secondary px-2.5 text-sm font-medium text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]"
          >
            Open submit form
          </Link>
        }
      />

      <PageSection>
        <CoffeeChatDateSettings onSaved={load} />
      </PageSection>

      <PageSection>
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Submissions</CardTitle>
              <CardDescription>{chats.length} Coffee Chat submission(s)</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {error && <StatusBanner type="error" message={error} />}
            {!hasMounted || loading ? (
              <p className="text-sm text-muted-foreground">Loading submissions…</p>
            ) : chats.length === 0 ? (
              <p className="text-sm text-muted-foreground">No coffee chats logged yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Submitter</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chats.map((chat) => (
                    <Fragment key={chat.id}>
                      <TableRow>
                        <TableCell>{chat.chat_date}</TableCell>
                        <TableCell className="font-medium">{chat.applicant_name}</TableCell>
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
                        <TableRow key={`${chat.id}-detail`}>
                          <TableCell colSpan={4} className="p-4">
                            <dl className="grid gap-3 text-sm sm:grid-cols-2">
                              {(
                                [
                                  ['General Thoughts and Vibes', chat.vibes],
                                  ['Green flags', chat.green_flags],
                                  ['Red flags', chat.red_flags],
                                  ['Other comments', chat.other_comments],
                                  ['Conflict of Interest', chat.conflict_of_interest],
                                ] as const
                              ).map(([label, value]) => (
                                <div key={label}>
                                  <dt className="font-medium text-muted-foreground">{label}</dt>
                                  <dd className="display-field mt-1 whitespace-pre-wrap">{value || '—'}</dd>
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
          </CardContent>
        </Card>
      </PageSection>
    </PageContainer>
  );
}
