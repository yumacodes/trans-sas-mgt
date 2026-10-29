/**
 * Spreadsheet exports.
 *
 * Everything the application exports is either a PDF or a real Excel workbook — never
 * CSV, which loses types and formatting and has to be coaxed into opening correctly.
 * Values keep their type here, so dates sort as dates and amounts stay numeric, and a
 * string cell is always stored as text: a value beginning with "=" is never treated as
 * a formula, which a CSV could not guarantee.
 *
 * The writer itself (~75 kB) is loaded only when someone actually exports.
 */

import type { CellObject as Cell } from 'write-excel-file/browser';

export type ExportValue = string | number | Date | boolean | null | undefined;

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => ExportValue;
  /** Column width in characters. */
  width?: number;
}

/** One already-laid-out row, for reports that are not a single flat table. */
export type ExportRow = ExportValue[];



function toCell(value: ExportValue, bold = false): Cell | null {
  if (value === null || value === undefined || value === '') return null;
  const weight = bold ? ({ fontWeight: 'bold' } as const) : {};
  if (value instanceof Date) return { value, type: Date, format: 'dd/mm/yyyy', ...weight };
  if (typeof value === 'number') return Number.isFinite(value) ? { value, type: Number, ...weight } : null;
  if (typeof value === 'boolean') return { value, type: Boolean, ...weight };
  return { value: String(value), type: String, ...weight };
}

function withExtension(filename: string) {
  return filename.replace(/\.(csv|xlsx?)$/i, '') + '.xlsx';
}

/** Laid-out cells for one sheet. Separated from the download so it can be tested. */
export type SheetData = (Cell | null)[][];

export function buildRowsSheet<T>(rows: T[], columns: ExportColumn<T>[]): SheetData {
  return [
    columns.map((c) => toCell(c.header, true)),
    ...rows.map((row) => columns.map((c) => toCell(c.value(row)))),
  ];
}

export function buildReportSheet(
  rows: ExportRow[],
  isBold: (row: ExportRow, index: number) => boolean,
): SheetData {
  return rows.map((row, i) => row.map((value) => toCell(value, isBold(row, i))));
}

async function write(
  data: SheetData,
  filename: string,
  opts: { sheet?: string; widths?: (number | undefined)[]; stickyRows?: number },
) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  await writeXlsxFile(data, {
    sheet: opts.sheet ?? 'Export',
    columns: opts.widths?.map((width) => (width ? { width } : {})) ?? [],
    stickyRowsCount: opts.stickyRows,
  }).toFile(withExtension(filename));
}

/** Downloads rows as a one-sheet workbook with a frozen header row. */
export async function downloadRowsExcel<T>(
  filename: string,
  rows: T[],
  columns: ExportColumn<T>[],
  sheet?: string,
) {
  await write(buildRowsSheet(rows, columns), filename, {
    sheet,
    widths: columns.map((c) => c.width ?? Math.max(12, Math.min(40, c.header.length + 6))),
    stickyRows: 1,
  });
}

/**
 * Downloads a report built as rows of values — section headings, blank spacer rows and
 * tables mixed together. A row given as a single-element array is treated as a heading.
 */
export async function downloadReportExcel(
  filename: string,
  rows: ExportRow[],
  opts: { sheet?: string; widths?: number[]; boldRows?: (row: ExportRow, index: number) => boolean } = {},
) {
  const isBold = opts.boldRows ?? ((row) => row.length === 1 && typeof row[0] === 'string');
  await write(buildReportSheet(rows, isBold), filename, { sheet: opts.sheet, widths: opts.widths });
}
