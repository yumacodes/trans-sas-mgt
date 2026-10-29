import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { downloadRowsCsv, type CsvColumn } from '@/lib/csv';
import type { BulkAction } from './DataTable';

/** Bulk action that downloads the selected rows as a CSV file. */
export function exportAction<T>(noun: string, filename: string, columns: CsvColumn<T>[]): BulkAction<T> {
  return {
    label: 'Export',
    icon: <Download aria-hidden />,
    onSelect: (rows, clear) => {
      downloadRowsCsv(filename, rows, columns);
      toast.success(`Exported ${rows.length} ${noun}${rows.length === 1 ? '' : 's'}`);
      clear();
    },
  };
}
