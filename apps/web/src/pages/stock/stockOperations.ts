import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { StockBalanceDto } from '@tsm/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';

/** Item (and optionally branch) a stock dialog opens with, e.g. from a balance row. */
export interface StockTarget {
  itemId: string;
  itemName: string;
  unit: string;
  branchId?: string;
}

/** Endpoint base for the item picker (serves `${base}/items`). */
export const STOCK_PICKER_BASE = '/stock-balances';

/** Available quantity of one item at one branch; '0' when nothing is on record. */
export function useAvailableQuantity(itemId: string | undefined, branchId: string | undefined) {
  return useQuery({
    queryKey: [...qk.stockBalances, 'available', itemId, branchId],
    queryFn: async ({ signal }) => {
      const result = await api.list<StockBalanceDto>(
        '/stock-balances',
        { itemId, branchId, pageSize: 1 },
        signal,
      );
      return result.data[0]?.quantityAvailable ?? '0';
    },
    enabled: Boolean(itemId && branchId),
    staleTime: 0,
  });
}

/** Refreshes every screen that shows stock after an adjustment or transfer. */
export function useInvalidateStock() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.stockBalances });
    void queryClient.invalidateQueries({ queryKey: qk.stockItems });
    void queryClient.invalidateQueries({ queryKey: qk.dashboard });
    void queryClient.invalidateQueries({ queryKey: qk.notifications });
  };
}
