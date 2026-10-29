import { describe, expect, it } from 'vitest';
import { buildReportSheet, buildRowsSheet, type ExportColumn } from './exportExcel';

interface Client {
  code: string;
  name: string;
  owed: number;
  since: Date;
  phone: string | null;
}

const columns: ExportColumn<Client>[] = [
  { header: 'Code', value: (c) => c.code },
  { header: 'Name', value: (c) => c.name },
  { header: 'Outstanding', value: (c) => c.owed },
  { header: 'Client since', value: (c) => c.since },
  { header: 'Telephone', value: (c) => c.phone },
];

const client: Client = {
  code: 'CL-001',
  name: '=cmd|/c calc',
  owed: 1250.5,
  since: new Date('2026-02-03T00:00:00Z'),
  phone: null,
};

describe('spreadsheet export', () => {
  it('keeps each value in its own type and leaves blanks empty', () => {
    const [header, row] = buildRowsSheet([client], columns);

    expect(header?.every((c) => c?.fontWeight === 'bold')).toBe(true);
    expect(row?.[0]).toMatchObject({ value: 'CL-001', type: String });
    expect(row?.[2]).toMatchObject({ value: 1250.5, type: Number });
    expect(row?.[3]).toMatchObject({ value: client.since, type: Date });
    expect(row?.[4]).toBeNull();
  });

  it('stores a leading "=" as text, so an exported value is never a formula', () => {
    const [, row] = buildRowsSheet([client], columns);
    expect(row?.[1]).toEqual({ value: '=cmd|/c calc', type: String });
  });

  it('emits section headings in bold and keeps spacer rows empty', () => {
    const sheet = buildReportSheet(
      [['Key figures'], [], ['Measure', 'Value'], ['Sales', 4280000]],
      (row) => row.length === 1 && typeof row[0] === 'string',
    );

    expect(sheet[0]?.[0]).toMatchObject({ value: 'Key figures', fontWeight: 'bold' });
    expect(sheet[1]).toEqual([]);
    expect(sheet[2]?.[0]?.fontWeight).toBeUndefined();
    expect(sheet[3]?.[1]).toMatchObject({ value: 4280000, type: Number });
  });

  it('writes a real .xlsx workbook from those cells', async () => {
    const { default: writeXlsxFile } = await import('write-excel-file/node');
    const buffer = await writeXlsxFile(buildRowsSheet([client], columns), {
      sheet: 'Clients',
      columns: columns.map(() => ({ width: 16 })),
      stickyRowsCount: 1,
    }).toBuffer();

    // An .xlsx is a zip: the archive signature proves a real workbook was produced.
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
