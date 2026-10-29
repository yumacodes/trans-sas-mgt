import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Send, Users } from 'lucide-react';
import type { z } from 'zod';
import {
  MESSAGE_AUDIENCE_DESCRIPTIONS,
  MESSAGE_AUDIENCE_LABELS,
  MESSAGE_AUDIENCES,
  MESSAGE_BODY_MAX,
  mergeFieldsFor,
  messageInputSchema,
  ORGANIZATION_TYPE_LABELS,
  ORGANIZATION_TYPES,
  type MessageAudience,
  type MessageAudiencePreviewDto,
  type MessageDto,
  type MessageInput,
} from '@tsm/shared';
import { applyServerErrors, Field, FormError, useIdempotencyKey } from '@/components/app/form';
import { zodForm } from '@/lib/zodForm';
import { ConfirmDialog } from '@/components/app/dialogs';
import { useOperation } from '@/components/app/OperationFeedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { formatCount } from '@/lib/format';
import { useBranchOptions, useRoles } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';

type Output = z.output<typeof messageInputSchema>;

const DEFAULTS: MessageInput = {
  audience: 'clients',
  filters: { status: 'active', registeredOnly: false, activeOnly: true },
  subject: '',
  body: '',
};

/**
 * Compose one message and send it to a resolved audience.
 *
 * The recipient count comes from the server as the audience and filters change, so the
 * figure shown on the Send button is the figure the server will act on. Individual
 * recipients can be unticked, which only ever narrows the list.
 */
