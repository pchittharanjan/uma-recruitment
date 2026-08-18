'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import StatusBanner from '@/components/status-banner';
import { CoffeeChatDateSettings } from '@/components/coffee-chat-date-settings';
import { PageContainer, PageHeader, PageSection, TitleCount } from '@/components/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTeamsInterested } from '@/lib/coffee-chats';
import type { TeamName } from '@/lib/db';
import { phasePageEyebrow } from '@/lib/stages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  applicant_email: string | null;
  applicant_grade_level: string | null;
  teams_interested: TeamName[];
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
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow={phasePageEyebrow('pre_application')}
        title="Intake Submissions"
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/coffee-chats" />}>
            Open submit form
          </Button>
        }
      />

      <PageSection>
        <CoffeeChatDateSettings onSaved={load} />
      </PageSection>

      <PageSection>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-baseline gap-2.5">
              Submissions
              <TitleCount>{chats.length}</TitleCount>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            {error && <StatusBanner type="error" message={error} />}
            {!hasMounted || loading ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Grade level</TableHead>
                    <TableHead>Teams</TableHead>
                    <TableHead>Submitter</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 5 }, (_, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-36" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-12" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : chats.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Grade level</TableHead>
                    <TableHead>Teams</TableHead>
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
                        <TableCell>{chat.applicant_email ?? '-'}</TableCell>
                        <TableCell>{chat.applicant_grade_level ?? '-'}</TableCell>
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
                                <dd className="mt-1 font-medium">{chat.applicant_grade_level ?? '-'}</dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Teams interested</dt>
                                <dd className="mt-1 font-medium">
                                  {formatTeamsInterested(chat.teams_interested)}
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
          </CardContent>
        </Card>
      </PageSection>
    </PageContainer>
  );
}
