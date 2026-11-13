import { useEffect, useRef, useState } from 'react';
import { FileDown, Printer } from 'lucide-react';
import { reportFailure } from '@/components/app/OperationFeedback';
import { ErrorState } from '@/components/app/States';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadFile, errorMessage, fetchPdfUrl, printFile } from '@/lib/api';

interface Props {
  /** API path of the PDF, e.g. `/proformas/<id>/pdf`; null keeps the dialog closed. */
  path: string | null;
  title: string;
  fileName: string;
  onClose: () => void;
}

/** Shows a document's PDF as it will print, with Print and Download beside it. */
export function PdfPreviewDialog({ path, title, fileName, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!path) return;
    let live = true;
    let made: string | null = null;
    setUrl(null);
    setError(null);
    fetchPdfUrl(path)
      .then((u) => {
        made = u;
        if (live) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [path, attempt]);

  const print = async () => {
    try {
      const win = frame.current?.contentWindow;
      if (win && url) {
        win.focus();
        win.print();
      } else if (path) {
        await printFile(path);
      }
    } catch {
      // Some browsers block printing a framed PDF; open it in the print dialog another way.
      try {
        if (path) await printFile(path);
      } catch (e) {
        reportFailure(errorMessage(e));
      }
    }
  };

  const download = async () => {
    try {
      if (path) await downloadFile(path, fileName);
    } catch (e) {
      reportFailure(errorMessage(e));
    }
  };

  return (
    <Dialog open={Boolean(path)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Preview of the PDF exactly as it will print.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => void download()} disabled={!url}>
              <FileDown aria-hidden /> Download
            </Button>
            <Button onClick={() => void print()} disabled={!url}>
              <Printer aria-hidden /> Print
            </Button>
          </div>
          {error ? (
            <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />
          ) : url ? (
            <iframe ref={frame} src={url} title={title} className="h-[70vh] w-full rounded-lg border border-border bg-white" />
          ) : (
            <Skeleton className="h-[70vh] w-full" />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
