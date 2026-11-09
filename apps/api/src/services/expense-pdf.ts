import PDFDocument from 'pdfkit';
import { PDF_COLORS, signatureY } from './pdf-theme';
import {
  EXPENSE_KIND_LABELS,
  EXPENSE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type ExpenseDto,
} from '@tsm/shared';
import type { PdfCompany } from './proforma-pdf';

const { NAVY, ACCENT, ON_NAVY, MUTED, RULE, SHADE, INK } = PDF_COLORS;

const amountFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (value: string, currency: string) => `${currency} ${amountFormat.format(Number(value))}`;
const longDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** Who the counterparty is, from the company's point of view. */
const PARTY_LABEL: Record<ExpenseDto['kind'], string> = {
  general: 'PAID TO',
  tender_in: 'RECEIVED FROM',
  tender_out: 'PAID TO',
};

/** Render an expense or tender transaction as a one-page A4 invoice. */
export function renderExpensePdf(expense: ExpenseDto, company: PdfCompany): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
    info: { Title: `${EXPENSE_KIND_LABELS[expense.kind]} ${expense.number}`, Author: company.name },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const left = 40;
  const right = pageW - 40;
  const width = right - left;

  // Header band
  doc.rect(0, 0, pageW, 104).fill(NAVY);
  doc.rect(0, 104, pageW, 4).fill(ACCENT);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(19).text(company.name.toUpperCase(), left, 30, { width: width * 0.62 });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17).text('INVOICE', left, 32, { width, align: 'right', characterSpacing: 1 });
  doc
    .fillColor(ON_NAVY)
    .font('Helvetica')
    .fontSize(10)
    .text(EXPENSE_KIND_LABELS[expense.kind].toUpperCase(), left, 54, { width, align: 'right', characterSpacing: 2 });

  // Company contact (left) and document meta (right)
  const top = 128;
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5);
  company.lines.forEach((line, i) => {
    doc.text(line, left, i === 0 ? top : doc.y, { width: width * 0.5, lineGap: 1 });
  });
  const leftBottom = company.lines.length ? doc.y : top;

  const metaX = left + width * 0.58;
  const metaW = right - metaX;
  const meta: [string, string][] = [
    ['Reference', expense.number],
    ['Date', longDate(expense.transactionDate)],
    ['Currency', expense.currency],
    ['Status', EXPENSE_STATUS_LABELS[expense.status]],
  ];
  let my = top;
  for (const [label, value] of meta) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label.toUpperCase(), metaX, my + 1, { width: 70, characterSpacing: 0.5 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(value, metaX + 72, my, { width: metaW - 72, align: 'right' });
    my += 17;
  }
  let y = Math.max(leftBottom, my) + 16;

  // Counterparty card
  const party = expense.counterparty ?? 'Not specified';
  const partyLines = [expense.branch ? `Branch: ${expense.branch.code} — ${expense.branch.name}` : null].filter(
    (l): l is string => Boolean(l),
  );
  const cardH = 38 + partyLines.length * 12 + 8;
  doc.roundedRect(left, y, width, cardH, 4).fill(SHADE);
  doc.rect(left, y, 3, cardH).fill(ACCENT);
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(7.5).text(PARTY_LABEL[expense.kind], left + 14, y + 10, { characterSpacing: 1 });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11.5).text(party, left + 14, y + 22, { width: width - 28 });
  doc.fillColor(INK).font('Helvetica').fontSize(9);
  for (const line of partyLines) doc.text(line, left + 14, doc.y + 1, { width: width - 28 });
  y += cardH + 20;

  // Details table
  const rows: [string, string][] = [
    ['Category', expense.category],
    ...(expense.tenderReference ? ([['Tender reference', expense.tenderReference]] as [string, string][]) : []),
    ['Payment method', PAYMENT_METHOD_LABELS[expense.paymentMethod]],
    ...(expense.paymentReference ? ([['Payment reference', expense.paymentReference]] as [string, string][]) : []),
    ['Recorded by', expense.recordedBy],
    ...(expense.approvedBy ? ([['Approved by', expense.approvedBy]] as [string, string][]) : []),
  ];
  doc.rect(left, y, width, 24).fill(NAVY);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  doc.text('DETAIL', left + 10, y + 8.5, { width: 160 });
  doc.text('VALUE', left + 170, y + 8.5, { width: width - 180 });
  y += 24;
  rows.forEach(([label, value], i) => {
    doc.font('Helvetica').fontSize(9.5);
    const rowH = Math.max(doc.heightOfString(value, { width: width - 180 }), 12) + 14;
    if (i % 2 === 1) doc.rect(left, y, width, rowH).fill(SHADE);
    doc.fillColor(MUTED).text(label, left + 10, y + 7, { width: 150 });
    doc.fillColor(INK).text(value, left + 170, y + 7, { width: width - 180 });
    y += rowH;
  });
  doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).lineWidth(1).stroke();
  y += 16;

  // Description (left) and total (right)
  const boxW = 230;
  const boxX = right - boxW;
  doc.roundedRect(boxX, y, boxW, 34, 4).fill(NAVY);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5).text('TOTAL', boxX + 10, y + 12.5, { width: 80 });
  doc.fontSize(12.5).text(money(expense.amount, expense.currency), boxX + 70, y + 11, { width: boxW - 80, align: 'right' });
  let bottom = y + 34;
  if (expense.description) {
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(7.5).text('DESCRIPTION', left, y, { characterSpacing: 1 });
    doc.fillColor(INK).font('Helvetica').fontSize(9).text(expense.description, left, doc.y + 4, { width: boxX - left - 20 });
    bottom = Math.max(bottom, doc.y);
  }
  if (expense.statusReason) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(`Status note: ${expense.statusReason}`, left, bottom + 12, { width });
    bottom = doc.y;
  }

  // Signatures at the foot of the page
  const sigY = signatureY(doc, bottom);
  const sigW = 190;
  const sig = (x: number, label: string, name: string) => {
    doc.moveTo(x, sigY).lineTo(x + sigW, sigY).strokeColor(MUTED).lineWidth(0.75).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label.toUpperCase(), x, sigY + 5, { width: sigW, characterSpacing: 0.8 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text(name, x, sigY + 17, { width: sigW });
  };
  sig(left, 'Prepared by', expense.recordedBy);
  sig(right - sigW, 'Approved by', expense.approvedBy ?? '');

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // The footer sits inside the bottom margin; without this PDFKit starts a new page for it.
    doc.page.margins.bottom = 0;
    doc.moveTo(left, pageH - 48).lineTo(right, pageH - 48).strokeColor(RULE).lineWidth(0.75).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5);
    doc.text(company.footer ?? company.name, left, pageH - 40, { width: width - 70, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, right - 60, pageH - 40, { width: 60, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}
