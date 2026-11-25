/**
 * Joins a document's PDF with its attached files, in the browser, for printing.
 *
 * Done client-side on purpose: attachments can be 10 MB each, and a merged file sent back
 * from the API would exceed the hosting platform's response size limit. Attachments are
 * only ever PDF, PNG, JPEG or WebP (the API checks the file contents on upload).
 *
 * Attached PDFs are appended page for page. Each image gets its own A4 page, scaled to fit
 * inside the margins, turned landscape when the image is wider than it is tall, with the
 * file name printed small at the top so loose pages can be matched to their record.
 */

export interface MergeSource {
  name: string;
  mimeType: string;
  url: string | null;
}

export interface MergeResult {
  blob: Blob;
  /** Files that couldn't be added, with the reason. */
  skipped: { name: string; reason: string }[];
}

const A4 = { short: 595.28, long: 841.89 };
const MARGIN = 36;
const CAPTION = 14;

/** Reads a Blob's bytes; FileReader covers environments whose Blob lacks arrayBuffer(). */
function bytesOf(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** WebP can't be embedded directly; redraw it as a JPEG through a canvas. */
async function webpToJpeg(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  // Transparent areas print white, not black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('could not convert image');
  return bytesOf(blob);
}

export async function mergeWithAttachments(document: Blob, files: MergeSource[]): Promise<MergeResult> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const out = await PDFDocument.load(await bytesOf(document));
  const font = await out.embedFont(StandardFonts.Helvetica);
  const skipped: MergeResult['skipped'] = [];

  for (const file of files) {
    try {
      if (!file.url) throw new Error('no link');
      const res = await fetch(file.url);
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const bytes = await res.arrayBuffer();

      if (file.mimeType === 'application/pdf') {
        let source;
        try {
          source = await PDFDocument.load(bytes);
        } catch {
          skipped.push({ name: file.name, reason: 'it is password-protected or damaged' });
          continue;
        }
        const pages = await out.copyPages(source, source.getPageIndices());
        pages.forEach((page) => out.addPage(page));
        continue;
      }

      const image =
        file.mimeType === 'image/png'
          ? await out.embedPng(bytes)
          : file.mimeType === 'image/jpeg'
            ? await out.embedJpg(bytes)
            : file.mimeType === 'image/webp'
              ? await out.embedJpg(await webpToJpeg(bytes))
              : null;
      if (!image) {
        skipped.push({ name: file.name, reason: 'this file type cannot be printed' });
        continue;
      }

      const landscape = image.width > image.height;
      const [width, height] = landscape ? [A4.long, A4.short] : [A4.short, A4.long];
      const page = out.addPage([width, height]);
      const boxW = width - MARGIN * 2;
      const boxH = height - MARGIN * 2 - CAPTION;
      // Never enlarge a small image past its natural size; shrink large ones to fit.
      const scale = Math.min(boxW / image.width, boxH / image.height, 1);
      const w = image.width * scale;
      const h = image.height * scale;
      page.drawText(file.name.slice(0, 120), { x: MARGIN, y: height - MARGIN + 2, size: 8, font, color: rgb(0.45, 0.47, 0.55) });
      page.drawImage(image, { x: (width - w) / 2, y: MARGIN + (boxH - h) / 2, width: w, height: h });
    } catch {
      skipped.push({ name: file.name, reason: "it couldn't be downloaded" });
    }
  }

  const bytes = await out.save();
  return { blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), skipped };
}
