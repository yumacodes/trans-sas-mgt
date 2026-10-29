import type { DocumentNumbering, DocumentType } from '@tsm/shared';
import type { Tx } from '../lib/prisma';
import { getCompanySettings } from './company-settings';

export function formatDocumentNumber(
  numbering: DocumentNumbering,
  docType: DocumentType,
  year: number,
  value: number,
): string {
  const seq = String(value).padStart(numbering.padding, '0');
  const prefix = numbering.prefixes[docType];
  return numbering.includeYear ? `${prefix}-${year}-${seq}` : `${prefix}-${seq}`;
}

/**
 * Allocate the next business document number. The counter row is incremented with an
 * upsert inside the caller's transaction, which holds its row lock until commit: two
 * concurrent documents can never share a number, and a rolled-back document leaves
 * no gap.
 */
export async function nextDocumentNumber(
  tx: Tx,
  docType: DocumentType,
  opts: { scopeKey?: string; date?: Date } = {},
): Promise<string> {
  const { numbering } = await getCompanySettings(tx);
  const year = numbering.includeYear ? (opts.date ?? new Date()).getUTCFullYear() : 0;
  const scopeKey = opts.scopeKey ?? 'global';

  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO document_sequences (id, "docType", "scopeKey", year, "nextValue", "updatedAt")
    VALUES (gen_random_uuid(), ${docType}, ${scopeKey}, ${year}, 2, now())
    ON CONFLICT ("docType", "scopeKey", year)
    DO UPDATE SET "nextValue" = document_sequences."nextValue" + 1, "updatedAt" = now()
    RETURNING "nextValue" - 1 AS value`;
  const value = Number(rows[0]?.value);
  if (!Number.isInteger(value) || value < 1) throw new Error('document sequence returned no value');
  return formatDocumentNumber(numbering, docType, year, value);
}
