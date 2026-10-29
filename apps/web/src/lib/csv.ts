import { cell, downloadCsvText } from '@/features/dashboard/exportCsv';

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** Downloads the given rows as a CSV file (UTF-8 with BOM so Excel reads symbols correctly). */
export function downloadRowsCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const lines = [
    columns.map((c) => cell(c.header)).join(','),
    ...rows.map((r) => columns.map((c) => cell(c.value(r) ?? null)).join(',')),
  ];
  downloadCsvText(lines.join('\r\n'), filename);
}
