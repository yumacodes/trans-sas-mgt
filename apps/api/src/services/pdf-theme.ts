import type PDFDocument from 'pdfkit';
import type { PdfCompany } from './proforma-pdf';

/** Shared look for every generated document (proforma, expense, tender schedule, letter). */
export const PDF_COLORS = {
  /** Header band, table heads and the total box. */
  NAVY: '#3a44b3',
  ACCENT: '#6470dc',
  /** Secondary text printed on the header band. */
  ON_NAVY: '#dde0fb',
  MUTED: '#667085',
  RULE: '#e4e7ec',
  SHADE: '#f2f3fc',
  INK: '#1d2939',
} as const;

type Doc = InstanceType<typeof PDFDocument>;

export const amountFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const quantityFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
export const money = (value: string, currency: string) => `${currency} ${amountFormat.format(Number(value))}`;
export const longDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export function collect(doc: Doc): Promise<Buffer> {
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

/** Layout for landscape documents, which have less height to spare. */
export interface Compact {
  compact?: boolean;
}

/** Blue header band with the company name (left) and document title (right). */
export function headerBand(doc: Doc, company: PdfCompany, title: string, subtitle?: string, { compact }: Compact = {}) {
  const { NAVY, ACCENT, ON_NAVY } = PDF_COLORS;
  const pageW = doc.page.width;
  const left = 40;
  const width = pageW - 80;
  const bandH = compact ? 76 : 104;
  const titleY = compact ? 22 : 32;
  doc.rect(0, 0, pageW, bandH).fill(NAVY);
  doc.rect(0, bandH, pageW, 4).fill(ACCENT);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(compact ? 17 : 19).text(company.name.toUpperCase(), left, titleY - 2, { width: width * 0.62 });
  if (company.tagline) {
    doc.fillColor(ON_NAVY).font('Helvetica').fontSize(8.5).text(company.tagline, left, doc.y + 3, { width: width * 0.62 });
  }
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17).text(title, left, titleY, { width, align: 'right', characterSpacing: 1 });
  if (subtitle) {
    doc.fillColor(ON_NAVY).font('Helvetica').fontSize(10).text(subtitle, left, titleY + 22, { width, align: 'right', characterSpacing: 2 });
  }
}

/**
 * Company contact lines on the left and label/value pairs on the right, starting under the
 * header band. Returns where each column ends and `bottom`, below the taller of the two.
 */
export function contactAndMeta(doc: Doc, company: PdfCompany, meta: [string, string][], { compact }: Compact = {}) {
  const { MUTED, INK } = PDF_COLORS;
  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;
  const top = compact ? 96 : 128;
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5);
  company.lines.forEach((line, i) => {
    doc.text(line, left, i === 0 ? top : doc.y, { width: width * 0.5, lineGap: 1 });
  });
  const leftBottom = company.lines.length ? doc.y : top;
  const metaX = left + width * 0.58;
  const metaW = right - metaX;
  let my = top;
  for (const [label, value] of meta) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label.toUpperCase(), metaX, my + 1, { width: 90, characterSpacing: 0.5 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(value, metaX + 92, my, { width: metaW - 92, align: 'right' });
    my = Math.max(my + (compact ? 14 : 17), doc.y + 3);
  }
  return { bottom: Math.max(leftBottom, my) + 16, leftBottom, metaBottom: my, metaX };
}

/** Shaded card with an accent edge: a small caps label, a bold name and detail lines. */
export function partyCard(doc: Doc, y: number, label: string, name: string, details: string[], width?: number) {
  const { ACCENT, NAVY, INK, SHADE } = PDF_COLORS;
  const left = 40;
  const w = width ?? doc.page.width - 80;
  doc.font('Helvetica-Bold').fontSize(11.5);
  const nameH = doc.heightOfString(name, { width: w - 28 });
  doc.font('Helvetica').fontSize(9);
  const detailH = details.reduce((h, d) => h + doc.heightOfString(d, { width: w - 28 }) + 1, 0);
  const cardH = 22 + nameH + detailH + 12;
  doc.roundedRect(left, y, w, cardH, 4).fill(SHADE);
  doc.rect(left, y, 3, cardH).fill(ACCENT);
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(7.5).text(label, left + 14, y + 10, { characterSpacing: 1 });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11.5).text(name, left + 14, y + 22, { width: w - 28 });
  doc.fillColor(INK).font('Helvetica').fontSize(9);
  for (const line of details) doc.text(line, left + 14, doc.y + 1, { width: w - 28 });
  return y + cardH;
}

/**
 * Where signature lines go: the foot of the page when the content leaves it free, otherwise
 * straight after the content, and only on a new page when neither fits.
 */
export function signatureY(doc: Doc, contentBottom: number, height = 34) {
  const pageH = doc.page.height;
  const foot = pageH - 118;
  if (contentBottom <= foot - 10) return foot;
  const inline = contentBottom + 26;
  if (inline + height <= pageH - 56) return inline;
  doc.addPage();
  return foot;
}

/** Footer rule, company line and page numbers on every page. */
export function footers(doc: Doc, company: PdfCompany, note?: string) {
  const { MUTED, RULE } = PDF_COLORS;
  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // The footer sits inside the bottom margin; without this PDFKit starts a new page for it.
    doc.page.margins.bottom = 0;
    const pageH = doc.page.height;
    doc.moveTo(left, pageH - 48).lineTo(right, pageH - 48).strokeColor(RULE).lineWidth(0.75).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5);
    doc.text(company.footer ?? company.name, left, pageH - 40, { width: width - 70, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, right - 60, pageH - 40, { width: 60, align: 'right', lineBreak: false });
    if (note) doc.text(note, left, pageH - 29, { width, lineBreak: false });
  }
}
