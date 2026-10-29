import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  BranchRef,
  PasswordResetRequestDto,
  RoleDto,
  StockCategoryDto,
  UserOptionDto,
} from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { api, request, type QueryValue } from './api';
import { qk } from './queryKeys';

/** Paginated list query; keeps the previous page visible while the next one loads. */
export function useListQuery<T>(
  key: readonly unknown[],
  path: string,
  query: Record<string, QueryValue>,
  enabled = true,
) {
  return useQuery({
    queryKey: [...key, 'list', query],
    queryFn: ({ signal }) => request<T[]>('GET', path, { query, signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useBranchOptions() {
  return useQuery({
    queryKey: qk.branchOptions,
    queryFn: ({ signal }) => api.get<BranchRef[]>('/branches/options', undefined, signal),
    staleTime: 5 * 60_000,
  });
}

export function useStockCategories() {
  const { can } = useAuth();
  return useQuery({
    queryKey: qk.stockCategories,
    queryFn: ({ signal }) => api.get<StockCategoryDto[]>('/stock-categories', undefined, signal),
    enabled: can('stock_items.read'),
    staleTime: 60_000,
  });
}

export function useRoles() {
  const { canAny } = useAuth();
  return useQuery({
    queryKey: qk.roles,
    queryFn: ({ signal }) => api.get<RoleDto[]>('/roles', undefined, signal),
    enabled: canAny('roles.manage', 'users.manage'),
  });
}

/** Names for user pickers: client owner, branch manager, message audience filters. */
export function useUserOptions() {
  const { canAny } = useAuth();
  return useQuery({
    queryKey: qk.userOptions,
    queryFn: ({ signal }) => api.get<UserOptionDto[]>('/users/options', undefined, signal),
    enabled: canAny('clients.read', 'branches.manage', 'users.manage', 'messages.send'),
    staleTime: 5 * 60_000,
  });
}

/** Open password-reset requests; only fetched for people who can manage users. */
export function useResetRequests() {
  const { can } = useAuth();
  const allowed = can('users.manage');
  return useQuery({
    queryKey: qk.resetRequests,
    queryFn: ({ signal }) => api.get<PasswordResetRequestDto[]>('/users/reset-requests', undefined, signal),
    enabled: allowed,
    refetchInterval: 60_000,
  });
}
