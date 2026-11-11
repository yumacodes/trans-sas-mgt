import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import type { NotificationDto } from '@tsm/shared';
import { EmptyState, ErrorState } from '@/components/app/States';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api, errorMessage, request } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';

const POLL_MS = 60_000;

/** Top-bar bell: the unread count, and a list where opening an item goes to its record. */
export function NotificationBell() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const unread = useQuery({
    queryKey: [...qk.notifications, 'unread'],
    queryFn: ({ signal }) => api.get<{ count: number }>('/notifications/unread-count', undefined, signal),
    refetchInterval: POLL_MS,
  });
  const list = useQuery({
    queryKey: [...qk.notifications, 'list'],
    queryFn: ({ signal }) =>
      request<NotificationDto[]>('GET', '/notifications', { query: { page: 1, pageSize: 20 }, signal }),
    refetchInterval: POLL_MS,
  });
  const count = unread.data?.count ?? 0;
  const items = list.data?.data ?? [];

  /** Updates the screen first; the server call follows in the background. */
  const markLocally = (match: (n: NotificationDto) => boolean, removed: number) => {
    queryClient.setQueryData<{ data: NotificationDto[] }>([...qk.notifications, 'list'], (old) =>
      old ? { ...old, data: old.data.map((n) => (match(n) ? { ...n, read: true } : n)) } : old,
    );
    queryClient.setQueryData<{ count: number }>([...qk.notifications, 'unread'], (old) =>
      old ? { count: Math.max(0, old.count - removed) } : old,
    );
  };

  const open = (n: NotificationDto) => {
    if (!n.read) {
      markLocally((x) => x.id === n.id, 1);
      void api.post(`/notifications/${n.id}/read`).catch(() => {
        void queryClient.invalidateQueries({ queryKey: qk.notifications });
      });
    }
    if (n.link) void navigate(n.link);
  };

  const markAll = () => {
    markLocally(() => true, count);
    void api.post('/notifications/read-all').catch(() => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative rounded-full p-2.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        >
          <Bell className="size-5" aria-hidden />
          {count > 0 && (
            <span
              aria-hidden
              className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[0.65rem] font-semibold text-white"
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-ink">Notifications</p>
          {count > 0 && (
            <button type="button" onClick={markAll} className="text-xs font-medium text-accent hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto p-1">
          {list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState title="Nothing yet" description="Approvals, payments, deliveries and stock alerts will appear here." />
          ) : (
            items.map((n) => (
              <DropdownMenuItem key={n.id} onSelect={() => open(n)} className="items-start gap-3 whitespace-normal py-2.5">
                <span
                  aria-hidden
                  className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-accent')}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm text-ink', !n.read && 'font-semibold')}>
                    {n.title}
                    {!n.read && <span className="sr-only"> (unread)</span>}
                  </span>
                  {n.body && <span className="mt-0.5 block text-xs text-ink-muted">{n.body}</span>}
                  <span className="mt-0.5 block text-xs text-ink-subtle">{formatRelative(n.createdAt)}</span>
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