export function ComposeMessage({ onSent }: { onSent: (messageId: string) => void }) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const idem = useIdempotencyKey();
  const branches = useBranchOptions();
  const roles = useRoles();
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const form = useForm<MessageInput, unknown, Output>({
    resolver: zodForm(messageInputSchema),
    defaultValues: DEFAULTS,
  });
  const { errors } = form.formState;
  const values = form.watch();
  const audience = (values.audience ?? 'clients') as MessageAudience;
  // `watch` returns a new object each render, so the audience request and the effects
  // below key off a stable serialisation of the filters instead.
  const filterKey = JSON.stringify(values.filters ?? {});
  const filters = useMemo(
    () => JSON.parse(filterKey) as NonNullable<MessageInput['filters']>,
    [filterKey],
  );

  /** 'all' follows the filters; a Set is an explicit, narrower choice. */
  const [selection, setSelection] = useState<'all' | Set<string>>('all');
  const [showRecipients, setShowRecipients] = useState(false);
  const [preview, setPreview] = useState<MessageAudiencePreviewDto['sample'] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // A different audience or filter resolves to different people, so an individual
  // choice made for the previous set no longer applies.
  useEffect(() => {
    setSelection('all');
  }, [audience, filterKey]);

  const audienceQuery = useQuery({
    queryKey: [...qk.messageAudience, audience, filterKey],
    queryFn: () => api.post<MessageAudiencePreviewDto>('/messages/audience', { audience, filters }),
  });
  const resolved = audienceQuery.data;

  const deliverableIds = useMemo(
    () => (resolved?.recipients ?? []).filter((r) => r.email).map((r) => r.id),
    [resolved],
  );
  const chosen = selection === 'all' ? deliverableIds : [...selection];
  const recipientTotal = selection === 'all' ? (resolved?.deliverable ?? 0) : chosen.length;

  const toggleRecipient = (id: string) => {
    setSelection((current) => {
      const next = new Set(current === 'all' ? deliverableIds : current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const payloadFor = (data: Output) => ({
    audience: data.audience,
    filters: data.filters,
    subject: data.subject,
    body: data.body,
    ...(selection === 'all' ? {} : { recipientIds: chosen }),
  });

  const openPreview = async () => {
    setPreviewError(null);
    const data = form.getValues();
    try {
      const result = await api.post<MessageAudiencePreviewDto>('/messages/audience', {
        ...payloadFor(data as unknown as Output),
        // An empty draft still previews: the recipient's details are the useful part.
        subject: data.subject || '(no subject yet)',
        body: data.body || '(no message yet)',
      });
      if (!result.sample) {
        setPreviewError(
          'There is no one to preview: no recipient in this audience has an email address.',
        );
        return;
      }
      setPreview(result.sample);
    } catch (error) {
      setPreviewError(errorMessage(error));
    }
  };

  const insertMergeField = (token: string) => {
    const el = bodyRef.current;
    const snippet = `{{${token}}}`;
    if (!el) {
      form.setValue('body', `${form.getValues().body ?? ''}${snippet}`, { shouldDirty: true });
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = `${el.value.slice(0, start)}${snippet}${el.value.slice(end)}`;
    form.setValue('body', next, { shouldDirty: true, shouldValidate: false });
    // Keep typing where the token ends.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  /** Valid draft waiting for the send confirmation. */
  const approved = useRef<Output | null>(null);

  const onSubmit = form.handleSubmit((data) => {
    setFormError(null);
    if (recipientTotal === 0) {
      setFormError(
        resolved && resolved.total > 0
          ? 'None of the people in this audience has an email address on record, so there is no one to send to.'
          : 'No one matches this audience. Change the filters and try again.',
      );
      return;
    }
    if (resolved?.overLimit && selection === 'all') {
      setFormError(
        `More than ${resolved.limit} recipients match. Narrow the audience with the filters, or pick recipients individually.`,
      );
      return;
    }
    approved.current = data;
    setConfirmSend(true);
  });

  const send = async () => {
    const data = approved.current;
    if (!data) return;
    const payload = payloadFor(data);
    try {
      const message = await run(
        () => api.post<MessageDto>('/messages', payload, idem.keyFor(payload)),
        {
          pending: 'Sending message…',
          success: `Message queued for ${formatCount(recipientTotal)} recipient(s)`,
        },
      );
      idem.reset();
      approved.current = null;
      void queryClient.invalidateQueries({ queryKey: qk.messages });
      form.reset(DEFAULTS);
      setSelection('all');
      onSent(message.id);
    } catch (error) {
      if (applyServerErrors(error, form.setError)) return;
      setFormError(errorMessage(error));
    }
  };

  const bodyField = form.register('body');
  const mergeFields = mergeFieldsFor(audience);
  const branchOptions = branches.data ?? [];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>New message</CardTitle>
          <CardDescription>
            Write once and send it to everyone in the chosen audience, personalised with merge
            fields.
          </CardDescription>
        </div>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="space-y-6">
          <FormError message={formError} />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink">Who should receive this?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {MESSAGE_AUDIENCES.map((option) => (
                <label
                  key={option}
                  className={cn(
                    'cursor-pointer rounded-xl border p-3 transition-colors',
                    audience === option
                      ? 'border-accent/50 bg-accent-soft'
                      : 'border-border hover:bg-surface-muted',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      className="size-4 accent-current text-accent"
                      name="audience"
                      value={option}
                      checked={audience === option}
                      onChange={() => form.setValue('audience', option, { shouldDirty: true })}
                    />
                    <span className="text-sm font-medium text-ink">
                      {MESSAGE_AUDIENCE_LABELS[option]}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-ink-muted">
                    {MESSAGE_AUDIENCE_DESCRIPTIONS[option]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {audience === 'clients' && (
              <>
                <Field label="Client status">
                  <NativeSelect {...form.register('filters.status')}>
                    <option value="active">Active clients only</option>
                    <option value="all">Active and archived</option>
                  </NativeSelect>
                </Field>
                <Field label="Organization type">
                  <NativeSelect
                    {...form.register('filters.organizationType', {
                      setValueAs: (v) => v || undefined,
                    })}
                  >
                    <option value="">Every type</option>
                    {ORGANIZATION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ORGANIZATION_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </>
            )}
            {audience === 'users' && roles.data && roles.data.length > 0 && (
              <Field label="Role">
                <NativeSelect
                  {...form.register('filters.roleId', { setValueAs: (v) => v || undefined })}
                >
                  <option value="">Every role</option>
                  {roles.data.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {branchOptions.length > 1 && (
              <Field label="Branch">
                <NativeSelect
                  {...form.register('filters.branchId', { setValueAs: (v) => v || undefined })}
                >
                  <option value="">Every branch</option>
                  {branchOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {audience === 'clients' && (
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
                <Checkbox
                  checked={Boolean(filters.registeredOnly)}
                  onCheckedChange={(v) =>
                    form.setValue('filters.registeredOnly', v === true, { shouldDirty: true })
                  }
                />
                Registered clients only
              </label>
            )}
            {audience === 'users' && (
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
                <Checkbox
                  checked={filters.activeOnly === false}
                  onCheckedChange={(v) =>
                    form.setValue('filters.activeOnly', v !== true, { shouldDirty: true })
                  }
                />
                Include deactivated accounts
              </label>
            )}
          </div>

          <RecipientSummary
            loading={audienceQuery.isLoading}
            error={audienceQuery.isError ? errorMessage(audienceQuery.error) : null}
            onRetry={() => void audienceQuery.refetch()}
            resolved={resolved}
            chosenCount={recipientTotal}
            narrowed={selection !== 'all'}
            onReview={() => setShowRecipients(true)}
            onResetSelection={() => setSelection('all')}
          />

          <Field label="Subject" required error={errors.subject?.message}>
            <Input maxLength={200} {...form.register('subject')} />
          </Field>

          <Field
            label="Message"
            required
            error={errors.body?.message}
            hint={`Plain text. ${MESSAGE_BODY_MAX.toLocaleString()} characters maximum.`}
          >
            <Textarea
              rows={10}
              maxLength={MESSAGE_BODY_MAX}
              {...bodyField}
              ref={(el) => {
                bodyField.ref(el);
                bodyRef.current = el;
              }}
            />
          </Field>

          <div>
            <p className="text-xs font-medium text-ink">Merge fields</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Click to insert. Each recipient receives their own values.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {mergeFields.map((f) => (
                <button
                  key={f.token}
                  type="button"
                  onClick={() => insertMergeField(f.token)}
                  className="rounded-md border border-border px-2 py-1 font-mono text-[11px] text-ink-muted transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-accent"
                  title={f.label}
                >
                  {`{{${f.token}}}`}
                </button>
              ))}
            </div>
          </div>

          {previewError && (
            <p role="alert" className="text-xs text-danger">
              {previewError}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => void openPreview()}>
              <Eye aria-hidden /> Preview
            </Button>
            <Button type="submit">
              <Send aria-hidden /> Send to {formatCount(recipientTotal)} recipient(s)
            </Button>
          </div>
        </CardContent>
      </form>

      <RecipientReviewDialog
        open={showRecipients}
        onOpenChange={setShowRecipients}
        resolved={resolved}
        isChosen={(id) => (selection === 'all' ? deliverableIds.includes(id) : selection.has(id))}
        onToggle={toggleRecipient}
        onSelectAll={() => setSelection('all')}
        onSelectNone={() => setSelection(new Set())}
      />

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>
              {preview ? `As ${preview.name} <${preview.email}> will receive it.` : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="eyebrow">Subject</p>
            <p className="mt-1 text-sm font-medium text-ink">{preview?.subject}</p>
            <p className="eyebrow mt-4">Message</p>
            <p className="mt-1 whitespace-pre-line rounded-2xl bg-surface-muted/60 p-5 text-sm text-ink">
              {preview?.body}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title={`Send this message to ${formatCount(recipientTotal)} recipient(s)?`}
        description={
          <div className="space-y-2">
            <p>
              <strong>{MESSAGE_AUDIENCE_LABELS[audience]}</strong> — the message will be emailed
              immediately and cannot be recalled.
            </p>
            {resolved && resolved.withoutEmail > 0 && selection === 'all' && (
              <p>
                {formatCount(resolved.withoutEmail)} of them have no email address and will be
                skipped.
              </p>
            )}
          </div>
        }
        confirmLabel="Send message"
        onConfirm={() => void send()}
      />
    </Card>
  );
}

function RecipientSummary({
  loading,
  error,
  onRetry,
  resolved,
  chosenCount,
  narrowed,
  onReview,
  onResetSelection,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  resolved?: MessageAudiencePreviewDto;
  chosenCount: number;
  narrowed: boolean;
  onReview: () => void;
  onResetSelection: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-muted/60 px-4 py-3">
      <Users className="size-4 shrink-0 text-ink-subtle" aria-hidden />
      <div className="min-w-0 flex-1 text-sm" aria-live="polite">
        {loading ? (
          <span className="text-ink-muted">Counting recipients…</span>
        ) : error ? (
          <span className="text-danger">{error}</span>
        ) : !resolved ? (
          <span className="text-ink-muted">No recipients resolved yet.</span>
        ) : (
          <span className="text-ink">
            <strong>{formatCount(chosenCount)}</strong> recipient(s) will be emailed
            {narrowed && <span className="text-ink-muted"> (chosen individually)</span>}
            {resolved.withoutEmail > 0 && !narrowed && (
              <span className="text-ink-muted">
                {' '}
                · {formatCount(resolved.withoutEmail)} skipped, no email address
              </span>
            )}
            {resolved.overLimit && (
              <Badge tone="warning" className="ml-2">
                More than {resolved.limit} match
              </Badge>
            )}
          </span>
        )}
      </div>
      {error ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : (
        <>
          {narrowed && (
            <Button variant="ghost" size="sm" onClick={onResetSelection}>
              Use all
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={!resolved || resolved.recipients.length === 0}
            onClick={onReview}
          >
            Review recipients
          </Button>
        </>
      )}
    </div>
  );
}

function RecipientReviewDialog({
  open,
  onOpenChange,
  resolved,
  isChosen,
  onToggle,
  onSelectAll,
  onSelectNone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resolved?: MessageAudiencePreviewDto;
  isChosen: (id: string) => boolean;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}) {
  const recipients = resolved?.recipients ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Recipients</DialogTitle>
          <DialogDescription>
            Untick anyone who should not receive this message.
            {resolved?.truncated && ' Only the first 200 are listed.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="mb-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={onSelectAll}>
              Select all
            </Button>
            <Button variant="ghost" size="sm" onClick={onSelectNone}>
              Clear
            </Button>
          </div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {recipients.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                <Checkbox
                  checked={isChosen(r.id)}
                  disabled={!r.email}
                  onCheckedChange={() => onToggle(r.id)}
                  aria-label={`Include ${r.name}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{r.name}</span>
                  <span className="block truncate text-xs text-ink-subtle">
                    {r.email ?? 'No email address'}
                    {r.detail ? ` · ${r.detail}` : ''}
                  </span>
                </span>
                {!r.email && <Badge tone="neutral">Skipped</Badge>}
              </li>
            ))}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
