import { useState } from 'react';
import type { AttachmentOwnerType } from '@tsm/shared';
import { reportFailure } from './OperationFeedback';
import { printDocument } from './printDocument';
import { downloadFile, errorMessage, printFile } from '@/lib/api';

/** Which record's Files tab belongs to each PDF route, so Print can offer its attachments. */
const OWNER_BY_BASE: Record<string, AttachmentOwnerType> = {
  '/proformas': 'proforma',
  '/tenders': 'tender',
  '/acceptance-letters': 'acceptance',
  '/sales': 'sale',
  '/waybills': 'waybill',
  '/payments': 'payment',
  '/purchases': 'purchase',
  '/expenses': 'expense',
};

/**
 * Print or download a record's PDF (`${base}/${id}/pdf`), tracking which button is busy.
 * Printing a record that has attached files first asks whether to print them too.
 */
export function usePdfActions(base: string) {
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (mode: 'print' | 'download', record: { id: string; number: string }) => {
    setBusy(`${mode}:${record.id}`);
    try {
      const ownerType = OWNER_BY_BASE[base];
      if (mode === 'print' && ownerType) {
        await printDocument({ path: `${base}/${record.id}/pdf`, ownerType, ownerId: record.id, label: record.number });
      } else if (mode === 'print') await printFile(`${base}/${record.id}/pdf`);
      else await downloadFile(`${base}/${record.id}/pdf`, `${record.number}.pdf`);
    } catch (error) {
      reportFailure(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  return {
    isBusy: (mode: 'print' | 'download', id: string) => busy === `${mode}:${id}`,
    print: (record: { id: string; number: string }) => act('print', record),
    download: (record: { id: string; number: string }) => act('download', record),
  };
}
