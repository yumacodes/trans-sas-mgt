import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  MESSAGE_AUDIENCE_LABELS,
  MESSAGE_RECIPIENT_STATUS_LABELS,
  type MessageDetailDto,
  type MessageDto,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { DetailList, RecordModal, type RecordTab } from '@/components/app/RecordModal';
import { MessageStatusBadge } from '@/components/app/StatusBadges';
import { EmptyState } from '@/components/app/States';
import { useOperation } from '@/components/app/OperationFeedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { formatCount, formatDateTime } from '@/lib/format';
import { qk } from '@/lib/queryKeys';

const RECIPIENT_TONES = {
  sent: 'success',
  failed: 'danger',
  skipped: 'neutral',
  pending: 'info',
} as const;

/**
 * A sent message and what happened to each recipient. While delivery is still running
 * the record is polled, so progress appears without the user refreshing the page.
 */
export function MessageDetailModal({
  messageId,
  onOpenChange,
}: {
  messageId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { run } = useOperation();

  const query = useQuery({
    queryKey: [...qk.messages, 'detail', messageId],
    queryFn: ({ signal }) => api.get<MessageDetailDto>(`/messages/${messageId}`, undefined, signal),
    enabled: Boolean(messageId),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === 'queued' || status === 'sending' ? 2000 : false;
    },
  });
  const message = query.data;
  const inProgress = message?.status === 'queued' || message?.status === 'sending';

  const retry = async () => {
    if (!message) return;
    try {
      await run(() => api.post<MessageDto>(`/messages/${message.id}/retry`), {
        pending: 'Retrying failed deliveries…',
        success: 'Retrying now',
      });
      void queryClient.invalidateQueries({ queryKey: qk.messages });
      void query.refetch();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const tabs: RecordTab[] = message
    ? [
        {
          value: 'overview',
          label: 'Overview',
          content: (
            <div className="space-y-4">
              <DetailList
                items={[
                  { label: 'Audience', value: MESSAGE_AUDIENCE_LABELS[message.audience] },
                  { label: 'Sent by', value: message.createdBy?.fullName ?? 'Unknown' },
                  { label: 'Started', value: formatDateTime(message.createdAt) },
                  {
                    label: 'Finished',
                    value: message.completedAt
                      ? formatDateTime(message.completedAt)
                      : 'In progress',
                  },
                  {
                    label: 'Addressed',
                    value: `${formatCount(message.recipientCount)} recipient(s)`,
                  },
                  {
                    label: 'Outcome',
                    value: (
                      <span className="flex flex-wrap gap-1.5">
                        <Badge tone="success">{formatCount(message.sentCount)} sent</Badge>
                        {message.failedCount > 0 && (
                          <Badge tone="danger">{formatCount(message.failedCount)} failed</Badge>
                        )}
                        {message.skippedCount > 0 && (
                          <Badge tone="neutral">{formatCount(message.skippedCount)} skipped</Badge>
                        )}
                      </span>
                    ),
                  },
                  { label: 'Subject', value: message.subject, wide: true },
                ]}
              />
              <section>
                <h3 className="eyebrow !text-accent">Message</h3>
                <p className="mt-2 whitespace-pre-line rounded-2xl bg-surface-muted/60 p-5 text-sm text-ink">
                  {message.body}
                </p>
                <p className="mt-2 text-xs text-ink-subtle">
                  Merge fields are shown here as written; each recipient received their own values.
                </p>
              </section>
            </div>
          ),
        },
        {
          value: 'recipients',
          label: `Recipients (${formatCount(message.recipients.length)})`,
          content:
            message.recipients.length === 0 ? (
              <EmptyState title="No recipients" />
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <caption className="sr-only">Delivery outcome per recipient</caption>
                  <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-subtle">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">
                        Recipient
                      </th>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">
                        Email
                      </th>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">
                        Outcome
                      </th>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {message.recipients.map((r) => (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2 text-ink-muted">{r.email ?? '—'}</td>
                        <td className="px-3 py-2">
                          <Badge tone={RECIPIENT_TONES[r.status]} dot>
                            {MESSAGE_RECIPIENT_STATUS_LABELS[r.status]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-ink-muted">
                          {r.error ?? (r.sentAt ? formatDateTime(r.sentAt) : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
        },
      ]
    : [];

  return (
    <RecordModal
      open={Boolean(messageId)}
      onOpenChange={onOpenChange}
      title={message?.subject ?? 'Message'}
      status={message && <MessageStatusBadge status={message.status} />}
      subtitle={
        message ? (
          <span>
            {MESSAGE_AUDIENCE_LABELS[message.audience]} · {formatDateTime(message.createdAt)}
          </span>
        ) : undefined
      }
      loading={query.isLoading}
      error={query.isError ? errorMessage(query.error) : null}
      onRetry={() => void query.refetch()}
      tabs={tabs}
      actions={
        message && message.failedCount > 0 && !inProgress && can('messages.send') ? (
          <Button variant="secondary" onClick={() => void retry()}>
            <RefreshCw aria-hidden /> Retry {formatCount(message.failedCount)} failed
          </Button>
        ) : undefined
      }
    />
  );
}
