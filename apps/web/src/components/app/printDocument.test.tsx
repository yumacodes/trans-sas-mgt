import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttachmentDto } from '@tsm/shared';
import { mergeWithAttachments } from '@/lib/mergePdf';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), fetchPdfBlob: vi.fn(), printBlob: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { get: apiMock.get },
  fetchPdfBlob: apiMock.fetchPdfBlob,
  printBlob: apiMock.printBlob,
  errorMessage: (e: unknown) => String(e),
}));

const { PrintChoiceHost, printDocument } = await import('./printDocument');

async function pdfWithPages(pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}

// A 1×1 PNG.
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

const file = (name: string, mimeType: string, createdAt: string): AttachmentDto => ({
  id: name,
  name,
  mimeType,
  sizeBytes: 2048,
  uploadedBy: 'Staff',
  createdAt,
  url: `https://storage.test/${name}`,
});

const target = { path: '/proformas/p1/pdf', ownerType: 'proforma' as const, ownerId: 'p1', label: 'PF-2026-00001' };

async function pageCount(blob: Blob) {
  const bytes = await new Promise<ArrayBuffer>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
  return (await PDFDocument.load(bytes)).getPageCount();
}

beforeEach(async () => {
  vi.clearAllMocks();
  const doc = await pdfWithPages(1);
  apiMock.fetchPdfBlob.mockResolvedValue(new Blob([doc as BlobPart], { type: 'application/pdf' }));
  const attachedPdf = await pdfWithPages(2);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('.pdf')) return new Response(attachedPdf as BlobPart);
      if (url.endsWith('.png')) return new Response(PNG);
      return new Response('nope', { status: 404 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('mergeWithAttachments', () => {
  it('appends attached PDFs page for page and gives each image its own page', async () => {
    const doc = new Blob([(await pdfWithPages(1)) as BlobPart]);
    const { blob, skipped } = await mergeWithAttachments(doc, [
      { name: 'award.pdf', mimeType: 'application/pdf', url: 'https://storage.test/award.pdf' },
      { name: 'stamp.png', mimeType: 'image/png', url: 'https://storage.test/stamp.png' },
    ]);
    expect(skipped).toEqual([]);
    expect(await pageCount(blob)).toBe(1 + 2 + 1);
  });

  it('leaves out a file it cannot download and says which one', async () => {
    const doc = new Blob([(await pdfWithPages(1)) as BlobPart]);
    const { blob, skipped } = await mergeWithAttachments(doc, [
      { name: 'gone.jpg', mimeType: 'image/jpeg', url: 'https://storage.test/gone.jpg' },
      { name: 'award.pdf', mimeType: 'application/pdf', url: 'https://storage.test/award.pdf' },
    ]);
    expect(skipped.map((s) => s.name)).toEqual(['gone.jpg']);
    expect(await pageCount(blob)).toBe(3);
  });
});

describe('printDocument', () => {
  it('prints straight away, without asking, when the record has no files', async () => {
    apiMock.get.mockResolvedValue([]);
    render(<PrintChoiceHost />);
    await act(() => printDocument(target));
    expect(screen.queryByText('Print the attached files too?')).toBeNull();
    expect(apiMock.printBlob).toHaveBeenCalledTimes(1);
    expect(await pageCount(apiMock.printBlob.mock.calls[0]![0])).toBe(1);
  });

  it('still prints the document when its files cannot be listed', async () => {
    apiMock.get.mockRejectedValue(new Error('offline'));
    render(<PrintChoiceHost />);
    await act(() => printDocument(target));
    expect(apiMock.printBlob).toHaveBeenCalledTimes(1);
  });

  it('asks first, then prints the files after the document, oldest first', async () => {
    apiMock.get.mockResolvedValue([
      file('stamp.png', 'image/png', '2026-11-20T10:00:00Z'),
      file('award.pdf', 'application/pdf', '2026-11-19T10:00:00Z'),
    ]);
    render(<PrintChoiceHost />);
    let done!: Promise<void>;
    act(() => {
      done = printDocument(target);
    });

    expect(await screen.findByText('Print the attached files too?')).toBeTruthy();
    const listed = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(listed[0]).toContain('award.pdf');
    expect(apiMock.printBlob).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Print with files' }));
    await act(() => done);
    expect(await pageCount(apiMock.printBlob.mock.calls[0]![0])).toBe(1 + 2 + 1);
  });

  it('prints only the document when the user says so, and nothing on cancel', async () => {
    apiMock.get.mockResolvedValue([file('award.pdf', 'application/pdf', '2026-11-19T10:00:00Z')]);
    render(<PrintChoiceHost />);

    let done!: Promise<void>;
    act(() => {
      done = printDocument(target);
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Document only' }));
    await act(() => done);
    expect(await pageCount(apiMock.printBlob.mock.calls[0]![0])).toBe(1);

    act(() => {
      done = printDocument(target);
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await act(() => done);
    await waitFor(() => expect(apiMock.printBlob).toHaveBeenCalledTimes(1));
  });
});
