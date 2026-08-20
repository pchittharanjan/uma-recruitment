'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckIcon, CopyIcon, MailIcon } from 'lucide-react';
import LoadingButton from '@/components/loading-button';
import PageLoading from '@/components/page-loading';
import StatusBanner from '@/components/status-banner';
import { PageContainer, PageHeader, PageSection, TitleCount } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  applyCommunicationTemplate,
  buildMailtoUrl,
  type RoundCommunicationsTemplates,
} from '@/lib/communication-templates';
import {
  outcomeEmailPassCardTitle,
  parseOutcomeEmailStage,
  type OutcomeEmailStage,
} from '@/lib/communications-stages';
import { toast } from 'sonner';

interface Recipient {
  applicationId: number;
  name: string;
  email: string;
}

interface CommunicationsData {
  team: { id: number; name: string };
  round: { id: number; label: string };
  fromStage: OutcomeEmailStage;
  templates: RoundCommunicationsTemplates;
  passRecipients: Recipient[];
  rejectRecipients: Recipient[];
  passNotifiedAt: number | null;
  rejectNotifiedAt: number | null;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        toast.success(`${label} copied`);
      }}
    >
      <CopyIcon className="size-3.5" />
      Copy {label}
    </Button>
  );
}

function formatSentAt(ts: number | null): string | null {
  if (!ts) return null;
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function TeamCommunicationsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const stageParam =
    searchParams.get('fromStage') ?? searchParams.get('view');
  const requestedStage = stageParam ? parseOutcomeEmailStage(stageParam) : null;

  const [data, setData] = useState<CommunicationsData | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState<'pass' | 'reject' | 'both' | null>(null);
  const [templates, setTemplates] = useState<RoundCommunicationsTemplates | null>(null);

  const stageQuery = requestedStage ? `?fromStage=${requestedStage}` : '';

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/teams/${teamId}/communications${stageQuery}`);
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Failed to load communications.');
      return;
    }
    setData(json);
    setTemplates(json.templates);
  }, [router, stageQuery, teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const fromStage = data?.fromStage ?? requestedStage ?? 'application';

  const handleSave = async () => {
    if (!templates) return;
    setSaving(true);
    setError('');
    const res = await fetch(`/api/admin/teams/${teamId}/communications${stageQuery}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...templates, fromStage }),
    });
    const json = await res.json();
    if (!res.ok) {
      const message = json.error ?? 'Failed to save templates.';
      setError(message);
      toast.error(message);
    } else {
      toast.success('Templates saved');
    }
    setSaving(false);
  };

  const handleMarkSent = async (which: 'pass' | 'reject' | 'both') => {
    setMarking(which);
    setError('');
    const res = await fetch(`/api/admin/teams/${teamId}/communications${stageQuery}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_sent', which, fromStage }),
    });
    const json = await res.json();
    if (!res.ok) {
      const message = json.error ?? 'Failed to mark as sent.';
      setError(message);
      toast.error(message);
    } else {
      setData(json);
      toast.success('Marked as sent');
    }
    setMarking(null);
  };

  if (error && !data) {
    return (
      <PageContainer>
        <StatusBanner message={error} type="error" />
      </PageContainer>
    );
  }

  if (!data || !templates) {
    return <PageLoading />;
  }

  const teamName = data.team.name;
  const passEmails = data.passRecipients.map((r) => r.email).join(', ');
  const rejectEmails = data.rejectRecipients.map((r) => r.email).join(', ');

  const passSubject = applyCommunicationTemplate(templates.passSubject, {
    name: '{name}',
    team: teamName,
  });
  const rejectSubject = applyCommunicationTemplate(templates.rejectSubject, {
    name: '{name}',
    team: teamName,
  });

  const samplePass = data.passRecipients[0];
  const sampleReject = data.rejectRecipients[0];
  const passBodyPreview = samplePass
    ? applyCommunicationTemplate(templates.passBody, { name: samplePass.name, team: teamName })
    : templates.passBody;
  const rejectBodyPreview = sampleReject
    ? applyCommunicationTemplate(templates.rejectBody, {
        name: sampleReject.name,
        team: teamName,
      })
    : templates.rejectBody;

  const passBccMailto =
    data.passRecipients.length > 0
      ? buildMailtoUrl({
          bcc: data.passRecipients.map((r) => r.email),
          subject: passSubject.replace('{name}', 'applicant'),
          body: passBodyPreview,
        })
      : null;

  const rejectBccMailto =
    data.rejectRecipients.length > 0
      ? buildMailtoUrl({
          bcc: data.rejectRecipients.map((r) => r.email),
          subject: rejectSubject.replace('{name}', 'applicant'),
          body: rejectBodyPreview,
        })
      : null;

  return (
    <PageContainer>
      <PageSection>
      <PageHeader
        eyebrow={data.team.name}
        title="Applicant Outcome Emails"
      />

      {error && <StatusBanner message={error} type="error" />}

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="flex items-baseline gap-2.5 text-base">
                {outcomeEmailPassCardTitle(fromStage)}
                <TitleCount>{data.passRecipients.length}</TitleCount>
              </CardTitle>
              {data.passNotifiedAt && (
                <p className="text-sm text-muted-foreground">
                  Marked sent {formatSentAt(data.passNotifiedAt)}
                </p>
              )}
            </div>
            {data.passNotifiedAt && (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700">
                <CheckIcon className="size-3" />
                Sent
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pass-subject" required>
                Subject
              </Label>
              <Input
                id="pass-subject"
                value={templates.passSubject}
                onChange={(e) => setTemplates({ ...templates, passSubject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pass-body" required>
                Body
              </Label>
              <textarea
                id="pass-body"
                value={templates.passBody}
                onChange={(e) => setTemplates({ ...templates, passBody: e.target.value })}
                rows={6}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <p className="text-sm text-muted-foreground">
                Placeholders: {'{name}'}, {'{team}'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {passBccMailto && (
                <Button
                  type="button"
                  size="sm"
                  nativeButton={false}
                  render={<a href={passBccMailto} />}
                >
                  <MailIcon className="size-3.5" />
                  Open in email (BCC all)
                </Button>
              )}
              <CopyButton value={passEmails} label="emails" />
              <CopyButton value={passBodyPreview} label="Sample body" />
              {data.passRecipients.length > 0 && !data.passNotifiedAt && (
                <LoadingButton
                  variant="secondary"
                  size="sm"
                  loading={marking === 'pass'}
                  onClick={() => handleMarkSent('pass')}
                >
                  Mark pass emails sent
                </LoadingButton>
              )}
            </div>
            {data.passRecipients.length > 0 && (
              <ul className="max-h-48 overflow-y-auto rounded-lg border p-3 text-sm">
                {data.passRecipients.map((r) => {
                  const mailto = buildMailtoUrl({
                    to: r.email,
                    subject: applyCommunicationTemplate(templates.passSubject, {
                      name: r.name,
                      team: teamName,
                    }),
                    body: applyCommunicationTemplate(templates.passBody, {
                      name: r.name,
                      team: teamName,
                    }),
                  });
                  return (
                    <li
                      key={r.applicationId}
                      className="flex flex-wrap items-center justify-between gap-2 py-1"
                    >
                      <span>
                        {r.name} · {r.email}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        nativeButton={false}
                        render={<a href={mailto} />}
                      >
                        <MailIcon className="size-3" />
                        Email
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="flex items-baseline gap-2.5 text-base">
                Not advancing
                <TitleCount>{data.rejectRecipients.length}</TitleCount>
              </CardTitle>
              {data.rejectNotifiedAt && (
                <p className="text-sm text-muted-foreground">
                  Marked sent {formatSentAt(data.rejectNotifiedAt)}
                </p>
              )}
            </div>
            {data.rejectNotifiedAt && (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700">
                <CheckIcon className="size-3" />
                Sent
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reject-subject" required>
                Subject
              </Label>
              <Input
                id="reject-subject"
                value={templates.rejectSubject}
                onChange={(e) => setTemplates({ ...templates, rejectSubject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reject-body" required>
                Body
              </Label>
              <textarea
                id="reject-body"
                value={templates.rejectBody}
                onChange={(e) => setTemplates({ ...templates, rejectBody: e.target.value })}
                rows={6}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {rejectBccMailto && (
                <Button
                  type="button"
                  size="sm"
                  nativeButton={false}
                  render={<a href={rejectBccMailto} />}
                >
                  <MailIcon className="size-3.5" />
                  Open in email (BCC all)
                </Button>
              )}
              <CopyButton value={rejectEmails} label="emails" />
              <CopyButton value={rejectBodyPreview} label="Sample body" />
              {data.rejectRecipients.length > 0 && !data.rejectNotifiedAt && (
                <LoadingButton
                  variant="secondary"
                  size="sm"
                  loading={marking === 'reject'}
                  onClick={() => handleMarkSent('reject')}
                >
                  Mark reject emails sent
                </LoadingButton>
              )}
            </div>
            {data.rejectRecipients.length > 0 && (
              <ul className="max-h-48 overflow-y-auto rounded-lg border p-3 text-sm">
                {data.rejectRecipients.map((r) => {
                  const mailto = buildMailtoUrl({
                    to: r.email,
                    subject: applyCommunicationTemplate(templates.rejectSubject, {
                      name: r.name,
                      team: teamName,
                    }),
                    body: applyCommunicationTemplate(templates.rejectBody, {
                      name: r.name,
                      team: teamName,
                    }),
                  });
                  return (
                    <li
                      key={r.applicationId}
                      className="flex flex-wrap items-center justify-between gap-2 py-1"
                    >
                      <span>
                        {r.name} · {r.email}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        nativeButton={false}
                        render={<a href={mailto} />}
                      >
                        <MailIcon className="size-3" />
                        Email
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          {data.passRecipients.length > 0 &&
            data.rejectRecipients.length > 0 &&
            (!data.passNotifiedAt || !data.rejectNotifiedAt) && (
              <LoadingButton
                variant="secondary"
                loading={marking === 'both'}
                onClick={() => handleMarkSent('both')}
              >
                Mark all emails sent
              </LoadingButton>
            )}
          <LoadingButton onClick={handleSave} loading={saving}>
            Save templates
          </LoadingButton>
        </div>
      </PageSection>
    </PageContainer>
  );
}
