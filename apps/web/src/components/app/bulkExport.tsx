import { Download } from 'lucide-react';
import { downloadRowsExcel, type ExportColumn } from '@/lib/exportExcel';
import type { BulkAction } from './DataTable';
import { reportFailure } from './OperationFeedback';

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
        .then(clear)
        .catch(() => {
          reportFailure("We couldn't prepare that download. Try again in a moment.");
        });
    },
  };
}
