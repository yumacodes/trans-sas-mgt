import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { MailWarning, PlugZap, Send } from 'lucide-react';
import {
  MESSAGE_AUDIENCE_LABELS,
  MESSAGE_AUDIENCES,
  MESSAGE_STATUSES,
  MESSAGE_STATUS_LABELS,
  type EmailConfigDto,
  type MessageDto,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { CellLink, DataTable, FilterSelect } from '@/components/app/DataTable';
import { PageHeader } from '@/components/app/PageHeader';
import { MessageStatusBadge } from '@/components/app/StatusBadges';
import { useTableState } from '@/components/app/useTableState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';
import { formatCount, formatDateTime } from '@/lib/format';
import { useListQuery } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { ComposeMessage } from './ComposeMessage';
import { MessageDetailModal } from './MessageDetailModal';

/**
 * Communication: send one tailored message to every client, staff user or branch
 * manager, and see exactly what reached whom.
 *
 * Outbound email is an optional server integration. When it is not configured the
 * composer is not shown at all — a button that silently did nothing would be worse
 * than saying plainly that email still needs setting up.
 */
export default function CommunicationPage() {
  const { can } = useAuth();
  const state = useTableState(['audience', 'status'], { sort: 'createdAt:desc' });
  const result = useListQuery<MessageDto>(
    qk.messages,
    '/messages',
    state.query,
    can('messages.read'),
  );
  const [viewId, setViewId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const config = useQuery({
    queryKey: qk.emailConfig,
    queryFn: ({ signal }) => api.get<EmailConfigDto>('/messages/email-config', undefined, signal),
    staleTime: 5 * 60_000,
  });

  const columns: ColumnDef<MessageDto>[] = [
    {
      id: 'createdAt',
      header: 'Sent',
      meta: { sortKey: 'createdAt' },
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
    {
      id: 'subject',
      header: 'Subject',
      meta: { sortKey: 'subject' },
      cell: ({ row }) => (
        <CellLink onClick={() => setViewId(row.original.id)}>
          <span className="font-medium">{row.original.subject}</span>
        </CellLink>
      ),
    },
    {
      id: 'audience',
      header: 'Audience',
      cell: ({ row }) => MESSAGE_AUDIENCE_LABELS[row.original.audience],
    },
    {
      id: 'recipientCount',
      header: 'Addressed',
      meta: { sortKey: 'recipientCount', align: 'right' },
      cell: ({ row }) => formatCount(row.original.recipientCount),
    },
    {
      id: 'outcome',
      header: 'Outcome',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone="success">{formatCount(row.original.sentCount)} sent</Badge>
          {row.original.failedCount > 0 && (
            <Badge tone="danger">{formatCount(row.original.failedCount)} failed</Badge>
          )}
          {row.original.skippedCount > 0 && (
            <Badge tone="neutral">{formatCount(row.original.skippedCount)} skipped</Badge>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <MessageStatusBadge status={row.original.status} />,
    },
    { id: 'createdBy', header: 'By', cell: ({ row }) => row.original.createdBy?.fullName ?? '—' },
  ];

  return (
    <>
      <PageHeader
        title="Communication"
        description="Send a tailored message to your clients, your employees or your branch admins, and keep a record of every send."
        actions={
          can('messages.send') && (
            <Button
              onClick={() => setComposeOpen(true)}
              disabled={!config.data?.configured}
              title={config.data && !config.data.configured ? 'Set up email first' : undefined}
            >
              <Send aria-hidden /> Send message
            </Button>
          )
        }
      />

      {config.data && !config.data.configured && <EmailSetupNotice config={config.data} />}

      {can('messages.send') && config.data?.configured && (
        <ComposeMessage open={composeOpen} onOpenChange={setComposeOpen} onSent={(id) => setViewId(id)} />
      )}

      {can('messages.read') && (
        <DataTable
          columns={columns}
          result={result}
          state={state}
          getRowId={(m) => m.id}
          onRowClick={(m) => setViewId(m.id)}
          caption="Messages sent"
          searchPlaceholder="Search by subject"
          filters={
            <>
              <FilterSelect
                label="Audience"
                value={state.filters.audience}
                onChange={(v) => state.setFilter('audience', v)}
                options={MESSAGE_AUDIENCES.map((a) => ({
                  value: a,
                  label: MESSAGE_AUDIENCE_LABELS[a],
                }))}
              />
              <FilterSelect
                label="Status"
                value={state.filters.status}
                onChange={(v) => state.setFilter('status', v)}
                options={MESSAGE_STATUSES.map((s) => ({
                  value: s,
                  label: MESSAGE_STATUS_LABELS[s],
                }))}
              />
            </>
          }
          emptyTitle="No messages sent yet"
          emptyDescription={
            can('messages.send')
              ? 'Messages you send to clients, staff or branch managers are listed here with their delivery outcome.'
              : 'Messages sent to clients, staff or branch managers will be listed here.'
          }
        />
      )}

      <MessageDetailModal messageId={viewId} onOpenChange={(open) => !open && setViewId(null)} />
    </>
  );
}

/** Plain explanation of what is missing, rather than a send button that cannot work. */
function EmailSetupNotice({ config }: { config: EmailConfigDto }) {
  const { can } = useAuth();
  return (
    <Card className="mb-6 border-warning/40">
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
            <MailWarning className="size-5" aria-hidden />
          </span>
          <div>
            <CardTitle>Email has not been set up yet</CardTitle>
            <CardDescription>
              Messages cannot be sent until a mail server is configured on the API server. Nothing
              is queued or silently dropped in the meantime.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-ink-muted">
        <p>
          An administrator needs to set{' '}
          {config.missing.map((name, i) => (
            <span key={name}>
              {i > 0 && ', '}
              <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-xs text-ink">
                {name}
              </code>
            </span>
          ))}{' '}
          in the API environment (see <code className="font-mono text-xs">.env.example</code>), then
          restart the API.
        </p>
        <div className="rounded-xl bg-surface-muted p-4 text-xs">
          <p className="font-medium text-ink">Using Gmail</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Turn on 2-Step Verification for the Gmail account, then create an App password (Google Account → Security → App passwords). Your normal Gmail password will not work.</li>
            <li>
              In the API environment set <code className="font-mono text-ink">SMTP_HOST=smtp.gmail.com</code>,{' '}
              <code className="font-mono text-ink">SMTP_PORT=587</code>,{' '}
              <code className="font-mono text-ink">SMTP_USER</code> and{' '}
              <code className="font-mono text-ink">MAIL_FROM_EMAIL</code> (both the Gmail address) and{' '}
              <code className="font-mono text-ink">SMTP_PASS</code> (the 16-character app password).
            </li>
            <li>Redeploy the API, then press Test the mail server.</li>
          </ol>
          <p className="mt-2">Gmail allows roughly 500 emails a day per account.</p>
        </div>
        <p className="text-xs">
          Optional settings: <code className="font-mono">SMTP_PORT</code>,{' '}
          <code className="font-mono">SMTP_SECURE</code>,{' '}
          <code className="font-mono">SMTP_USER</code>, <code className="font-mono">SMTP_PASS</code>
          , <code className="font-mono">MAIL_FROM_NAME</code>,{' '}
          <code className="font-mono">MAIL_REPLY_TO</code>.
        </p>
        {can('messages.send') && <TestConnectionButton />}
      </CardContent>
    </Card>
  );
}

function TestConnectionButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const test = async () => {
    setBusy(true);
    setResult(null);
    try {
      await api.post('/messages/email-config/test');
      setResult({ ok: true, text: 'The mail server accepted the connection.' });
    } catch (error) {
      setResult({ ok: false, text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => void test()}>
        <PlugZap aria-hidden /> {busy ? 'Testing…' : 'Test the mail server'}
      </Button>
      {result && (
        <p role="status" className={result.ok ? 'text-xs text-success' : 'text-xs text-danger'}>
          {result.text}
        </p>
      )}
    </div>
  );
}
