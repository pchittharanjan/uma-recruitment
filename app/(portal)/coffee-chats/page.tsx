'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import PageLoading from '@/components/page-loading';
import StatusBanner from '@/components/status-banner';
import { PageContainer, PageHeader, PageSection } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  coffeeChatSubmittedLabel,
  parseUserCoffeeChatList,
  todayIsoDate,
  type UserCoffeeChatListItem,
} from '@/lib/coffee-chats';
import { phasePageEyebrow } from '@/lib/stages';

type MyChat = UserCoffeeChatListItem;

const VIEW_FIELD_LABELS = [
  ['General Thoughts and Vibes', 'vibes'],
  ['Green flags', 'green_flags'],
  ['Red flags', 'red_flags'],
  ['Other comments', 'other_comments'],
  ['Conflict of Interest', 'conflict_of_interest'],
] as const satisfies ReadonlyArray<
  readonly [
    string,
    keyof Pick<MyChat, 'vibes' | 'green_flags' | 'red_flags' | 'other_comments' | 'conflict_of_interest'>,
  ]
>;

interface MeResponse {
  user: { id: number; name: string; email: string; role: string };
  impersonation?: { active: boolean } | null;
}

interface CoffeeChatWindowInfo {
  coffeeChatStartDate: string | null;
  applicationDueDate: string | null;
  configured: boolean;
  open?: boolean;
}

interface CoffeeChatAvailabilityResponse {
  coffeeChatWindow?: CoffeeChatWindowInfo;
  unavailableReason?: string | null;
  pipelineClosed?: boolean;
  error?: string;
}

const emptyForm = {
  chatDate: todayIsoDate(),
  applicantName: '',
  vibes: '',
  greenFlags: '',
  redFlags: '',
  otherComments: '',
  conflictOfInterest: '',
};

