import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { downloadRowsExcel, type ExportColumn } from '@/lib/exportExcel';
import type { BulkAction } from './DataTable';

/** Bulk action that downloads the selected rows as an Excel workbook. */
export function exportAction<T>(
  noun: string,
  filename: string,
  columns: ExportColumn<T>[],
): BulkAction<T> {
  return {
    label: 'Export',
    icon: <Download aria-hidden />,
    onSelect: (rows, clear) => {
      void downloadRowsExcel(filename, rows, columns)
        .then(() => {
          toast.success(`Exported ${rows.length} ${noun}${rows.length === 1 ? '' : 's'}`);
          clear();
        })
        .catch(() => {
          toast.error("We couldn't prepare that download. Try again in a moment.");
        });
    },
  };
}
