import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import type { ImportResultDto } from '@tsm/shared';
import { FormDialog } from '@/components/app/dialogs';
import { useOperation } from '@/components/app/OperationFeedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogBody, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { downloadRowsExcel } from '@/lib/exportExcel';

export interface ImportColumn {
  /** Field name sent to the server. */
  key: string;
  /** Column heading in the template and the file. */
  header: string;
  required?: boolean;
  example: string | number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Server import, under /imports. */
  endpoint: string;
  columns: ImportColumn[];
  templateName: string;
  /** Query keys to refresh once rows are saved. */
  invalidate: readonly (readonly unknown[])[];
}

const MAX_BYTES = 5 * 1024 * 1024;
const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Reusable spreadsheet import: choose a file, see which columns were recognised, have the
 * server check every row, review problems (and download them), then save the valid rows.
 */
export function ImportDialog({ open, onOpenChange, title, description, endpoint, columns, templateName, invalidate }: Props) {
  const queryClient = useQueryClient();
  const { run } = useOperation();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [check, setCheck] = useState<ImportResultDto | null>(null);
  const [checking, setChecking] = useState(false);

  const reset = () => {
    setFileName(null);
    setRows([]);
    setMatched([]);
    setProblem(null);
    setCheck(null);
  };

  const downloadTemplate = () =>
    downloadRowsExcel(`${templateName}-template.xlsx`, [Object.fromEntries(columns.map((c) => [c.key, c.example]))], columns.map((c) => ({
      header: c.header,
      value: (r: Record<string, string | number>) => r[c.key],
      width: Math.max(14, c.header.length + 2),
    })));

  const read = async (file: File) => {
    reset();
    if (!/\.xlsx$/i.test(file.name)) return setProblem('Choose an Excel file (.xlsx). Download the template to see the layout.');
    if (file.size > MAX_BYTES) return setProblem('The file is larger than 5 MB. Split it into smaller files.');
    try {
      const { readSheet } = await import('read-excel-file/browser');
      const sheet = await readSheet(file);
      const [header, ...body] = sheet;
      if (!header || body.length === 0) return setProblem('The first sheet has no data rows under its heading row.');
      const byHeader = new Map(columns.map((c) => [normalise(c.header), c.key]));
      const keys = header.map((h) => byHeader.get(normalise(String(h ?? ''))) ?? null);
      const missing = columns.filter((c) => c.required && !keys.includes(c.key));
      if (missing.length) return setProblem(`These required columns are missing: ${missing.map((c) => c.header).join(', ')}.`);
      const parsed = body
        .filter((r) => r.some((v) => v !== null && String(v).trim() !== ''))
        .map((r) =>
          Object.fromEntries(
            keys.flatMap((k, i) => {
              if (!k) return [];
              const v = r[i];
              return [[k, v instanceof Date ? v.toISOString().slice(0, 10) : v]];
            }),
          ),
        );
      setFileName(file.name);
      setMatched(columns.filter((c) => keys.includes(c.key)).map((c) => c.header));
      setRows(parsed);
      setChecking(true);
      try {
        setCheck(await api.post<ImportResultDto>(`/imports/${endpoint}`, { rows: parsed, commit: false }));
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "The rows couldn't be checked. Try again.");
      } finally {
        setChecking(false);
      }
    } catch {
      setProblem("This file couldn't be read. Save it again as an Excel workbook (.xlsx) and retry.");
    }
  };

  const downloadProblems = () => {
    if (!check) return;
    const bad = check.results.filter((r) => r.status !== 'valid');
    void downloadRowsExcel(
      `${templateName}-problems.xlsx`,
      bad.map((r) => ({ ...rows[r.row - 2], __row: r.row, __problem: r.message })),
      [
        { header: 'Row', value: (r: Record<string, unknown>) => Number(r.__row), width: 8 },
        { header: 'Problem', value: (r: Record<string, unknown>) => String(r.__problem ?? ''), width: 50 },
        ...columns.map((c) => ({ header: c.header, value: (r: Record<string, unknown>) => (r[c.key] as string | number | undefined) ?? '' })),
      ],
    );
  };

  const commit = async () => {
    if (!check || check.valid === 0) return;
    onOpenChange(false);
    try {
      await run(() => api.post<ImportResultDto>(`/imports/${endpoint}`, { rows, commit: true }), { blocking: true, pending: 'Importing…', success: `${check.valid} row(s) imported` });
      for (const key of invalidate) void queryClient.invalidateQueries({ queryKey: key });
    } catch {
      // The error dialog already explained the failure; nothing was saved.
    }
    reset();
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      isDirty={false}
      size="lg"
      title={title}
      description={description}
    >
      <DialogBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <label className="cursor-pointer">
              <Upload aria-hidden /> Choose spreadsheet
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void read(f);
                }}
              />
            </label>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void downloadTemplate()}>
            <Download aria-hidden /> Download template
          </Button>
        </div>
        <p className="text-xs text-ink-subtle">
          Columns: {columns.map((c) => `${c.header}${c.required ? ' (required)' : ''}`).join(', ')}. Up to 1,000 rows.
        </p>
        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
        {fileName && (
          <div className="flex items-center gap-2 text-sm text-ink">
            <FileSpreadsheet className="size-4 text-ink-muted" aria-hidden /> {fileName}: {rows.length} row(s), columns
            recognised: {matched.join(', ')}
          </div>
        )}
        {checking && <p className="text-sm text-ink-muted">Checking every row…</p>}
        {check && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="success" dot>
                {check.valid} ready
              </Badge>
              <Badge tone="danger" dot>
                {check.invalid} with problems
              </Badge>
              <Badge tone="warning" dot>
                {check.duplicates} duplicate(s)
              </Badge>
            </div>
            {check.results.some((r) => r.status !== 'valid') && (
              <>
                <ul className="max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-border p-3 text-sm">
                  {check.results
                    .filter((r) => r.status !== 'valid')
                    .slice(0, 100)
                    .map((r) => (
                      <li key={r.row}>
                        <span className="font-medium">Row {r.row}:</span> <span className="text-ink-muted">{r.message}</span>
                      </li>
                    ))}
                </ul>
                <Button variant="ghost" size="sm" onClick={downloadProblems}>
                  <Download aria-hidden /> Download the rows with problems
                </Button>
              </>
            )}
            <p className="text-xs text-ink-subtle">Rows with problems and duplicates are skipped; nothing else is changed.</p>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary">Cancel</Button>
        </DialogClose>
        <Button disabled={!check || check.valid === 0} onClick={() => void commit()}>
          Import {check?.valid ?? 0} row(s)
        </Button>
      </DialogFooter>
    </FormDialog>
  );
}
