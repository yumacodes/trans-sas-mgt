import { useState } from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import { PROFORMA_EMAIL_MAX_FILES, PROFORMA_EMAIL_MAX_FILE_BYTES } from '@tsm/shared';
import { useAuth } from '@/auth/AuthProvider';
import { Field } from '@/components/app/form';
import { useOperation } from '@/components/app/OperationFeedback';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

interface Props {
  /** e.g. `/sales/123`; the message is posted to `${path}/email`. */
  path: string;
  number: string;
  /** What the PDF is, for the attach checkbox ("invoice", "receipt"…). */
  documentLabel: string;
  recipientName: string;
  defaultTo?: string | null;
  defaultSubject: string;
  /** Opening line of the message, after "Dear …,". */
  intro: string;
}

/** Writes and sends an email about a document, with its PDF attached by default. */
export function DocumentEmailComposer({ path, number, documentLabel, recipientName, defaultTo, defaultSubject, intro }: Props) {
  const { me } = useAuth();
  const { run } = useOperation();
  const [to, setTo] = useState(defaultTo ?? '');
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(`Dear ${recipientName},\n\n${intro}\n\nKind regards,\n${me?.user.fullName ?? ''}`);
  const [attachPdf, setAttachPdf] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<string | null>(null);

  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files, ...Array.from(picked)];
    if (next.length > PROFORMA_EMAIL_MAX_FILES) {
      setErrors({ files: `Attach up to ${PROFORMA_EMAIL_MAX_FILES} files.` });
      return;
    }
    const tooBig = next.find((f) => f.size > PROFORMA_EMAIL_MAX_FILE_BYTES);
    if (tooBig) {
      setErrors({ files: `"${tooBig.name}" is larger than ${fileSize(PROFORMA_EMAIL_MAX_FILE_BYTES)}.` });
      return;
    }
    setErrors({});
    setFiles(next);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(to.trim())) found.to = 'Enter a valid email address.';
    if (!subject.trim()) found.subject = 'Subject is required.';
    if (!body.trim()) found.body = 'Write a message.';
    setErrors(found);
    if (Object.keys(found).length) return;

    const data = new FormData();
    data.set('to', to.trim());
    data.set('subject', subject.trim());
    data.set('body', body);
    data.set('attachInvoice', String(attachPdf));
    for (const f of files) data.append('files', f);
    const recipient = to.trim();
    setFiles([]);
    setSent(null);
    try {
      await run(() => api.upload(`${path}/email`, data));
      // Shown only once the mail server has accepted the message.
      setSent(recipient);
    } catch {
      // The error dialog already explained the failure.
    }
  };

  return (
    <form onSubmit={send} noValidate className="space-y-4">
      <Field label="To" error={errors.to} required>
        <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} />
      </Field>
      <Field label="Subject" error={errors.subject} required>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Message" error={errors.body} required>
        <Textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={attachPdf} onCheckedChange={(v) => setAttachPdf(v === true)} />
        Attach the {documentLabel} PDF ({number}.pdf)
      </label>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Button asChild variant="secondary" size="sm">
            <label className="cursor-pointer">
              <Paperclip aria-hidden /> Add files
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </Button>
          <span className="text-xs text-ink-subtle">
            Up to {PROFORMA_EMAIL_MAX_FILES} files, {fileSize(PROFORMA_EMAIL_MAX_FILE_BYTES)} each
          </span>
        </div>
        {errors.files && (
          <p role="alert" className="text-xs text-danger">
            {errors.files}
          </p>
        )}
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-1.5 text-sm">
                <span className="truncate">
                  {f.name} <span className="text-xs text-ink-subtle">{fileSize(f.size)}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  className="text-ink-subtle hover:text-ink"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">
          <Send aria-hidden /> Send email
        </Button>
        {sent && (
          <p role="status" className="text-sm text-success">
            Sent to {sent}.
          </p>
        )}
      </div>
    </form>
  );
}