export default function CoffeeChatsPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [myChats, setMyChats] = useState<MyChat[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingChat, setViewingChat] = useState<MyChat | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [windowInfo, setWindowInfo] = useState<CoffeeChatWindowInfo>({
    coffeeChatStartDate: null,
    applicationDueDate: null,
    configured: false,
    open: false,
  });
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [pipelineClosed, setPipelineClosed] = useState(false);
  const formSectionRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [meRes, availabilityRes, mineRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/coffee-chats'),
        fetch('/api/coffee-chats/mine'),
      ]);

      if (!meRes.ok) {
        router.push('/login');
        return;
      }

      const meJson = await meRes.json();
      setMe(meJson);

      const availabilityJson = (await availabilityRes.json()) as CoffeeChatAvailabilityResponse;
      if (!availabilityRes.ok) {
        setError(availabilityJson.error ?? 'Failed to load coffee chat availability.');
        return;
      }

      setWindowInfo(
        availabilityJson.coffeeChatWindow ?? {
          coffeeChatStartDate: null,
          applicationDueDate: null,
          configured: false,
          open: false,
        },
      );
      setUnavailableReason(availabilityJson.unavailableReason ?? null);
      setPipelineClosed(Boolean(availabilityJson.pipelineClosed));

      if (mineRes.ok) {
        const mineJson = await mineRes.json();
        setMyChats(parseUserCoffeeChatList(mineJson.chats));
      }
    } catch {
      setError('Failed to Load Coffee Chat Form.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm({ ...emptyForm, chatDate: todayIsoDate() });
    setEditingId(null);
    setSuccess('');
    setError('');
  };

  const startEdit = (chat: MyChat, options?: { scrollToForm?: boolean }) => {
    setEditingId(chat.id);
    setForm({
      chatDate: chat.chat_date,
      applicantName: chat.applicant_name,
      vibes: chat.vibes ?? '',
      greenFlags: chat.green_flags ?? '',
      redFlags: chat.red_flags ?? '',
      otherComments: chat.other_comments ?? '',
      conflictOfInterest: chat.conflict_of_interest ?? '',
    });
    setSuccess('');
    setError('');

    if (options?.scrollToForm) {
      requestAnimationFrame(() => {
        formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  const handleEditFromView = (chat: MyChat) => {
    setViewingChat(null);
    startEdit(chat, { scrollToForm: true });
  };

  const handleSubmit = async () => {
    if (!form.applicantName.trim()) {
      setError('Applicant name is required.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        chatDate: form.chatDate,
        applicantName: form.applicantName,
        vibes: form.vibes || null,
        greenFlags: form.greenFlags || null,
        redFlags: form.redFlags || null,
        otherComments: form.otherComments || null,
        conflictOfInterest: form.conflictOfInterest || null,
      };

      const res = await fetch(
        editingId ? `/api/coffee-chats/${editingId}` : '/api/coffee-chats',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        const message = json.error ?? 'Save failed.';
        setError(message);
        toast.error(message);
        return;
      }

      const message = editingId ? 'Coffee chat updated.' : 'Coffee chat submitted.';
      setSuccess(message);
      toast.success(message);
      resetForm();
      await load();
    } catch {
      setError('Network error.');
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoading />;

  const isAdmin = me?.user.role === 'admin' && !me?.impersonation?.active;
  const intakeAvailable =
    !pipelineClosed && (isAdmin || windowInfo.open || Boolean(editingId));
  const formDisabled = pipelineClosed || !intakeAvailable;

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        eyebrow={phasePageEyebrow('pre_application')}
        title="Submit notes"
        actions={
          isAdmin ? (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin/coffee-chats" />}>
              All submissions
            </Button>
          ) : undefined
        }
      />

      {error && !windowInfo.configured && !isAdmin ? (
        <StatusBanner type="error" message={error} />
      ) : !windowInfo.configured && !isAdmin ? (
        <div className="space-y-4">
          <StatusBanner
            type="warning"
            message={
              unavailableReason ??
              'Coffee chats are unavailable right now. Check whether the submission window is open.'
            }
          />
          <p className="text-sm text-muted-foreground">
            Admins need to set the coffee chat submission dates before anyone can submit notes.
          </p>
        </div>
      ) : (
        <>
          {pipelineClosed && (
            <StatusBanner
              type="info"
              message="Recruitment is closed. Coffee chat notes are view-only."
            />
          )}
          {!windowInfo.open && !isAdmin && !editingId && !pipelineClosed && (
            <StatusBanner
              type="warning"
              message={
                unavailableReason ??
                `Submissions are closed. Window: ${windowInfo.coffeeChatStartDate ?? '—'} through ${windowInfo.applicationDueDate ?? '—'}.`
              }
            />
          )}

          <PageSection ref={formSectionRef}>
            <Card>
              <CardHeader>
                <CardTitle>{editingId ? 'Edit submission' : 'New coffee chat'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="chatDate" required>
                      Date of chat
                    </Label>
                    <Input
                      id="chatDate"
                      type="date"
                      value={form.chatDate}
                      disabled={formDisabled}
                      required
                      onChange={(e) => setForm((f) => ({ ...f, chatDate: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="submitterName">Your full name</Label>
                  <Input id="submitterName" value={me?.user.name ?? ''} readOnly disabled />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="applicantName" required>
                    Applicant full name
                  </Label>
                  <Input
                    id="applicantName"
                    value={form.applicantName}
                    disabled={formDisabled}
                    placeholder="Full name"
                    required
                    onChange={(e) => setForm((f) => ({ ...f, applicantName: e.target.value }))}
                  />
                </div>

                {(
                  [
                    ['vibes', 'General Thoughts and Vibes', form.vibes],
                    ['greenFlags', 'Green flags', form.greenFlags],
                    ['redFlags', 'Red flags', form.redFlags],
                    ['otherComments', 'Other comments', form.otherComments],
                    ['conflictOfInterest', 'Conflict of Interest', form.conflictOfInterest],
                  ] as const
                ).map(([key, label, value]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={key}>{label}</Label>
                    <textarea
                      id={key}
                      rows={3}
                      className="field-textarea"
                      value={value}
                      disabled={formDisabled}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [key]: e.target.value }))
                      }
                    />
                  </div>
                ))}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {editingId && (
                    <Button type="button" variant="secondary" onClick={resetForm}>
                      Cancel edit
                    </Button>
                  )}
                  <LoadingButton
                    disabled={saving || formDisabled}
                    onClick={handleSubmit}
                  >
                    {editingId ? 'Save changes' : 'Submit coffee chat'}
                  </LoadingButton>
                </div>

                {success && <p className="text-sm text-green-700 dark:text-green-400">{success}</p>}
                {error && <p className="text-sm text-destructive">{error}</p>}
              </CardContent>
            </Card>
          </PageSection>

          <PageSection>
            <Card>
              <CardHeader>
                <CardTitle>Your submissions</CardTitle>
                <CardDescription>
                  You can edit your own notes for up to 7 days after submitting.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {myChats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No submissions yet.</p>
                ) : (
                  myChats.map((chat) => (
                    <div
                      key={chat.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 p-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium">
                          {chat.applicant_name}{' '}
                          <span className="text-muted-foreground font-normal">
                            · {chat.chat_date}
                          </span>
                        </p>
                        {chat.vibes && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{chat.vibes}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setViewingChat(chat)}
                        >
                          View
                        </Button>
                        {chat.editable && !pipelineClosed && (
                          <Button type="button" size="sm" variant="secondary" onClick={() => startEdit(chat)}>
                            Edit
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </PageSection>
        </>
      )}

      <Sheet
        open={viewingChat !== null}
        onOpenChange={(open) => {
          if (!open) setViewingChat(null);
        }}
      >
        <SheetContent side="right" size="lg" className="overflow-y-auto">
          {viewingChat && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle>{viewingChat.applicant_name}</SheetTitle>
                <SheetDescription>{coffeeChatSubmittedLabel(viewingChat.chat_date)}</SheetDescription>
              </SheetHeader>

              <div className="space-y-6 px-4">
                <dl className="grid gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Date of Chat</dt>
                    <dd className="mt-1 font-medium">{viewingChat.chat_date}</dd>
                  </div>
                  {VIEW_FIELD_LABELS.map(([label, key]) => (
                    <div key={key}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="display-field mt-1 whitespace-pre-wrap">
                        {viewingChat[key]?.trim() ? viewingChat[key] : '—'}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {viewingChat.editable && !pipelineClosed && (
                <SheetFooter className="flex-row justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => handleEditFromView(viewingChat)}
                  >
                    Edit
                  </Button>
                </SheetFooter>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
