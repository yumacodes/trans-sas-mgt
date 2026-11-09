import { useState } from 'react';
import { toast } from 'sonner';
import { downloadFile, errorMessage, printFile } from '@/lib/api';

/** Print or download a record's PDF (`${base}/${id}/pdf`), tracking which button is busy. */
export function usePdfActions(base: string) {
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (mode: 'print' | 'download', record: { id: string; number: string }) => {
    setBusy(`${mode}:${record.id}`);
    try {
      if (mode === 'print') await printFile(`${base}/${record.id}/pdf`);
      else await downloadFile(`${base}/${record.id}/pdf`, `${record.number}.pdf`);
    } catch (error) {
      toast.error(errorMessage(error));
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
